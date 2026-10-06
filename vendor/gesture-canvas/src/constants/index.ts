export const DEFAULT_CAMERA_SETTINGS = {
  width: 640,
  height: 480,
  facingMode: 'user' as const,
  frameRate: 30,
};

export const DRAWING_TOOLS = {
  PEN: {
    name: 'pen',
    icon: '✏️',
    color: '#000000',
    size: 2,
  },
  BRUSH: {
    name: 'brush',
    icon: '🖌️',
    color: '#000000',
    size: 5,
  },
  ERASER: {
    name: 'eraser',
    icon: '🧹',
    color: '#FFFFFF',
    size: 10,
  },
};

export const GESTURES = {
  DRAW: {
    name: 'draw',
    description: 'Start drawing on the canvas',
    action: () => {},
  },
  ERASE: {
    name: 'erase',
    description: 'Erase parts of the drawing',
    action: () => {},
  },
  CLEAR: {
    name: 'clear',
    description: 'Clear the entire canvas',
    action: () => {},
  },
}; 