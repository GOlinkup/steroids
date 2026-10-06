/**
 * Tests for the hand tracking gesture detection system
 *
 * To run these tests:
 * npm test -- --testPathPattern=handTracking.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the TensorFlow.js and MediaPipe imports
vi.mock('@tensorflow-models/hand-pose-detection', () => ({
  SupportedModels: {
    MediaPipeHands: 'mediapipe_hands'
  },
  createDetector: vi.fn()
}));

// Import the module under test
import { analyzeSingleHand } from './handTracking';

describe('Hand Gesture Detection', () => {
  // Test for Drawing Mode (Index finger extended, other fingers closed)
  it('should detect drawing mode when only index finger is extended', () => {
    // Mock hand data with only index finger extended
    const mockHand = {
      keypoints: [
        // Wrist
        { x: 100, y: 200, z: 0 },
        // Thumb joints (not extended)
        { x: 90, y: 180, z: 0 },
        { x: 85, y: 170, z: 0 },
        { x: 80, y: 165, z: 0 },
        { x: 75, y: 160, z: 0 },
        // Index finger joints (extended)
        { x: 110, y: 170, z: 0 },
        { x: 120, y: 150, z: 0 },
        { x: 130, y: 130, z: 0 },
        { x: 140, y: 110, z: 0 },
        // Middle finger joints (not extended)
        { x: 105, y: 175, z: 0 },
        { x: 105, y: 170, z: 0 },
        { x: 105, y: 165, z: 0 },
        { x: 105, y: 160, z: 0 },
        // Ring finger joints (not extended)
        { x: 100, y: 180, z: 0 },
        { x: 100, y: 175, z: 0 },
        { x: 100, y: 170, z: 0 },
        { x: 100, y: 165, z: 0 },
        // Pinky finger joints (not extended)
        { x: 95, y: 185, z: 0 },
        { x: 95, y: 180, z: 0 },
        { x: 95, y: 175, z: 0 },
        { x: 95, y: 170, z: 0 }
      ],
      score: 0.9,
      handedness: 'Right'
    };

    // Call the function with the mock data
    const result = analyzeSingleHand(mockHand, 640, 480);

    // Verify the result
    expect(result.gesture.isDrawing).toBe(true);
    expect(result.gesture.isClearCanvas).toBe(false);
    expect(result.gesture.isChangeColor).toBe(false);
    expect(result.gesture.isEraser).toBe(false);
    expect(result.gesture.isPaused).toBe(false);
  });

  // Test for Clear Canvas (All fingers extended)
  it('should detect clear canvas mode when all fingers are extended', () => {
    // Mock hand data with all fingers extended
    const mockHand = {
      keypoints: [
        // Wrist
        { x: 100, y: 200, z: 0 },
        // Thumb joints (extended)
        { x: 70, y: 180, z: 0 },
        { x: 60, y: 170, z: 0 },
        { x: 50, y: 160, z: 0 },
        { x: 40, y: 150, z: 0 },
        // Index finger joints (extended)
        { x: 110, y: 170, z: 0 },
        { x: 120, y: 150, z: 0 },
        { x: 130, y: 130, z: 0 },
        { x: 140, y: 110, z: 0 },
        // Middle finger joints (extended)
        { x: 105, y: 170, z: 0 },
        { x: 110, y: 150, z: 0 },
        { x: 115, y: 130, z: 0 },
        { x: 120, y: 110, z: 0 },
        // Ring finger joints (extended)
        { x: 100, y: 170, z: 0 },
        { x: 100, y: 150, z: 0 },
        { x: 100, y: 130, z: 0 },
        { x: 100, y: 110, z: 0 },
        // Pinky finger joints (extended)
        { x: 95, y: 170, z: 0 },
        { x: 90, y: 150, z: 0 },
        { x: 85, y: 130, z: 0 },
        { x: 80, y: 110, z: 0 }
      ],
      score: 0.9,
      handedness: 'Right'
    };

    // Call the function with the mock data
    const result = analyzeSingleHand(mockHand, 640, 480);

    // Verify the result
    expect(result.gesture.isDrawing).toBe(false);
    expect(result.gesture.isClearCanvas).toBe(true);
    expect(result.gesture.isChangeColor).toBe(false);
    expect(result.gesture.isEraser).toBe(false);
    expect(result.gesture.isPaused).toBe(false);
  });
});
