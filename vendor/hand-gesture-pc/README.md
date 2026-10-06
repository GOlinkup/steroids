# 🖱️ Hand Gesture Mouse Controller

Control your computer mouse entirely with hand gestures — no physical mouse needed.  
Uses **MediaPipe** for real-time hand tracking and **OpenCV** for camera input, with three interchangeable mouse-control backends.

---

##  Features

| Feature | Description |
|---|---|
| **Move Cursor** | Precise, smoothed cursor movement using your index finger |
| **Left Click** | Half-fold your index finger to click |
| **Right Click** | Raise index + middle fingers, then bring index tip close to pinky base |
| **Drag & Drop** | Hold thumb + pinky up to drag; release to drop |
| **Scroll** | Raise index + middle + ring fingers and move hand up/down |
| **Orientation Guard** | Ignores input when hand is turned or flipped (palm facing away) |
| **Smooth Movement** | Configurable smoothening factor prevents jitter |

---
## Demo

Watch a demo of the hand gesture mouse controller in action:



https://github.com/user-attachments/assets/e914f0d4-db16-4bc7-b61d-b92f7e13c1c5



## Gesture Reference

> **Finger array format:** `[Thumb, Index, Middle, Ring, Pinky]`  
> `1` = finger extended/up · `0` = finger folded/down  
> The array represents what `fingers_up()` returns for each gesture.

### Move Cursor
```
[0, 1, 0, 0, 0]  — only index finger up (fully extended, not half-folded)
```
Point your **index finger** at the camera. The cursor follows your fingertip within the active zone (the pink rectangle on screen).

---

### Left Click
```
half-closed: [0, 1, 0, 0, 0]  — index finger half-folded (bent at middle joint)
```
Slightly **curl your index finger** (don't fully fold it). The system detects the half-closed state separately from a fully extended finger, so moving and clicking don't conflict.

---

### Right Click
```
fingers_up → [0, 1, 1, 0, 0]  — index + middle fingers up
+ index fingertip brought close to pinky base (landmark 17)
```
Raise your **index and middle fingers** together, then **pinch the index tip toward the base of your pinky**. The click fires when the distance between those two points drops below 30 px.

---

### Drag & Drop
```
[0, 1, 0, 0, 1]  — index + pinky up, rest folded
```
Raise your **index finger and pinky** while keeping the other fingers down. The left mouse button is held as long as this gesture is held. Release (change gesture) to drop.

---

### Scroll
```
[0, 1, 1, 1, 0]  — index + middle + ring fingers up
```
Raise your **index, middle, and ring fingers** together. Move your hand **up** to scroll up and **down** to scroll down. The scroll speed is proportional to movement speed.

---

### No Action (hand fully open — safety pose)
```
[1, 1, 1, 1, 1]  — all fingers up
```
All five fingers fully extended. The system **ignores** this pose so you can rest your hand in a natural open position without triggering any action.

---

## Backend Comparison

Three mouse-control backends are provided. They differ in how they send input events to the OS:

| Backend | File | Accuracy | Latency | Platform | Notes |
|---|---|---|---|---|---|
| **pyautogui** | `mouse_control_pyautogui.py` | ⭐⭐ | Higher | Cross-platform | Easiest to install; uses screenshot-based failsafe; slowest of the three |
| **pynput** | `mouse_control_pynput.py` | ⭐⭐⭐ | Medium | Cross-platform | Good balance; works well on most systems |
| **Win32 API** | `mouse_control_win32.py` | ⭐⭐⭐⭐ | Lowest | **Windows only** | Sends raw Win32 mouse events; most responsive and accurate; **recommended on Windows** |

**Ranking: `pyautogui` < `pynput` ≈ `Win32`**

> `Win32` is the most accurate because it bypasses Python-level abstractions and calls the OS mouse event API directly. `pynput` is close behind and works cross-platform. `pyautogui` adds extra overhead (screenshot-based coordinate mapping, built-in delays) making it the least responsive.

---

## Project Structure

```
HandGestureAutomation/
│
├── hand_tracker.py              # Core hand-tracking module (MediaPipe wrapper)
│                                #   → HandDetector class: find_hands, find_position,
│                                #     fingers_up, fingers_half_closed, find_distance,
│                                #     is_hand_flipped, is_hand_turned
│
├── mouse_control_win32.py       # Recommended — Win32 API backend (Windows only)
├── mouse_control_pynput.py      # pynput backend (cross-platform)
├── mouse_control_pyautogui.py   # pyautogui backend (cross-platform, slower)
│
├── hand_tracking_demo.py        # Minimal raw MediaPipe demo (no helper module)
├── palm_orientation_test.py     # Standalone palm front/back orientation tester
│
└── README.md
```

---

## Configuration

All three controller files expose the same top-level constants you can tune:

| Constant | Default | Description |
|---|---|---|
| `FRAME_R` | `100` px | Margin around the camera frame edge — gestures outside this border are ignored |
| `SMOOTHENING` | `6` or `7` | Higher = smoother but slower cursor; lower = snappier but jittery |

Gesture mappings live in the `FINGER_CONFIG` dict at the top of each file and can be freely remapped.

---

## Installation

**1. Clone the repository**
```bash
git clone https://github.com/Uni-Creator/HandGestureAutomation.git
cd HandGestureAutomation
```

**2. Create and activate a virtual environment** *(recommended)*
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install opencv-python mediapipe numpy pyautogui pynput 
# Windows only (for the Win32 backend):
pip install pywin32
```

**4. Run your preferred backend**
```bash
# Best on Windows:
python mouse_control_win32.py

# Cross-platform:
python mouse_control_pynput.py
python mouse_control_pyautogui.py
```

Press **`Q`** or **`Esc`** to quit.

---

## Tips for Best Results

- **Lighting**: Use good, even lighting — avoid strong backlighting behind your hand.
- **Distance**: Keep your hand roughly **40–70 cm** from the webcam.
- **Background**: A plain, uncluttered background improves detection reliability.
- **Orientation**: Keep your palm **facing the camera** (palm front). The orientation guard will suppress input if your hand is turned or flipped.
- **Active zone**: The **pink/magenta rectangle** shown on screen is the active gesture area. Move your hand within it to control the cursor across the full screen.

---

## Tech Stack

| Library | Purpose |
|---|---|
| [MediaPipe](https://mediapipe.dev/) | Real-time hand landmark detection (21 points) |
| [OpenCV](https://opencv.org/) | Webcam capture and frame rendering |
| [NumPy](https://numpy.org/) | Coordinate interpolation and clipping |
| [pynput](https://pynput.readthedocs.io/) | Cross-platform mouse input (pynput backend) |
| [pyautogui](https://pyautogui.readthedocs.io/) | Cross-platform mouse input (pyautogui backend) |
| [pywin32](https://github.com/mhammond/pywin32) | Win32 API mouse events (Win32 backend) |

---

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

- [Google MediaPipe](https://mediapipe.dev/) for the hand tracking model
- [OpenCV](https://opencv.org/) for computer vision utilities
