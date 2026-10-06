#!/usr/bin/env python3
"""Gaze daemon — eyes point, pinch clicks (Vision-Pro style, webcam only).

Moves the OS cursor from your gaze; pinch state reuses island/handd.py
gestures (quick pinch = click, hold = drag, fist 1s = exit), so the
clicker you already trained keeps working.
Needs: pip install mediapipe numpy opencv-python pynput
Model: vendor/hand-gesture-pc/face_landmarker.task (net once, ~4MB).

Run:  python3 island/gazed.py [--camera 0] [--no-preview]
No dots by default: relative mode steers the cursor from gaze deltas
instantly (look somewhere to drift there, look at the cursor to stop).
Double-blink clicks, long blink (~1s) recenters, pinch works too,
hold drags, fist exits.
For absolute point-accuracy: --recalibrate runs the 9-dot fit once and
saves it; rerun without flags to use it. Gaze is head-relative either
way, so keep your head roughly still.
"""

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(os.path.dirname(HERE), "vendor", "hand-gesture-pc")
MODEL = os.path.join(VENDOR, "face_landmarker.task")
CALIB = os.path.join(os.path.expanduser("~/.config/steroids"),
                     "gaze_calib.json")
FRAME = os.path.join(os.path.expanduser("~/.config/steroids"),
                     "gaze_frame.jpg")

sys.path.insert(0, HERE)
import handd  # noqa: E402  (screen_size + pinch state machine, unit-tested)

SMOOTH = 0.4  # gaze lerp; lower = steadier (jitter is higher than hands)
REL_DEADZONE = 0.04  # gaze deltas below this hold the cursor still
REL_STEP = 110.0    # px per frame at full deflection (~30fps => ~2400px/s)
REL_MAX_STEP = 80.0  # clamp per-frame jump
REL_BASELINE = 0.02  # slow drift-follow for the resting gaze point
GRID = (0.12, 0.5, 0.88)  # 3x3 calibration dots, fraction of screen


def gaze_features(blends):
    """(fx, fy) in ~[-1,1] from eye-look blendshapes. Screen right = +fx."""
    s = {b.category_name: float(b.score) for b in blends}
    r_out = s.get("eyeLookOutRight", 0.0)
    r_in = s.get("eyeLookInRight", 0.0)
    l_out = s.get("eyeLookOutLeft", 0.0)
    l_in = s.get("eyeLookInLeft", 0.0)
    up = (s.get("eyeLookUpLeft", 0.0) + s.get("eyeLookUpRight", 0.0)) / 2
    down = (s.get("eyeLookDownLeft", 0.0) + s.get("eyeLookDownRight", 0.0)) / 2
    fx = ((r_out - r_in) + (l_in - l_out)) / 2.0
    fy = down - up  # screen y grows downward
    return fx, fy


def blink_score(blends):
    """0..1 both-eyes-closed from blendshapes (0 = open). Never throws."""
    try:
        s = {b.category_name: float(b.score) for b in blends}
        return (s.get("eyeBlinkLeft", 0.0) + s.get("eyeBlinkRight", 0.0)) / 2
    except Exception:
        return 0.0


DOUBLE_BLINK_S = 0.7  # second shut inside this window = click
BLINK_SHUT = 0.5  # closed score above this counts as shut
BLINK_MAX_S = 0.45  # longer closures are naps, not blinks
LONG_BLINK_S = 0.9  # ...this long a shut recenters instead (rescue gesture)
BLINK_MARGIN = 0.25  # shut = score this far above your open-eye average


def blink_event(st, shut, now):
    """Pure blink machine. Returns ((event), state); event: click/recenter/none."""
    st = dict(st)
    if shut and not st.get("shut"):
        st["shut"] = True
        st["since"] = now
    elif not shut and st.get("shut"):
        st["shut"] = False
        dur = now - st.get("since", 0.0)
        if dur >= LONG_BLINK_S:
            st["pending"] = 0.0
            return "recenter", st
        if dur < BLINK_MAX_S:
            if st.get("pending") and now - st["pending"] < DOUBLE_BLINK_S:
                st["pending"] = 0.0
                return "click", st
            st["pending"] = now
    if st.get("pending") and now - st["pending"] >= DOUBLE_BLINK_S + 0.2:
        st["pending"] = 0.0
    return "none", st


def fit_affine(samples):
    """Least-squares 2x3 map from (fx, fy) to screen px. Never throws."""
    import numpy as np
    a = np.array([[fx, fy, 1.0] for fx, fy, _, _ in samples], dtype=float)
    b = np.array([[sx, sy] for _, _, sx, sy in samples], dtype=float)
    m, *_ = np.linalg.lstsq(a, b, rcond=None)
    return m.tolist()  # 3 rows x 2 cols


def apply_affine(m, fx, fy):
    """Pure-python predict (no numpy at pointer speed)."""
    x = m[0][0] * fx + m[1][0] * fy + m[2][0]
    y = m[0][1] * fx + m[1][1] * fy + m[2][1]
    return x, y


def load_calib():
    try:
        c = json.load(open(CALIB))
        m = c["matrix"]
        assert len(m) == 3 and len(m[0]) == 2
        return m
    except Exception:
        return None


def save_calib(m):
    try:
        os.makedirs(os.path.dirname(CALIB), exist_ok=True)
        json.dump({"matrix": m, "ts": time.time()}, open(CALIB, "w"))
    except Exception:
        pass


def make_landmarker():
    from mediapipe.tasks import python as tmp
    from mediapipe.tasks.python import vision
    opts = vision.FaceLandmarkerOptions(
        base_options=tmp.BaseOptions(model_asset_path=MODEL),
        output_face_blendshapes=True,
        num_faces=1,
        running_mode=vision.RunningMode.VIDEO)
    return vision.FaceLandmarker.create_from_options(opts)


def median(feats):
    import numpy as np
    a = np.array(feats, dtype=float)
    return float(np.median(a[:, 0])), float(np.median(a[:, 1]))


def draw_dot(img, x, y, done):
    import cv2
    color = (0, 255, 0) if done else (0, 0, 255)
    cv2.circle(img, (x, y), 18, color, -1)
    cv2.circle(img, (x, y), 26, (255, 255, 255), 2)


def calibrate(cap, faces, hands, scr_w, scr_h, preview):
    """9 dots, stare ~1s each (pinch confirms instantly). Matrix or None."""
    import cv2
    import math
    import numpy as np
    pts = [(int(gx * scr_w), int(gy * scr_h)) for gy in GRID for gx in GRID]
    samples = []
    frame = 0
    for i, (sx, sy) in enumerate(pts):
        buf = []
        hst = {}
        ref = None
        steady_since = 0.0
        while True:
            ok, img = cap.read()
            if not ok:
                return None
            frame += 1
            ts = frame * 33
            now = time.time()
            res = faces.detect_for_video(
                __import__("mediapipe").Image(
                    image_format=__import__("mediapipe").ImageFormat.SRGB,
                    data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), ts)
            face_now = bool(res.face_blendshapes)
            if face_now:
                f = gaze_features(res.face_blendshapes[0])
                buf.append(f)
                if len(buf) > 60:
                    del buf[:-60]
                # dwell confirm: steady stare 1.2s captures, no hand needed.
                if ref is None or math.hypot(f[0] - ref[0], f[1] - ref[1]) > 0.05:
                    ref, steady_since = f, now
                elif now - steady_since >= 1.2 and len(buf) >= 8:
                    m = median(buf[-15:])
                    samples.append((*m, sx, sy))
                    print("gazed: dot %d/9 captured (%.3f, %.3f)" %
                          (len(samples), m[0], m[1]), flush=True)
                    break
            himg = hands.find_hands(img, draw=False)
            lm, _ = hands.find_position(himg, draw=False)
            if lm:
                fingers = hands.fingers_up()
                length, *_ = hands.find_distance(4, 8, himg, draw=False)
                ev, hst = handd.decide(hst, fingers, length < handd.PINCH_PX,
                                       now)
                if ev == "tap-up" and buf:
                    samples.append((*median(buf[-15:]), sx, sy))
                    break
                if ev == "exit":
                    return None
            if preview:
                canvas = np.zeros((scr_h, scr_w, 3), dtype=np.uint8)
                for j, (px, py) in enumerate(pts):
                    if j < len(samples):
                        draw_dot(canvas, px, py, True)
                    elif j == i:
                        draw_dot(canvas, px, py, False)
                cv2.putText(canvas, "stare at the dot %d/9 (or pinch, q quits)" % (len(samples) + 1),
                            (40, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.2,
                            (255, 255, 255), 2)
                if not face_now:
                    cv2.putText(canvas, "no face — look at the camera",
                                (40, 120), cv2.FONT_HERSHEY_SIMPLEX, 1.0,
                                (0, 255, 255), 2)
                cv2.imshow("gazed — calibrate", canvas)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    return None
            elif not buf and frame % 30 == 0:
                print("gazed: no face — look at the camera", flush=True)
    if preview:
        cv2.destroyWindow("gazed — calibrate")
    m = fit_affine(samples)
    import numpy as np
    err = np.mean([abs(apply_affine(m, fx, fy)[0] - sx) + abs(apply_affine(m, fx, fy)[1] - sy)
                   for fx, fy, sx, sy in samples]) / 2
    print("gazed: fit mean error %.0fpx over %d dots" % (err, len(samples)), flush=True)
    save_calib(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--no-preview", action="store_true")
    ap.add_argument("--recalibrate", action="store_true")
    ap.add_argument("--relative", action="store_true",
                    help="force relative steering even if calibrated")
    args = ap.parse_args()

    if not os.path.isfile(MODEL):
        print("gazed: model missing — downloading face_landmarker.task")
        import urllib.request
        try:
            urllib.request.urlretrieve(
                "https://storage.googleapis.com/mediapipe-models/"
                "face_landmarker/face_landmarker/float16/1/"
                "face_landmarker.task", MODEL)
        except Exception as e:
            print("gazed: download failed: %s" % e)
            return 3
    if args.recalibrate and args.no_preview:
        print("gazed: calibration needs a screen (drop --no-preview)")
        return 4

    sys.path.insert(0, VENDOR)
    import cv2  # noqa: E402
    from hand_tracker import HandDetector  # noqa: E402
    from pynput.mouse import Button, Controller  # noqa: E402

    scr_w, scr_h = handd.screen_size()
    mouse = Controller()
    faces = make_landmarker()
    hands = HandDetector()
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("gazed: no camera — check /dev/video0 or --camera N")
        return 2
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # latest frame, never stale
    except Exception:
        pass

    matrix = None if (args.recalibrate or args.relative) else load_calib()
    if matrix is None and args.recalibrate:
        if args.no_preview:
            print("gazed: calibration needs a screen (drop --no-preview)")
            return 4
        matrix = calibrate(cap, faces, hands, scr_w, scr_h,
                           not args.no_preview)
        if matrix is None:
            cap.release()
            cv2.destroyAllWindows()
            return 0
        print("gazed: calibrated — look moves, pinch clicks, fist exits")
    mode = "absolute" if matrix is not None else "relative"

    import mediapipe as mp
    st = {}
    bst = {}
    px, py = scr_w // 2, scr_h // 2
    bx, by = None, None  # neutral gaze point, seeded from the user live
    seed_buf = []
    bb = 0.0  # your open-eye blink average (shut = well above this)
    frame = 0
    if mode == "relative":
        print("gazed: live %dx%d relative — steer with your eyes, "
              "look at the cursor to stop, pinch or double-blink clicks"
              % (scr_w, scr_h), flush=True)
    else:
        print(f"gazed: live {scr_w}x{scr_h} — eyes point, "
              "pinch or double-blink clicks", flush=True)
    while True:
        ok, img = cap.read()
        if not ok:
            break
        frame += 1
        ts = frame * 33
        now = time.time()
        res = faces.detect_for_video(
            mp.Image(image_format=mp.ImageFormat.SRGB,
                     data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), ts)
        if res.face_blendshapes:
            fx, fy = gaze_features(res.face_blendshapes[0])
            if bx is None:
                # seed neutral from the first second of looking (holds still
                # meanwhile). Your resting gaze is never (0,0) — assuming it
                # was is what pinned the cursor to the screen edge.
                bx, by = fx, fy
                seed_buf.append((fx, fy))
                if len(seed_buf) >= 30:
                    bx, by = median(seed_buf)
                    print("gazed: neutral (%.3f, %.3f) — steering live" %
                          (bx, by), flush=True)
            elif mode == "absolute":
                tx, ty = apply_affine(matrix, fx, fy)
                tx = min(max(tx, 0), scr_w - 1)
                ty = min(max(ty, 0), scr_h - 1)
                px += (tx - px) * SMOOTH
                py += (ty - py) * SMOOTH
            else:
                # relative steering: drift from the resting point, deadzone
                # holds still. Baseline only learns while centered, so a
                # sustained look keeps driving instead of fading out.
                vx_raw, vy_raw = fx - bx, fy - by
                if abs(vx_raw) < REL_DEADZONE and abs(vy_raw) < REL_DEADZONE:
                    bx += (fx - bx) * REL_BASELINE
                    by += (fy - by) * REL_BASELINE
                    vx, vy = 0.0, 0.0
                else:
                    vx, vy = vx_raw, vy_raw
                px += min(max(vx * REL_STEP, -REL_MAX_STEP), REL_MAX_STEP)
                py += min(max(vy * REL_STEP, -REL_MAX_STEP), REL_MAX_STEP)
                px = min(max(px, 0), scr_w - 1)
                py = min(max(py, 0), scr_h - 1)
            if bx is not None:
                b = blink_score(res.face_blendshapes[0])
                bb += (b - bb) * 0.03
                shut = b > bb + BLINK_MARGIN and b > 0.15
                evb, bst = blink_event(bst, shut, now)
                if evb == "click":
                    mouse.click(Button.left, 1)
                    print("gazed: double-blink click", flush=True)
                elif evb == "recenter":
                    bx, by = fx, fy
                    print("gazed: recentered (%.3f, %.3f)" % (bx, by),
                          flush=True)
            mouse.position = (int(px), int(py))
            if frame % 60 == 0:
                print("gazed: feat fx=%.3f fy=%.3f blink=%.2f cursor=%d,%d" %
                      (fx, fy, blink_score(res.face_blendshapes[0]),
                       int(px), int(py)), flush=True)
        himg = hands.find_hands(img, draw=True)
        lm, _ = hands.find_position(himg, draw=False)
        if lm:
            fingers = hands.fingers_up()
            length, *_ = hands.find_distance(4, 8, himg, draw=False)
            ev, st = handd.decide(st, fingers, length < handd.PINCH_PX, now)
            if ev == "tap-up":
                mouse.click(Button.left, 1)
            elif ev == "drag-start":
                mouse.press(Button.left)
            elif ev == "drag-stop":
                mouse.release(Button.left)
            elif ev == "exit":
                break
        # self-view for the lens page (served at /gaze-frame): every frame,
        # camera already 640 wide so no resize step.
        try:
            cv2.imwrite(FRAME, himg, [int(cv2.IMWRITE_JPEG_QUALITY), 78])
        except Exception:
            pass
        if not args.no_preview:
            cv2.imshow("gazed — fist 1s exits", himg)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    try:
        mouse.release(Button.left)
    except Exception:
        pass
    cap.release()
    cv2.destroyAllWindows()
    return 0


def selftest():
    """No camera needed: features, affine recovery, calib roundtrip."""
    import tempfile
    from types import SimpleNamespace
    B = lambda n, s: SimpleNamespace(category_name=n, score=s)  # noqa: E731
    fx, fy = gaze_features([B("eyeLookOutRight", 0.8), B("eyeLookInRight", 0.1),
                            B("eyeLookOutLeft", 0.1), B("eyeLookInLeft", 0.8),
                            B("eyeLookUpLeft", 0.0), B("eyeLookUpRight", 0.0),
                            B("eyeLookDownLeft", 0.5), B("eyeLookDownRight", 0.5)])
    assert abs(fx - 0.7) < 1e-9, (fx, fy)  # looking right-down
    assert abs(fy - 0.5) < 1e-9, (fx, fy)
    import numpy as np
    rng = np.random.default_rng(7)
    m_true = np.array([[900.0, -40.0], [60.0, 700.0], [960.0, 540.0]])
    feats = rng.uniform(-0.6, 0.6, size=(12, 2))
    samples = [(x, y, float(x * 900 + y * 60 + 960 + rng.normal(0, 2)),
                float(x * -40 + y * 700 + 540 + rng.normal(0, 2)))
               for x, y in feats]
    m = np.array(fit_affine(samples))
    assert np.allclose(m, m_true, atol=15), m  # recovers map through noise
    x, y = apply_affine(m.tolist(), 0.1, -0.2)
    assert abs(x - (0.1 * 900 - 0.2 * 60 + 960)) < 15, (x, y)
    global CALIB
    old, fd = CALIB, tempfile.mkstemp(suffix=".json")[1]
    try:
        CALIB = fd
        save_calib(m.tolist())
        assert load_calib() == m.tolist()
    finally:
        CALIB = old
        os.unlink(fd)
    st = {}
    ev, st = handd.decide(st, [0, 1, 0, 0, 0], False, 1.0)
    assert ev == "move", ev
    assert blink_score([B("eyeBlinkLeft", 0.9),
                        B("eyeBlinkRight", 0.7)]) == 0.8
    bs = {}
    e, bs = blink_event(bs, False, 1.0)   # open
    assert e == "none"
    e, bs = blink_event(bs, True, 1.1)    # shut
    assert e == "none"
    e, bs = blink_event(bs, False, 1.25)  # blink 1 ends
    assert e == "none"
    e, bs = blink_event(bs, True, 1.5)    # shut again fast
    assert e == "none"
    e, bs = blink_event(bs, False, 1.65)  # blink 2 ends = double
    assert e == "click", bs
    e, bs = blink_event({}, False, 2.0)
    assert e == "none"
    e, bs = blink_event(bs, True, 2.1)
    assert e == "none"
    e, bs = blink_event(bs, False, 2.25)  # single blink, no click
    assert e == "none"
    e, bs = blink_event(bs, True, 5.0)   # way too late — not a double
    assert e == "none"
    e, bs = blink_event(bs, False, 5.2)
    assert e == "none", bs
    e, bs = blink_event({}, True, 6.0)    # long shut...
    assert e == "none"
    e, bs = blink_event(bs, False, 7.2)   # ...opens after 1.2s = recenter
    assert e == "recenter", bs
    print("gazed selftest: features/affine/calib/pinch-reuse/blink OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        sys.exit(main())
