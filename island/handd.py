#!/usr/bin/env python3
"""PC hand daemon — drive the OS cursor with your hand, no mouse needed.

Reuses vendor/hand-gesture-pc (HandDetector + hand_landmarker.task).
Gestures (VMouse-compatible):
  index only          → move cursor
  pinch < 0.5s        → tap (click) — also taps files/shots in the island
  pinch hold >= 0.5s  → grab (mouse down); release = drop.
                        Drag a file onto the island window and it attaches,
                        then ask steroids about it in chat.
  fist hold 1s        → exit daemon

Run:  python3 island/handd.py [--camera 0] [--no-preview]
Needs: pip install mediapipe pynput numpy opencv-python
"""

import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(os.path.dirname(HERE), "vendor", "hand-gesture-pc")

PINCH_PX = 40          # thumb-index distance = pinch (tune: smaller = stricter)
DRAG_HOLD_S = 0.5      # pinch longer than this grabs instead of tapping
EXIT_HOLD_S = 1.0      # fist this long exits
SMOOTH = 0.5           # cursor lerp; higher = snappier


def load_frame_region():
    cfg = os.path.join(VENDOR, "gesture_config.json")
    try:
        c = json.load(open(cfg))
        return (c["frame_x"], c["frame_y"], c["frame_w"], c["frame_h"])
    except Exception:
        return (100, 100, 440, 300)


def screen_size():
    w = int(os.environ.get("HANDD_W", "0"))
    h = int(os.environ.get("HANDD_H", "0"))
    if w > 0 and h > 0:
        return w, h
    try:
        import tkinter
        r = tkinter.Tk()
        r.withdraw()
        w, h = r.winfo_screenwidth(), r.winfo_screenheight()
        r.destroy()
        return w, h
    except Exception:
        return 1920, 1080  # ponytail: override with HANDD_W/HANDD_H if wrong


def decide(prev, fingers, pinch, now):
    """Pure gesture state machine. Returns (event, state).

    events: move | tap-down | tap-up | drag-start | drag-stop | exit | none
    state: dict kept between frames (dragging, pinch_since, fist_since, exited)
    """
    st = dict(prev)
    if fingers == [0, 0, 0, 0, 0]:
        if not st.get("fist_since"):
            st["fist_since"] = now
        if now - st["fist_since"] >= EXIT_HOLD_S:
            st["exited"] = True
            return "exit", st
        return "none", st
    st["fist_since"] = 0.0

    if pinch:
        if not st.get("pinch_since"):
            st["pinch_since"] = now
            return "tap-down", st
        if not st.get("dragging") and now - st["pinch_since"] >= DRAG_HOLD_S:
            st["dragging"] = True
            return "drag-start", st
        return "none", st

    # released
    if st.get("dragging"):
        st["dragging"] = False
        st["pinch_since"] = 0.0
        return "drag-stop", st
    if st.get("pinch_since"):
        st["pinch_since"] = 0.0
        return "tap-up", st
    if fingers == [0, 1, 0, 0, 0]:
        return "move", st
    return "none", st


def map_to_screen(fx, fy, cam_w, cam_h, scr_w, scr_h, region):
    rx, ry, rw, rh = region
    nx = min(1.0, max(0.0, (fx - rx) / rw))
    ny = min(1.0, max(0.0, (fy - ry) / rh))
    _ = (cam_w, cam_h)
    return int(nx * scr_w), int(ny * scr_h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--no-preview", action="store_true")
    args = ap.parse_args()

    sys.path.insert(0, VENDOR)
    import cv2  # noqa: E402
    from hand_tracker import HandDetector  # noqa: E402
    from pynput.mouse import Button, Controller  # noqa: E402

    region = load_frame_region()
    scr_w, scr_h = screen_size()
    mouse = Controller()
    detector = HandDetector()
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("handd: no camera — check /dev/video0 or --camera N")
        return 2

    st: dict = {}
    px, py = scr_w // 2, scr_h // 2
    print(f"handd: live {scr_w}x{scr_h} — index moves, pinch taps/drags, fist exits")
    while True:
        ok, img = cap.read()
        if not ok:
            break
        img = cv2.flip(img, 1)
        img = detector.find_hands(img, draw=not args.no_preview)
        lm_list, _ = detector.find_position(img, draw=False)
        now = time.time()
        if lm_list:
            fingers = detector.fingers_up()
            length, *_ = detector.find_distance(4, 8, img, draw=False)
            pinch = length < PINCH_PX
            ev, st = decide(st, fingers, pinch, now)
            _, fx, fy, *_ = lm_list[8]
            tx, ty = map_to_screen(fx, fy, img.shape[1], img.shape[0], scr_w, scr_h, region)
            px += (tx - px) * SMOOTH
            py += (ty - py) * SMOOTH
            mouse.position = (int(px), int(py))
            if ev == "tap-up":
                mouse.click(Button.left, 1)
            elif ev == "drag-start":
                mouse.press(Button.left)
            elif ev == "drag-stop":
                mouse.release(Button.left)
            elif ev == "exit":
                break
        if not args.no_preview:
            cv2.imshow("handd — fist 1s exits", img)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    try:
        from pynput.mouse import Button as _B
        mouse.release(_B.left)
    except Exception:
        pass
    cap.release()
    cv2.destroyAllWindows()
    return 0


def selftest():
    """Synthetic gesture test — no camera needed."""
    st: dict = {}
    t = 1000.0
    ev, st = decide(st, [0, 1, 0, 0, 0], False, t)
    assert ev == "move", ev
    ev, st = decide(st, [1, 1, 0, 0, 0], True, t + 0.1)   # pinch down
    assert ev == "tap-down", ev
    ev, st = decide(st, [1, 1, 0, 0, 0], False, t + 0.2)  # quick release
    assert ev == "tap-up", ev
    ev, st = decide(st, [1, 1, 0, 0, 0], True, t + 0.3)   # pinch again…
    assert ev == "tap-down", ev
    ev, st = decide(st, [1, 1, 0, 0, 0], True, t + 0.9)   # …held past 0.5s
    assert ev == "drag-start", ev
    ev, st = decide(st, [1, 1, 0, 0, 0], False, t + 1.0)  # release
    assert ev == "drag-stop", ev
    ev, st = decide(st, [0, 0, 0, 0, 0], False, t + 1.1)  # fist appears
    assert ev == "none", ev
    ev, st = decide(st, [0, 0, 0, 0, 0], False, t + 2.2)  # fist held 1s+
    assert ev == "exit" and st.get("exited"), ev
    x, y = map_to_screen(100 + 220, 100 + 150, 640, 480, 1920, 1080, (100, 100, 440, 300))
    assert (x, y) == (960, 540), (x, y)
    print("handd selftest: move/tap/drag/exit/map OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        sys.exit(main())
