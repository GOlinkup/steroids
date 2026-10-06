// Mock global objects and functions used in tests
import { vi } from 'vitest';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock window.requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((callback) => {
  return setTimeout(callback, 0) as unknown as number;
});

// Mock window.cancelAnimationFrame
global.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id);
});

// Mock MediaStream
class MockMediaStream {
  tracks: any[] = [];

  getTracks() {
    return this.tracks;
  }

  addTrack(track: any) {
    this.tracks.push(track);
  }
}

// Mock HTMLVideoElement
class MockHTMLVideoElement {
  srcObject: any = null;
  videoWidth = 640;
  videoHeight = 480;
  readyState = 4;
  paused = false;
}

// Add mocks to global
global.MediaStream = MockMediaStream as any;
global.HTMLVideoElement = MockHTMLVideoElement as any;

// Mock TensorFlow.js
vi.mock('@tensorflow/tfjs-core', () => ({
  setBackend: vi.fn(),
  ready: vi.fn().mockResolvedValue(true),
}));

// Mock MediaPipe
vi.mock('@mediapipe/hands', () => ({}));

export {};
