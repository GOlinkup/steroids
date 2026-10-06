import unittest
from unittest.mock import MagicMock
import hand_tracker as htm

class MockLandmark:
    def __init__(self, x: float, y: float, z: float):
        self.x = x
        self.y = y
        self.z = z

class MockClassification:
    def __init__(self, label: str):
        self.label = label

class MockHandedness:
    def __init__(self, label: str):
        self.classification = [MockClassification(label)]

class MockHandLandmarks:
    def __init__(self, landmarks: list):
        self.landmark = landmarks

class MockResults:
    def __init__(self, landmarks: list, label: str):
        self.multi_hand_landmarks = [MockHandLandmarks(landmarks)]
        self.multi_handedness = [MockHandedness(label)]

class TestHandDetectorLogic(unittest.TestCase):
    def setUp(self):
        # Override HandDetector.__init__ to avoid loading heavy mediapipe model asset in tests
        self.original_init = htm.HandDetector.__init__
        htm.HandDetector.__init__ = lambda self, mode=False, max_hands=2, detection_con=0.5, track_con=0.5: None
        self.detector = htm.HandDetector()
        self.detector.lm_list = []
        self.detector.results = None

    def tearDown(self):
        # Restore the original initializer
        htm.HandDetector.__init__ = self.original_init

    def test_get_hand_angle_straight_up(self):
        # Wrist at (100, 200), Middle finger MCP at (100, 100) -> pointing straight up
        self.detector.lm_list = [
            [0, 100, 200, 0.0],  # Wrist (0)
            [1, 0, 0, 0.0],
            [2, 0, 0, 0.0],
            [3, 0, 0, 0.0],
            [4, 0, 0, 0.0],
            [5, 0, 0, 0.0],
            [6, 0, 0, 0.0],
            [7, 0, 0, 0.0],
            [8, 0, 0, 0.0],
            [9, 100, 100, 0.0], # Middle MCP (9)
        ]
        # dx = 0, dy = 100 -> angle should be 90 degrees
        angle = self.detector.get_hand_angle()
        self.assertAlmostEqual(angle, 90.0)

    def test_get_thumb_index_angle_90_deg(self):
        # Vertex B = Index MCP (5) at (100, 100)
        # Point A = Thumb tip (4) at (150, 100) -> vector AB = (50, 0)
        # Point C = Index tip (8) at (100, 50)  -> vector CB = (0, 50) (pointing up)
        # Angle should be 90 degrees
        self.detector.lm_list = [
            [0, 0, 0, 0.0],
            [1, 0, 0, 0.0],
            [2, 0, 0, 0.0],
            [3, 0, 0, 0.0],
            [4, 150, 100, 0.0], # Thumb Tip
            [5, 100, 100, 0.0], # Index MCP
            [6, 0, 0, 0.0],
            [7, 0, 0, 0.0],
            [8, 100, 50, 0.0],  # Index Tip
        ]
        angle = self.detector.get_thumb_index_angle()
        self.assertAlmostEqual(angle, 90.0)

    def test_is_hand_flipped(self):
        # Hand flipped: middle finger tip (12) y > wrist (0) y
        landmarks = [MockLandmark(0.5, 0.8, 0.0) for _ in range(21)] # Wrist at y = 0.8
        landmarks[12] = MockLandmark(0.5, 0.9, 0.0) # Middle tip at y = 0.9 (below wrist in screen coords)
        
        self.detector.results = MockResults(landmarks, "Right")
        self.assertTrue(self.detector.is_hand_flipped())

        # Hand not flipped: middle finger tip (12) y < wrist (0) y
        landmarks[12] = MockLandmark(0.5, 0.3, 0.0)
        self.detector.results = MockResults(landmarks, "Right")
        self.assertFalse(self.detector.is_hand_flipped())

if __name__ == '__main__':
    unittest.main()
