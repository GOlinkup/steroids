
import * as React from 'react';

interface DrawingContextType {
  isDrawing: boolean;
  setIsDrawing: (isDrawing: boolean) => void;
  drawingPosition: { x: number; y: number } | null;
  setDrawingPosition: (pos: { x: number; y: number } | null) => void;
  clearCanvas: boolean;
  setClearCanvas: (clear: boolean) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  isEraser: boolean;
  setIsEraser: (isEraser: boolean) => void;
  handleDownload: () => void;
  backgroundImage: string | null;
  setBackgroundImage: (url: string | null) => void;
  backgroundOpacity: number;
  setBackgroundOpacity: (opacity: number) => void;
  strokeHistory: any[];
  currentStrokeIndex: number;
  addStroke: (stroke: any) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const DrawingContext = React.createContext<DrawingContextType | undefined>(undefined);

export const DrawingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [drawingPosition, setDrawingPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [clearCanvas, setClearCanvas] = React.useState(false);
  const [brushColor, setBrushColor] = React.useState('#000000');
  const [brushSize, setBrushSize] = React.useState(5);
  const [isEraser, setIsEraser] = React.useState(false);
  const [backgroundImage, setBackgroundImage] = React.useState<string | null>(null);
  const [backgroundOpacity, setBackgroundOpacity] = React.useState(100);
  const [strokeHistory, setStrokeHistory] = React.useState<any[]>([]);
  const [currentStrokeIndex, setCurrentStrokeIndex] = React.useState(-1);

  // Handle download function implementation
  const handleDownload = () => {
    const canvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `gesture-drawing-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    }
  };

  // Add stroke to history
  const addStroke = (stroke: any) => {
    // Remove any future strokes if we've gone back in history
    const newHistory = strokeHistory.slice(0, currentStrokeIndex + 1);
    newHistory.push(stroke);
    setStrokeHistory(newHistory);
    setCurrentStrokeIndex(newHistory.length - 1);
  };

  // Undo last stroke
  const undo = () => {
    if (currentStrokeIndex >= 0) {
      setCurrentStrokeIndex(currentStrokeIndex - 1);
    }
  };

  // Redo next stroke
  const redo = () => {
    if (currentStrokeIndex < strokeHistory.length - 1) {
      setCurrentStrokeIndex(currentStrokeIndex + 1);
    }
  };

  // Calculate if we can undo/redo
  const canUndo = currentStrokeIndex >= 0;
  const canRedo = currentStrokeIndex < strokeHistory.length - 1;

  return (
    <DrawingContext.Provider
      value={{
        isDrawing,
        setIsDrawing,
        drawingPosition,
        setDrawingPosition,
        clearCanvas,
        setClearCanvas,
        brushColor,
        setBrushColor,
        brushSize,
        setBrushSize,
        isEraser,
        setIsEraser,
        handleDownload,
        backgroundImage,
        setBackgroundImage,
        backgroundOpacity,
        setBackgroundOpacity,
        strokeHistory,
        currentStrokeIndex,
        addStroke,
        undo,
        redo,
        canUndo,
        canRedo
      }}
    >
      {children}
    </DrawingContext.Provider>
  );
};

export const useDrawing = (): DrawingContextType => {
  const context = React.useContext(DrawingContext);
  if (context === undefined) {
    throw new Error('useDrawing must be used within a DrawingProvider');
  }
  return context;
};
