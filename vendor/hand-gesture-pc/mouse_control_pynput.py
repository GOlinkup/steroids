"""Hand-gesture mouse controller backed by pynput."""

import sys
from unittest.mock import MagicMock
# Mock tkinter to prevent pyautogui/pymsgbox import crashes on headless Linux systems
mock_tk = MagicMock()
mock_tk.TkVersion = 8.6
sys.modules['tkinter'] = mock_tk
sys.modules['_tkinter'] = MagicMock()

import time
import subprocess
import platform
import json
import os
import cv2
import numpy as np
import pyautogui
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import Key, Controller as KeyboardController
import sounddevice as sd

import hand_tracker as htm

pyautogui.FAILSAFE = False

# Sound helpers
def play_sound_enable():
    fs = 44100
    d1, d2 = 0.07, 0.12
    t1 = np.linspace(0, d1, int(fs * d1), endpoint=False)
    t2 = np.linspace(0, d2, int(fs * d2), endpoint=False)
    wave1 = np.sin(2 * np.pi * 400 * t1)
    wave2 = np.sin(2 * np.pi * 700 * t2)
    fade1 = np.ones_like(wave1)
    fade1[-500:] = np.linspace(1, 0, 500)
    fade2 = np.ones_like(wave2)
    fade2[-1000:] = np.linspace(1, 0, 1000)
    wave = np.concatenate([wave1 * fade1, wave2 * fade2])
    sd.play(wave * 0.35, fs)

def play_sound_disable():
    fs = 44100
    d1, d2 = 0.07, 0.12
    t1 = np.linspace(0, d1, int(fs * d1), endpoint=False)
    t2 = np.linspace(0, d2, int(fs * d2), endpoint=False)
    wave1 = np.sin(2 * np.pi * 700 * t1)
    wave2 = np.sin(2 * np.pi * 400 * t2)
    fade1 = np.ones_like(wave1)
    fade1[-500:] = np.linspace(1, 0, 500)
    fade2 = np.ones_like(wave2)
    fade2[-1000:] = np.linspace(1, 0, 1000)
    wave = np.concatenate([wave1 * fade1, wave2 * fade2])
    sd.play(wave * 0.35, fs)


# Constants
W_CAM, H_CAM = 640, 480
SMOOTHENING = 10      # Cursor smoothing factor
_current_dir = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(_current_dir, "gesture_config.json")

FINGER_CONFIG = {
    "all_up":          [1, 1, 1, 1, 1],
    "all_down":        [0, 0, 0, 0, 0],
    "move":            [0, 1, 0, 0, 0],
    "right_click":     [0, 1, 1, 0, 0], # Index + Pinky up
    "left_click":      [1, 1, 0, 0, 0], # Thumb + Index up
    "scroll_up":       [1, 1, 0, 0, 1], # Index + Middle + Ring up
    "scroll_down":     [0, 1, 0, 0, 1], # Index + Middle up
    "volume_up":       [0, 1, 1, 1, 0], # Index + Middle + Ring up (3 fingers)
    "volume_down":     [0, 1, 1, 1, 1], # 4 fingers up (except thumb)
    "enable_control":  [1, 1, 1, 0, 1], # Thumb + Index + Middle + Pinky up (4 fingers)
    "disable_control": [1, 1, 1, 1, 1], # 5 fingers up
}


class InputController:
    """Handles OS-level mouse and keyboard simulations cleanly."""
    def __init__(self):
        self.mouse = MouseController()
        self.keyboard = KeyboardController()

    def set_position(self, x: float, y: float):
        self.mouse.position = (int(x), int(y))

    def press_left(self):
        self.mouse.press(Button.left)

    def release_left(self):
        self.mouse.release(Button.left)

    def click_left(self):
        self.mouse.click(Button.left)

    def click_right(self):
        self.mouse.click(Button.right)

    def scroll(self, direction: int):
        self.mouse.scroll(0, direction)

    def volume_up(self):
        self.keyboard.press(Key.media_volume_up)
        self.keyboard.release(Key.media_volume_up)

    def volume_down(self):
        self.keyboard.press(Key.media_volume_down)
        self.keyboard.release(Key.media_volume_down)


class GestureStateManager:
    """Manages noise-filtered state transitions, timers, and tracking zone size."""
    def __init__(self):
        self.control_enabled = False
        self.dragging = False
        self.p_loc_x, self.p_loc_y = 0.0, 0.0
        
        # Load customizable tracking box dimensions from file if exists
        config = self.load_config()
        self.frame_x = config.get("frame_x", W_CAM // 2)
        self.frame_y = config.get("frame_y", H_CAM // 2)
        self.frame_w = config.get("frame_w", 440)
        self.frame_h = config.get("frame_h", 280)
        
        # State timers
        self.enable_start_time = None
        self.disable_start_time = None
        self.left_click_start_time = None
        self.right_click_start_time = None
        self.volume_start_time = None
        
        self.last_volume_change_time = 0.0
        self.scroll_counter = 0
        self.last_non_click_gesture = None

    def load_config(self) -> dict:
        """Loads configuration from json file."""
        default_config = {
            "frame_x": W_CAM // 2,
            "frame_y": H_CAM // 2,
            "frame_w": 440,
            "frame_h": 280
        }
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    data = json.load(f)
                    for k in default_config:
                        if k in data and isinstance(data[k], int):
                            default_config[k] = data[k]
            except Exception:
                pass
        return default_config

    def save_config(self) -> None:
        """Saves current configuration to json file."""
        config_data = {
            "frame_x": self.frame_x,
            "frame_y": self.frame_y,
            "frame_w": self.frame_w,
            "frame_h": self.frame_h
        }
        try:
            with open(CONFIG_FILE, "w") as f:
                json.dump(config_data, f, indent=4)
        except Exception:
            pass

    def update_control_state(self, fingers: list) -> None:
        """Processes enable/disable control gestures with 150ms verification delay."""
        if fingers == FINGER_CONFIG["enable_control"]:
            self.disable_start_time = None
            if not self.control_enabled:
                if self.enable_start_time is None:
                    self.enable_start_time = time.time()
                if time.time() - self.enable_start_time >= 0.15:
                    self.control_enabled = True
                    play_sound_enable()
                    self.enable_start_time = None
        elif fingers == FINGER_CONFIG["disable_control"]:
            self.enable_start_time = None
            if self.control_enabled:
                if self.disable_start_time is None:
                    self.disable_start_time = time.time()
                if time.time() - self.disable_start_time >= 0.15:
                    self.control_enabled = False
                    play_sound_disable()
                    self.disable_start_time = None
                    if self.dragging:
                        self.dragging = False
        else:
            self.enable_start_time = None
            self.disable_start_time = None

    def reset_temp_timers(self) -> None:
        """Resets active timers when hand tracking is lost."""
        self.left_click_start_time = None
        self.right_click_start_time = None
        self.volume_start_time = None
        self.enable_start_time = None
        self.disable_start_time = None


def configure_camera():
    """Applies optimal camera configuration for low exposure on Linux if possible."""
    if platform.system() == "Linux":
        try:
            subprocess.run(
                ["v4l2-ctl", "-d", "/dev/video0", "-c", "exposure_dynamic_framerate=0"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass


def main():
    configure_camera()

    cap = cv2.VideoCapture(0)
    cap.set(3, W_CAM)
    cap.set(4, H_CAM)

    detector = htm.HandDetector(max_hands=1)
    input_ctrl = InputController()
    state = GestureStateManager()
    w_scr, h_scr = pyautogui.size()

    p_time = 0

    while True:
        success, img = cap.read()
        if not success:
            break

        img = cv2.flip(img, 1)
        img = detector.find_hands(img)
        lm_list, _ = detector.find_position(img)

        # Calculate bounding box bounds
        x_start = max(0, state.frame_x - state.frame_w // 2)
        x_end = min(W_CAM, state.frame_x + state.frame_w // 2)
        y_start = max(0, state.frame_y - state.frame_h // 2)
        y_end = min(H_CAM, state.frame_y + state.frame_h // 2)

        fingers = detector.fingers_up()

        if fingers:
            state.update_control_state(fingers)
            angle = detector.get_hand_angle()
            is_valid_orientation = (55 <= angle <= 125)

            # Determine visual representation color
            if not state.control_enabled:
                rect_color = (128, 128, 128)  # Gray
            elif is_valid_orientation:
                rect_color = (255, 0, 255)    # Magenta
            else:
                rect_color = (0, 0, 255)      # Red

            cv2.rectangle(img, (x_start, y_start), (x_end, y_end), rect_color, 2)

            if not state.control_enabled:
                cv2.putText(img, "CONTROL OFF", (20, 90), cv2.FONT_HERSHEY_PLAIN, 2, (128, 128, 128), 2)
            elif not is_valid_orientation:
                cv2.putText(img, "Tilted Hand", (20, 90), cv2.FONT_HERSHEY_PLAIN, 2, (0, 0, 255), 2)

            if is_valid_orientation:
                # Volume control (allowed even when control is off)
                if fingers in [FINGER_CONFIG["volume_up"], FINGER_CONFIG["volume_down"]]:
                    if state.volume_start_time is None:
                        state.volume_start_time = time.time()
                    
                    if time.time() - state.volume_start_time >= 0.1:
                        if time.time() - state.last_volume_change_time >= 0.15:
                            if fingers == FINGER_CONFIG["volume_up"]:
                                input_ctrl.volume_up()
                            else:
                                input_ctrl.volume_down()
                            state.last_volume_change_time = time.time()
                else:
                    state.volume_start_time = None

                # Scroll controls (allowed even when control is off)
                if fingers == FINGER_CONFIG["scroll_up"]:
                    state.scroll_counter += 1
                    if state.scroll_counter % 3 == 0:
                        input_ctrl.scroll(1)
                elif fingers == FINGER_CONFIG["scroll_down"]:
                    state.scroll_counter += 1
                    if state.scroll_counter % 3 == 0:
                        input_ctrl.scroll(-1)
                else:
                    state.scroll_counter = 0

                # Cursor, click, drag, right click (only when control is enabled)
                if state.control_enabled:
                    # Update last non-click gesture state
                    if fingers != FINGER_CONFIG["left_click"] and fingers != FINGER_CONFIG["right_click"]:
                        if fingers == FINGER_CONFIG["move"]:
                            state.last_non_click_gesture = "move"
                        elif fingers in [FINGER_CONFIG["scroll_up"], FINGER_CONFIG["scroll_down"]]:
                            state.last_non_click_gesture = None

                    # Cursor movement
                    if fingers != FINGER_CONFIG["all_up"] and fingers == FINGER_CONFIG["move"]:
                        x1, y1 = lm_list[8][1:3]
                        x3 = np.interp(x1, (x_start, x_end), (0, w_scr))
                        y3 = np.interp(y1, (y_start, y_end), (0, h_scr))
                        c_loc_x = state.p_loc_x + (x3 - state.p_loc_x) / SMOOTHENING
                        c_loc_y = state.p_loc_y + (y3 - state.p_loc_y) / SMOOTHENING
                        input_ctrl.set_position(c_loc_x, c_loc_y)
                        cv2.circle(img, (x1, y1), 15, (0, 255, 0), cv2.FILLED)
                        state.p_loc_x, state.p_loc_y = c_loc_x, c_loc_y

                    # Left Click & Drag logic
                    elif fingers == FINGER_CONFIG["left_click"]:
                        x1, y1 = lm_list[8][1:3]
                        thumb_index_angle = detector.get_thumb_index_angle()
                        if len(detector.lm_list) >= 9:
                            x4, y4 = detector.lm_list[4][1:3]
                            x5, y5 = detector.lm_list[5][1:3]
                            x8, y8 = detector.lm_list[8][1:3]
                            cv2.line(img, (x4, y4), (x5, y5), (0, 0, 255), 2)
                            cv2.line(img, (x8, y8), (x5, y5), (0, 0, 255), 2)
                            cv2.putText(img, f"Angle: {int(thumb_index_angle)} deg", (x5 + 10, y5 + 10),
                                        cv2.FONT_HERSHEY_PLAIN, 1.5, (0, 0, 255), 2)

                        if 60 <= thumb_index_angle <= 120:
                            if state.left_click_start_time is None:
                                state.left_click_start_time = time.time()
                            
                            if time.time() - state.left_click_start_time > 0.3:
                                if not state.dragging and state.last_non_click_gesture == "move":
                                    input_ctrl.press_left()
                                    state.dragging = True
                        else:
                            if state.left_click_start_time is not None:
                                if state.dragging:
                                    input_ctrl.release_left()
                                    state.dragging = False
                                else:
                                    if time.time() - state.left_click_start_time >= 0.1:
                                        if state.last_non_click_gesture == "move":
                                            input_ctrl.click_left()
                                state.left_click_start_time = None

                        if state.dragging:
                            x3 = np.interp(x1, (x_start, x_end), (0, w_scr))
                            y3 = np.interp(y1, (y_start, y_end), (0, h_scr))
                            c_loc_x = state.p_loc_x + (x3 - state.p_loc_x) / SMOOTHENING
                            c_loc_y = state.p_loc_y + (y3 - state.p_loc_y) / SMOOTHENING
                            input_ctrl.set_position(c_loc_x, c_loc_y)
                            state.p_loc_x, state.p_loc_y = c_loc_x, c_loc_y

                        cv2.circle(img, (x1, y1), 15, (0, 255, 0), cv2.FILLED)

                    # Reset click state if left click gesture stops
                    if fingers != FINGER_CONFIG["left_click"] and state.left_click_start_time is not None:
                        if state.dragging:
                            input_ctrl.release_left()
                            state.dragging = False
                        else:
                            if time.time() - state.left_click_start_time >= 0.1:
                                if state.last_non_click_gesture == "move":
                                    input_ctrl.click_left()
                        state.left_click_start_time = None

                    # Right click
                    if fingers == FINGER_CONFIG["right_click"]:
                        if state.right_click_start_time is None:
                            state.right_click_start_time = time.time()
                        x1, y1 = lm_list[8][1:3]
                        cv2.circle(img, (x1, y1), 15, (0, 255, 0), cv2.FILLED)
                    else:
                        if state.right_click_start_time is not None:
                            if time.time() - state.right_click_start_time >= 0.1:
                                if state.last_non_click_gesture == "move":
                                    input_ctrl.click_right()
                        state.right_click_start_time = None
            else:
                state.scroll_counter = 0
                state.volume_start_time = None
        else:
            state.reset_temp_timers()

        c_time = time.time()
        fps = 1 / (c_time - p_time) if (c_time - p_time) > 0 else 0
        p_time = c_time

        cv2.putText(img, str(int(fps)), (20, 50), cv2.FONT_HERSHEY_PLAIN, 3, (255, 0, 0), 3)
        cv2.putText(img, "Adjust Box: W/A/S/D (Move) | [ / ] (Width) | - / = (Height)", (20, H_CAM - 20),
                    cv2.FONT_HERSHEY_PLAIN, 1.1, (255, 255, 255), 1)
        cv2.imshow("Mouse Controller (pynput)", img)

        key = cv2.waitKey(1)
        if key & 0xFF in (ord("q"), 27):
            break
        
        # Adjusting state variables with saving configuration
        config_changed = False
        
        # Move tracking rectangle
        if key & 0xFF == ord("w"):
            state.frame_y = max(state.frame_h // 2, state.frame_y - 10)
            config_changed = True
        elif key & 0xFF == ord("s"):
            state.frame_y = min(H_CAM - state.frame_h // 2, state.frame_y + 10)
            config_changed = True
        elif key & 0xFF == ord("a"):
            state.frame_x = max(state.frame_w // 2, state.frame_x - 10)
            config_changed = True
        elif key & 0xFF == ord("d"):
            state.frame_x = min(W_CAM - state.frame_w // 2, state.frame_x + 10)
            config_changed = True
        # Resize tracking rectangle
        elif key & 0xFF == ord("["):
            state.frame_w = max(100, state.frame_w - 10)
            config_changed = True
        elif key & 0xFF == ord("]"):
            state.frame_w = min(W_CAM, state.frame_w + 10)
            config_changed = True
        elif key & 0xFF == ord("-"):
            state.frame_h = max(100, state.frame_h - 10)
            config_changed = True
        elif key & 0xFF == ord("="):
            state.frame_h = min(H_CAM, state.frame_h + 10)
            config_changed = True
            
        if config_changed:
            state.save_config()

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
