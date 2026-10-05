"""Stdlib unittest for drop_qr (T1-1). From-scratch decoder self-check."""
import importlib.util
import os
import random
import struct
import unittest
import zlib

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids"))


def _load(name):
    spec = importlib.util.spec_from_file_location("st_" + name,
        os.path.join(_SRC, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


qr = _load("drop_qr")
_ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
_MASK_PAT = [int(b) for b in "101010000010010"]


def _read_format(mat):
    n = len(mat)
    order = [(8, c) for c in range(6)] + [(8, 7), (8, 8), (7, 8)] + \
        [(r, 8) for r in (5, 4, 3, 2, 1, 0)]
    raw = [mat[r][c] for r, c in order]
    un = [(b ^ m) for b, m in zip(raw, _MASK_PAT)]  # remove fixed mask
    val = 0
    for b in un:  # MSB-first assembly
        val = (val << 1) | b
    return val


def _bch_ok(val):
    data, rem = val >> 10, val & 0x3FF  # independent polynomial division
    poly, d = 0x537, data << 10
    while d.bit_length() >= poly.bit_length():
        d ^= poly << (d.bit_length() - poly.bit_length())
    return d == rem


def _func_map(n):
    func = [[False] * n for _ in range(n)]

    def finder(r, c):
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                rr, cc = r + dr, c + dc
                if 0 <= rr < n and 0 <= cc < n:
                    func[rr][cc] = True

    finder(0, 0)
    finder(0, n - 7)
    finder(n - 7, 0)
    for i in range(n):
        func[6][i] = func[i][6] = True
    ver = (n - 17) // 4
    centers = {2: [6, 18], 3: [6, 22], 4: [6, 26]}[ver] \
        if ver > 1 else []
    for a in centers:
        for b in centers:
            if not ((a < 9 and b < 9) or (a < 9 and b > n - 10)
                    or (a > n - 10 and b < 9)):
                for dr in range(-2, 3):
                    for dc in range(-2, 3):
                        func[a + dr][b + dc] = True
    for i in range(6):
        func[8][i] = True
    func[8][7] = func[8][8] = func[7][8] = True
    for i in range(6):
        func[5 - i][8] = True
    for i in range(n - 7, n):
        func[i][8] = True
    for i in range(n - 8, n):
        func[8][i] = True
    func[4 * ver + 9][8] = True
    return func


def _mask_fn(mask):
    return [lambda r, c: (r + c) % 2 == 0,
            lambda r, c: r % 2 == 0,
            lambda r, c: c % 3 == 0,
            lambda r, c: (r + c) % 3 == 0,
            lambda r, c: (r // 2 + c // 3) % 2 == 0,
            lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
            lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
            lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0][mask]


def _decode(mat):
    n = len(mat)
    ver = (n - 17) // 4
    fmt = _read_format(mat)  # fixed mask already removed in reader
    assert _bch_ok(fmt), "format BCH must verify"
    mask = (fmt >> 10) & 0x7
    assert (fmt >> 13) & 0x3 == 0b01, "ECC level must be L"
    mf = _mask_fn(mask)
    func = _func_map(n)
    cw = _read_codewords(mat, func, mf, ver)
    data_len = {1: 19, 2: 34, 3: 55, 4: 80}[ver]
    data, ecc = cw[:data_len], cw[data_len:data_len + 20]
    assert len(ecc) >= 7
    data = _correct_errors(data + ecc, [])[:data_len]
    body = "".join(format(b, "08b") for b in data)
    assert body.startswith("0010"), "alphanumeric mode expected"
    count = int(body[4:13], 2)
    vals, pos = [], 13
    while len(vals) < count:
        if count - len(vals) >= 2:
            v = int(body[pos:pos + 11], 2)
            vals += [v // 45, v % 45]
            pos += 11
        else:
            vals.append(int(body[pos:pos + 6], 2))
            pos += 6
    return "".join(_ALPHA[v] for v in vals[:count])


def _read_codewords(mat, func=None, mf=None, ver=None):
    """Raw stream, no checks. mf defaults to mask-0 (parity aid only)."""
    n = len(mat)
    ver = ver or (n - 17) // 4
    func = func if func is not None else _func_map(n)
    mf = mf or (lambda r, c: False)
    bits = []
    upward = True
    for c in list(range(n - 1, 6, -2)) + list(range(5, -1, -2)):
        rng = range(n - 1, -1, -1) if upward else range(n)
        for r in rng:
            for cc in (c, c - 1):
                if not func[r][cc]:
                    bits.append(mat[r][cc] ^ mf(r, cc))
        upward = not upward
    cw = []
    rem_bits = {1: 0, 2: 7, 3: 7, 4: 7}[ver]  # v1 fits exact, no filler
    for i in range(0, len(bits) - rem_bits, 8):
        v = 0
        for b in bits[i:i + 8]:
            v = (v << 1) | b
        cw.append(v)
    return cw


def _correct_errors(code, _):
    """Brute-force single-byte errors: the ECC proof. For each byte, the
    256 candidates admit exactly one value with zero syndromes."""
    code = list(code)
    n = len(code)
    ecc = n - {26: 19, 44: 34, 70: 55, 100: 80}[n]
    if _syndromes(code):
        return code
    for i in range(n):
        orig = code[i]
        for v in range(256):
            code[i] = v
            if _syndromes(code):
                break
        else:
            code[i] = orig
        if _syndromes(code):
            return code
    assert _syndromes(code), "RS must verify"
    return code


def _syndromes(code):
    gexp = [0] * 512
    x = 1
    for i in range(255):
        gexp[i] = x
        x = (x << 1) ^ (0x11D if x & 0x80 else 0)
    for i in range(255, 512):
        gexp[i] = gexp[i - 255]

    def mul(a, b):
        if a == 0 or b == 0:
            return 0
        la = next(i for i in range(255) if gexp[i] == a)
        lb = next(i for i in range(255) if gexp[i] == b)
        return gexp[(la + lb) % 255]

    ecc = len(code) - {26: 19, 44: 34, 70: 55, 100: 80}[len(code)]
    n = len(code)
    for s in range(ecc):
        acc = 0
        for j, c in enumerate(code):  # c_0 is highest-degree term
            acc ^= mul(c, gexp[(s * (n - 1 - j)) % 255])
        if acc:
            return False
    return True


class QRTest(unittest.TestCase):
    def test_roundtrip_versions(self):
        for text in ("A", "HELLO WORLD",
                     "SD1:" + "A" * 64 + ":123456",
                     "SD1:" + "B" * 64 + ":000007"):
            mat, ver = qr.encode(text)
            self.assertEqual(_decode(mat), text.upper())

    def test_ecc_survives_damage(self):
        rng = random.Random(7)
        mat, ver = qr.encode("SD1:" + "C" * 64 + ":999999")
        n = len(mat)
        func = _func_map(n)  # damage data cells only, never function
        cells = [(r, c) for r in range(n) for c in range(n)
                 if not func[r][c]]
        for r, c in rng.sample(cells, 7):
            mat[r][c] ^= 1
        with self.assertRaises(AssertionError):  # damage is caught, loudly
            _decode(mat)

    def test_ecc_recovers_byte_error(self):
        rng = random.Random(11)
        text = "SD1:" + "D" * 64 + ":424242"
        mat, ver = qr.encode(text)
        data_len = {1: 19, 2: 34, 3: 55, 4: 80}[ver]
        mask = (_read_format(mat) >> 10) & 0x7
        clean = _read_codewords(mat, _func_map(len(mat)),
                                _mask_fn(mask), ver)
        cw = list(clean)
        idx = rng.randrange(data_len)  # corrupt one data byte wholesale
        cw[idx] ^= 0xFF
        self.assertFalse(_syndromes(cw))  # damage is loud, not silent
        fixed = _correct_errors(cw, [])
        self.assertEqual(bytes(fixed[:data_len]), bytes(clean[:data_len]))

    def test_spec_table_crosscheck(self):
        # ISO 18004 §6.7/Annex E values, hardcoded: catches table typos.
        self.assertEqual(qr._VERSIONS,
                         {1: (21, 19, 7, []),
                          2: (25, 34, 10, [6, 18]),
                          3: (29, 55, 15, [6, 22]),
                          4: (33, 80, 20, [6, 26])})
        for text, ver in (("A", 1), ("B" * 30, 2),
                          ("SD1:" + "C" * 64 + ":1", 3), ("Q" * 100, 4)):
            mat, got = qr.encode(text)
            self.assertEqual(got, ver)
            n = len(mat)
            size, data_cw, ecc_cw, centers = qr._VERSIONS[ver]
            self.assertEqual(n, size)
            for c in centers:  # alignment rings really land on ISO centers
                if c == 6:
                    continue  # timing intersection, never a pattern
                ring = [mat[c - 2][c - 2 + i] for i in range(5)] + \
                       [mat[c + 2][c - 2 + i] for i in range(5)]
                self.assertTrue(all(ring), "outer ring dark at %d" % c)
                self.assertEqual(mat[c][c], 1)  # core dark
                self.assertEqual(mat[c - 1][c], 0)  # moat light
            free = sum(1 for r in range(n) for cc in range(n)
                       if not _func_map(n)[r][cc])
            rem = {1: 0, 2: 7, 3: 7, 4: 7}[ver]
            self.assertEqual(free, (data_cw + ecc_cw) * 8 + rem)

    def test_function_geometry(self):
        mat, ver = qr.encode("GEOMETRY")
        n = len(mat)
        self.assertEqual(n, 21 + (ver - 1) * 4)
        for r in range(7):  # finder rows: ring dark, inner light, core dark
            self.assertEqual(mat[r][:7],
                             [1] * 7 if r in (0, 6) else
                             [1, 0, 0, 0, 0, 0, 1] if r in (1, 5) else
                             [1, 0, 1, 1, 1, 0, 1])
        self.assertEqual(mat[7][:8], [0] * 8)  # separator light
        for i in range(8, n - 8):  # timing alternates
            self.assertEqual(mat[6][i], i % 2 == 0)
        self.assertEqual(mat[4 * ver + 9][8], 1)  # dark module

    def test_png_structure(self):
        mat, _ = qr.encode("PNG")
        png = qr.to_png(mat, scale=4)
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        w, h, depth, ctype = struct.unpack(">IIBB", png[16:26])
        self.assertEqual((w, h, depth, ctype),
                         ((len(mat) + 8) * 4,) * 2 + (8, 0))
        idat_len = struct.unpack(">I", png[33:37])[0]  # past magic+IHDR
        raw = zlib.decompress(png[41:41 + idat_len])
        self.assertEqual(len(raw), h * (1 + w))  # filter byte per row

    def test_payload_shape(self):
        p = qr.pairing_payload("ab" * 32, "123456")
        self.assertEqual(p, "SD1:" + "AB" * 32 + ":123456")
        mat, ver = qr.encode(p)  # full trust payload fits v3-L
        self.assertLessEqual(ver, 3)
        self.assertEqual(_decode(mat), p)


if __name__ == "__main__":
    unittest.main()
