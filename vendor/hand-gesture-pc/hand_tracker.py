import cv2
import mediapipe as mp
import time
import math
import os
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
from typing import List, Tuple, Optional

# Shim classes to mimic legacy mp.solutions.hands output structure
class Classification:
    def __init__(self, label: str):
        self.label = label  # "Left" or "Right"

class Handedness:
    def __init__(self, classification: List[Classification]):
        self.classification = classification

class Landmark:
    def __init__(self, x: float, y: float, z: float):
        self.x = x
        self.y = y
        self.z = z

class HandLandmarks:
    def __init__(self, landmark_list: List[Landmark]):
        self.landmark = landmark_list

class LegacyResults:
    def __init__(self, hand_landmarks, handedness):
        self.multi_hand_landmarks = []
        if hand_landmarks:
            for hl in hand_landmarks:
                lms = [Landmark(lm.x, lm.y, lm.z) for lm in hl]
                self.multi_hand_landmarks.append(HandLandmarks(lms))
        
        self.multi_handedness = []
        if handedness:
            for h in handedness:
                classifications = []
                for cat in h:
                    label = cat.category_name
                    if label == "Left":
                        swapped_label = "Right"
                    elif label == "Right":
                        swapped_label = "Left"
                    else:
                        swapped_label = label
                    classifications.append(Classification(swapped_label))
                self.multi_handedness.append(Handedness(classifications))


class HandDetector:
    """Detects and tracks hand landmarks using MediaPipe Tasks API with a legacy interface wrapper."""

    TIP_IDS = [4, 8, 12, 16, 20]

    def __init__(self, mode: bool = False, max_hands: int = 2, detection_con: float = 0.5, track_con: float = 0.5):
        self.mode = mode
        self.max_hands = max_hands
        self.detection_con = detection_con
        self.track_con = track_con

        # Initialize detector using modern Tasks API
        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(current_dir, 'hand_landmarker.task')
        
        try:
            base_options = python.BaseOptions(
                model_asset_path=model_path,
                delegate=python.BaseOptions.Delegate.GPU
            )
            options = vision.HandLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE if self.mode else vision.RunningMode.VIDEO,
                num_hands=self.max_hands,
                min_hand_detection_confidence=self.detection_con,
                min_hand_presence_confidence=self.track_con,
            )
            self.detector = vision.HandLandmarker.create_from_options(options)
        except Exception:
            # Fallback to CPU
            base_options = python.BaseOptions(model_asset_path=model_path)
            options = vision.HandLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE if self.mode else vision.RunningMode.VIDEO,
                num_hands=self.max_hands,
                min_hand_detection_confidence=self.detection_con,
                min_hand_presence_confidence=self.track_con,
            )
            self.detector = vision.HandLandmarker.create_from_options(options)
        self.results = None
        self.lm_list = []
        self._prev_timestamp = 0

    def draw_landmarks(self, img: np.ndarray, hand_lms: HandLandmarks) -> None:
        """Draw hand connections and points using OpenCV."""
        if img is None:
            return
        h, w, _ = img.shape
        connections = [
            (0, 1), (1, 2), (2, 3), (3, 4),
            (5, 6), (6, 7), (7, 8),
            (9, 10), (10, 11), (11, 12),
            (13, 14), (14, 15), (15, 16),
            (17, 18), (18, 19), (19, 20),
            (0, 5), (5, 9), (9, 13), (13, 17), (0, 17)
        ]
        # Draw lines
        for connection in connections:
            p1, p2 = connection
            if p1 < len(hand_lms.landmark) and p2 < len(hand_lms.landmark):
                lm1 = hand_lms.landmark[p1]
                lm2 = hand_lms.landmark[p2]
                pt1 = (int(lm1.x * w), int(lm1.y * h))
                pt2 = (int(lm2.x * w), int(lm2.y * h))
                cv2.line(img, pt1, pt2, (255, 0, 255), 2)
        # Draw points
        for lm in hand_lms.landmark:
            cx, cy = int(lm.x * w), int(lm.y * h)
            cv2.circle(img, (cx, cy), 5, (0, 255, 0), cv2.FILLED)

    def find_hands(self, img: np.ndarray, draw: bool = True) -> np.ndarray:
        """Process a BGR frame and optionally draw landmarks. Returns the frame."""
        if img is None:
            return img
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).copy()
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        
        if self.mode:
            raw_res = self.detector.detect(mp_image)
        else:
            timestamp_ms = int(time.time() * 1000)
            if timestamp_ms <= self._prev_timestamp:
                timestamp_ms = self._prev_timestamp + 1
            self._prev_timestamp = timestamp_ms
            raw_res = self.detector.detect_for_video(mp_image, timestamp_ms)
            
        self.results = LegacyResults(raw_res.hand_landmarks, raw_res.handedness)

        if self.results.multi_hand_landmarks:
            for hand_lms in self.results.multi_hand_landmarks:
                if draw:
                    self.draw_landmarks(img, hand_lms)
        return img

    def find_position(self, img: np.ndarray, hand_no: int = 0, draw: bool = True) -> Tuple[List[List], Tuple[int, int, int, int] | Tuple[()]]:
        """Return a list of [id, cx, cy, cz] for each landmark and a bounding box."""
        if img is None:
            return [], ()
        x_list, y_list = [], []
        bbox = ()
        self.lm_list = []

        if self.results and self.results.multi_hand_landmarks:
            if hand_no < len(self.results.multi_hand_landmarks):
                my_hand = self.results.multi_hand_landmarks[hand_no]
                h, w, _ = img.shape

                for lm_id, lm in enumerate(my_hand.landmark):
                    cx, cy, cz = int(lm.x * w), int(lm.y * h), lm.z
                    x_list.append(cx)
                    y_list.append(cy)
                    self.lm_list.append([lm_id, cx, cy, cz])
                    if draw:
                        cv2.circle(img, (cx, cy), 5, (255, 0, 255), cv2.FILLED)

                if x_list and y_list:
                    x_min, x_max = min(x_list), max(x_list)
                    y_min, y_max = min(y_list), max(y_list)
                    bbox = (x_min, y_min, x_max, y_max)

                    if draw:
                        cv2.rectangle(
                            img,
                            (x_min - 20, y_min - 20),
                            (x_max + 20, y_max + 20),
                            (0, 255, 0),
                            2,
                        )

        return self.lm_list, bbox

    def fingers_up(self):
        """Return a list of 5 booleans (1/0) indicating which fingers are extended."""
        if not self.lm_list:
            return []

        if self.results is None or not self.results.multi_handedness or not self.results.multi_hand_landmarks:
            return []

        fingers = []
        
        # Use 3D vector projection to determine thumb extension state (invariant to hand rotation)
        landmarks = self.results.multi_hand_landmarks[0].landmark
        p4 = landmarks[4]     # Thumb tip
        p5 = landmarks[5]     # Index MCP
        p17 = landmarks[17]   # Pinky MCP

        # Calculate vectors
        u_x, u_y, u_z = p17.x - p5.x, p17.y - p5.y, p17.z - p5.z
        v_x, v_y, v_z = p4.x - p5.x, p4.y - p5.y, p4.z - p5.z

        palm_width = math.sqrt(u_x**2 + u_y**2 + u_z**2)
        if palm_width > 0:
            dot_product = u_x * v_x + u_y * v_y + u_z * v_z
            projection = dot_product / palm_width
            # The thumb is on the opposite side of the index finger from the pinky.
            # Hence, when the thumb is extended, the projection ratio is highly negative (< -0.35).
            # When the thumb is tucked/folded, it is close to 0 or positive.
            is_thumb_extended = (projection / palm_width) < -0.35
        else:
            is_thumb_extended = False

        if is_thumb_extended:
            fingers.append(1)
        else:
            fingers.append(0)

        # Four fingers — compare tip Y to PIP Y
        for idx in range(1, 5):
            tip_y = self.lm_list[self.TIP_IDS[idx]][2]
            pip_y = self.lm_list[self.TIP_IDS[idx] - 2][2]
            fingers.append(1 if tip_y < pip_y else 0)

        return fingers

    def fingers_half_closed(self):
        """Return a list of 5 booleans indicating which fingers are half-closed."""
        if not self.lm_list:
            return []

        if self.results is None or not self.results.multi_handedness:
            return []

        fingers = []
        hand_type = self.results.multi_handedness[0].classification[0].label

        # Thumb
        tip_x = self.lm_list[self.TIP_IDS[0]][1]
        ip_x = self.lm_list[self.TIP_IDS[0] - 1][1]
        mcp_x = self.lm_list[self.TIP_IDS[0] - 2][1]
        if (tip_x < ip_x and tip_x > mcp_x and hand_type == "Left") or (
            tip_x > ip_x and tip_x < mcp_x and hand_type == "Right"
        ):
            fingers.append(1)
        else:
            fingers.append(0)

        # Four fingers — tip between DIP and PIP
        for idx in range(1, 5):
            tip_y = self.lm_list[self.TIP_IDS[idx]][2]
            dip_y = self.lm_list[self.TIP_IDS[idx] - 3][2]
            pip_y = self.lm_list[self.TIP_IDS[idx] - 1][2]
            fingers.append(1 if (dip_y <= tip_y <= pip_y) or (pip_y <= tip_y <= dip_y) else 0)

        return fingers

    def is_hand_flipped(self):
        """Return True if the palm is facing up (middle finger tip below wrist)."""
        if not self.results or not self.results.multi_hand_landmarks:
            return False
        landmarks = self.results.multi_hand_landmarks[0].landmark
        return landmarks[12].y > landmarks[0].y

    def is_hand_turned(self):
        """Return True if the hand is turned away from the camera."""
        if not self.results or not self.results.multi_hand_landmarks:
            return False
        landmarks = self.results.multi_hand_landmarks[0].landmark
        hand_type = self.results.multi_handedness[0].classification[0].label

        index_bottom = landmarks[5]
        pinky_bottom = landmarks[17]

        if index_bottom.x > pinky_bottom.x and hand_type == "Right":
            return True
        if index_bottom.x < pinky_bottom.x and hand_type == "Left":
            return True
        return False

    def get_hand_angle(self):
        """Return the angle of the hand in degrees (90 is straight up, 180 is left, 0 is right)."""
        if not self.lm_list or len(self.lm_list) < 10:
            return 90.0
        # Landmark 0 is wrist, Landmark 9 is middle finger MCP
        x0, y0 = self.lm_list[0][1], self.lm_list[0][2]
        x9, y9 = self.lm_list[9][1], self.lm_list[9][2]
        dx = x9 - x0
        dy = y0 - y9  # invert y so pointing up has positive dy
        angle = math.degrees(math.atan2(dy, dx))
        if angle < 0:
            angle += 360.0
        return angle

    def get_thumb_index_angle(self):
        """Return the angle between thumb tip (4) and index tip (8) with vertex at index MCP (5)."""
        if not self.lm_list or len(self.lm_list) < 9:
            return 0.0
        # Point A = thumb tip (4)
        # Point B = index MCP (5)
        # Point C = index tip (8)
        x4, y4 = self.lm_list[4][1], self.lm_list[4][2]
        x5, y5 = self.lm_list[5][1], self.lm_list[5][2]
        x8, y8 = self.lm_list[8][1], self.lm_list[8][2]

        dx_t, dy_t = x4 - x5, y5 - y4  # invert y
        dx_i, dy_i = x8 - x5, y5 - y8  # invert y

        dot_product = dx_t * dx_i + dy_t * dy_i
        mag_t = math.hypot(dx_t, dy_t)
        mag_i = math.hypot(dx_i, dy_i)

        if mag_t == 0 or mag_i == 0:
            return 0.0

        cos_theta = dot_product / (mag_t * mag_i)
        cos_theta = max(-1.0, min(1.0, cos_theta))
        angle = math.degrees(math.acos(cos_theta))
        return angle

    def find_distance(self, p1, p2, img, draw=True, r=10, t=3):
        """Return the pixel distance between two landmarks, the annotated frame, and line info."""
        x1, y1, _ = self.lm_list[p1][1:]
        x2, y2, _ = self.lm_list[p2][1:]
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

        if draw:
            cv2.line(img, (x1, y1), (x2, y2), (255, 0, 255), t)
            cv2.circle(img, (x1, y1), r, (255, 0, 255), cv2.FILLED)
            cv2.circle(img, (x2, y2), r, (255, 0, 255), cv2.FILLED)
            cv2.circle(img, (cx, cy), r, (0, 0, 255), cv2.FILLED)

        length = math.hypot(x2 - x1, y2 - y1)
        return length, img, [x1, y1, x2, y2, cx, cy]


# Backwards-compatible alias
handDetector = HandDetector


def main():
    import subprocess
    import platform
    if platform.system() == "Linux":
        try:
            subprocess.run(
                ["v4l2-ctl", "-d", "/dev/video0", "-c", "exposure_dynamic_framerate=0"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass

    cap = cv2.VideoCapture(0)
    detector = HandDetector()
    p_time = 0

    while True:
        success, img = cap.read()
        if not success:
            break

        img = cv2.flip(img, 1)
        img = detector.find_hands(img)
        lm_list, _ = detector.find_position(img)

        if lm_list:
            print(lm_list[4])

        c_time = time.time()
        fps = 1 / (c_time - p_time) if (c_time - p_time) > 0 else 0
        p_time = c_time

        cv2.putText(img, str(int(fps)), (10, 70), cv2.FONT_HERSHEY_PLAIN, 3, (255, 0, 255), 3)
        cv2.imshow("Hand Tracker", img)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
