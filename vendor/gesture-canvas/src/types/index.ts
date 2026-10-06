export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface DrawingTool {
  name: string;
  icon: string;
  color: string;
  size: number;
}

export interface CanvasState {
  isDrawing: boolean;
  currentTool: DrawingTool;
  paths: Array<{
    points: Array<{ x: number; y: number }>;
    tool: DrawingTool;
  }>;
}

export interface Gesture {
  name: string;
  description: string;
  action: () => void;
}

export interface CameraSettings {
  width: number;
  height: number;
  facingMode: 'user' | 'environment';
  frameRate: number;
} 