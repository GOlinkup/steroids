#!/usr/bin/env python3
"""Steroids drop QR — minimal encoder (byte + alphanumeric, ECC-L, v1-4).

The QR carries trust only (fingerprint + PIN); the endpoint arrives via
multicast announce (or manual entry on hostile networks). Keeping the
payload alphanumeric-upper keeps it in v3-L. PNG writer is zlib+struct,
~25 lines, no imaging dep.
"""
import struct
import zlib

# version -> (size, data_codewords, ecc_codewords, alignment_centers)
_VERSIONS = {
    1: (21, 19, 7, []),
    2: (25, 34, 10, [6, 18]),
    3: (29, 55, 15, [6, 22]),
    4: (33, 80, 20, [6, 26]),
}
_ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
_GEXP = [0] * 512
_GLOG = [0] * 256


def _init_gf():
    x = 1
    for i in range(255):
        _GEXP[i] = x
        _GLOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        _GEXP[i] = _GEXP[i - 255]


_init_gf()


def _gf_mul(a, b):
    return 0 if a == 0 or b == 0 else _GEXP[_GLOG[a] + _GLOG[b]]


def _rs_gen(nsym):
    gen = [1]
    for i in range(nsym):
        nxt = [0] * (len(gen) + 1)
        for j, c in enumerate(gen):
            nxt[j] ^= _gf_mul(c, _GEXP[i])
            nxt[j + 1] ^= c
        gen = nxt
    return gen


def _rs_encode(data, nsym):
    gen = _rs_gen(nsym)[::-1]  # lead-first: gen[0]=1 cancels out[i]
    out = list(data) + [0] * nsym
    for i in range(len(data)):
        coef = out[i]
        if coef:
            for j in range(len(gen)):
                out[i + j] ^= _gf_mul(gen[j], coef)
    return bytes(out[len(data):])


class _Bits:
    def __init__(self):
        self.b = []

    def put(self, val, n):
        for i in range(n - 1, -1, -1):
            self.b.append((val >> i) & 1)

    def bytes(self):
        pad = (-len(self.b)) % 8
        self.b += [0] * pad
        out = bytearray()
        for i in range(0, len(self.b), 8):
            v = 0
            for bit in self.b[i:i + 8]:
                v = (v << 1) | bit
            out.append(v)
        return bytes(out)


def _encode_data(text, version, data_cw):
    upper = text.upper()
    if all(c in _ALPHA for c in upper):
        bits = _Bits()
        bits.put(0b0010, 4)
        bits.put(len(upper), 9)
        i = 0
        while i + 1 < len(upper):
            bits.put(_ALPHA.index(upper[i]) * 45 + _ALPHA.index(upper[i + 1]),
                     11)
            i += 2
        if i < len(upper):
            bits.put(_ALPHA.index(upper[i]), 6)
        raw, mode = upper, "alphanumeric"
    else:
        raw = text.encode("utf-8")
        bits = _Bits()
        bits.put(0b0100, 4)
        bits.put(len(raw), 8)
        for ch in raw:
            bits.put(ch, 8)
        mode = "byte"
    cap = data_cw * 8
    if len(bits.b) > cap:
        raise ValueError("payload too long for v%d" % version)
    bits.put(0, min(4, cap - len(bits.b)))  # terminator
    data = bytearray(bits.bytes())
    alt = (0xEC, 0x11)
    k = 0
    while len(data) < data_cw:  # pad codewords
        data.append(alt[k % 2])
        k += 1
    return bytes(data), mode


def _build_matrix(text):
    for version in (1, 2, 3, 4):
        size, data_cw, ecc_cw, centers = _VERSIONS[version]
        try:
            data = _encode_data(text, version, data_cw)[0]
        except ValueError:
            continue
        full = data + _rs_encode(data, ecc_cw)
        mat = [[None] * size for _ in range(size)]
        func = [[False] * size for _ in range(size)]

        def setf(r, c, v):
            mat[r][c] = v
            func[r][c] = True

        def finder(r, c):
            for dr in range(-1, 8):
                for dc in range(-1, 8):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < size and 0 <= cc < size:
                        edge = dr in (-1, 7) or dc in (-1, 7)
                        body = 0 <= dr <= 6 and 0 <= dc <= 6
                        core = 2 <= dr <= 4 and 2 <= dc <= 4
                        ring = body and not edge and (dr in (0, 6)
                                                     or dc in (0, 6))
                        setf(rr, cc, 0 if edge else (1 if ring or core
                                                    else 0))

        finder(0, 0)
        finder(0, size - 7)
        finder(size - 7, 0)
        for i in range(8, size - 8):  # timing
            setf(6, i, i % 2 == 0)
            setf(i, 6, i % 2 == 0)
        for a in centers:  # alignment
            for b in centers:
                if not ((a < 9 and b < 9) or (a < 9 and b > size - 10)
                        or (a > size - 10 and b < 9)):
                    for dr in range(-2, 3):
                        for dc in range(-2, 3):
                            setf(a + dr, b + dc,
                                 1 if max(abs(dr), abs(dc)) != 1 else 0)
        setf(4 * version + 9, 8, 1)  # dark module
        for r, c in _format_cells(size):  # reserve before data placement
            func[r][c] = True
        bits = []
        for byte in full:
            for i in range(7, -1, -1):
                bits.append((byte >> i) & 1)
        masks = [
            lambda r, c: (r + c) % 2 == 0,
            lambda r, c: r % 2 == 0,
            lambda r, c: c % 3 == 0,
            lambda r, c: (r + c) % 3 == 0,
            lambda r, c: (r // 2 + c // 3) % 2 == 0,
            lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
            lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
            lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
        ]
        best, best_pen = None, None
        for m, mf in enumerate(masks):
            trial = [row[:] for row in mat]
            bi = 0
            upward = True
            bands = list(range(size - 1, 6, -2)) + list(range(5, -1, -2))
            for c in bands:
                cols = (c, c - 1)
                rng = range(size - 1, -1, -1) if upward else range(size)
                for r in rng:
                    for cc in cols:
                        if trial[r][cc] is None and not func[r][cc]:
                            v = bits[bi] if bi < len(bits) else 0
                            bi += 1
                            trial[r][cc] = v ^ mf(r, cc)
                upward = not upward
            _write_format(trial, func, size, m)
            pen = _penalty(trial, size)
            if best_pen is None or pen < best_pen:
                best, best_pen = trial, pen
        return best, version
    raise ValueError("payload too long for v4-L")


def _format_cells(size):
    cells = [(8, c) for c in range(6)] + [(8, 7), (8, 8), (7, 8)] + \
        [(r, 8) for r in (5, 4, 3, 2, 1, 0)]
    cells += [(r, 8) for r in range(size - 7, size)]
    cells += [(8, c) for c in range(size - 8, size)]
    return cells


def _fmt_bits(mask):
    data = [0, 1] + [(mask >> i) & 1 for i in (2, 1, 0)]  # L + mask
    rem = data + [0] * 10
    for i in range(5):
        if rem[i]:
            for j in range(11):
                rem[i + j] ^= (0b10100110111 >> (10 - j)) & 1
    out = data + rem[5:15]
    mask_pat = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0]
    return [b ^ m for b, m in zip(out, mask_pat)]


def _write_format(mat, func, size, mask):
    fb = _fmt_bits(mask)
    for i in range(6):
        mat[8][i] = fb[i]
        func[8][i] = True
    mat[8][7] = fb[6]
    func[8][7] = True
    mat[8][8] = fb[7]
    func[8][8] = True
    mat[7][8] = fb[8]
    func[7][8] = True
    for i in range(6):
        mat[5 - i][8] = fb[9 + i]
        func[5 - i][8] = True
    for r in range(size - 7, size):  # copy 2: bits 6..0 bottom-up
        mat[r][8] = fb[r - size + 15]
        func[r][8] = True
    for c in range(size - 8, size):  # copy 2: bits 7..14 left-to-right
        mat[8][c] = fb[size - 1 - c]
        func[8][c] = True


def _penalty(mat, size):
    pen = 0
    for r in range(size):  # runs in rows + cols
        for line in ([mat[r][c] for c in range(size)],
                     [mat[c][r] for c in range(size)]):
            run = 1
            for i in range(1, size):
                if line[i] == line[i - 1]:
                    run += 1
                else:
                    if run >= 5:
                        pen += 3 + (run - 5)
                    run = 1
            if run >= 5:
                pen += 3 + (run - 5)
    for r in range(size - 1):  # 2x2 blocks
        for c in range(size - 1):
            v = mat[r][c]
            if mat[r][c + 1] == v == mat[r + 1][c] == mat[r + 1][c + 1]:
                pen += 3
    pat1, pat2 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], \
        [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    for r in range(size):
        for c in range(size - 10):
            row = [mat[r][c + i] for i in range(11)]
            col = [mat[c + i][r] for i in range(11)]
            for line in (row, col):
                if line == pat1 or line == pat2:
                    pen += 40
    dark = sum(sum(row) for row in mat)
    pen += abs(dark * 20 // (size * size) - 10) * 10
    return pen


def encode(text):
    """Return (matrix, version). Matrix cells are 0/1 ints."""
    return _build_matrix(text)


def pairing_payload(peer_fingerprint, pin):
    """Trust-only payload: fingerprint + PIN, endpoint via announce."""
    return "SD1:%s:%s" % (peer_fingerprint.upper(), pin)


def to_png(matrix, scale=6):
    """1-bit-look grayscale PNG (8-bit samples), quiet zone 4."""
    n = len(matrix)
    q, w = 4, n + 8
    px = bytearray()
    for r in range(-q, n + q):
        px.append(0)  # filter byte
        for c in range(-q, n + q):
            v = matrix[r][c] if 0 <= r < n and 0 <= c < n else 0
            px.extend([0] * scale if v else [255] * scale)
    rows = []
    line = 1 + w * scale
    for i in range(w):
        rows.append(bytes(px[i * line:(i + 1) * line]))
    raw = b"".join(rows[i // scale] for i in range(w * scale))
    ihdr = struct.pack(">IIBBBBB", w * scale, w * scale, 8, 0, 0, 0, 0)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw))) + chunk(b"IEND", b""))
