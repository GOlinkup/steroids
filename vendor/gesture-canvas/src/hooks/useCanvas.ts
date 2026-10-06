import { useState, useCallback, useRef } from 'react';
import { CanvasState, DrawingTool } from '@/types';

export const useCanvas = (initialTool: DrawingTool) => {
  const [canvasState, setCanvasState] = useState<CanvasState>({
    isDrawing: false,
    currentTool: initialTool,
    paths: [],
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startDrawing = useCallback((x: number, y: number) => {
    setCanvasState(prev => ({
      ...prev,
      isDrawing: true,
      paths: [
        ...prev.paths,
        {
          points: [{ x, y }],
          tool: prev.currentTool,
        },
      ],
    }));
  }, []);

  const draw = useCallback((x: number, y: number) => {
    if (!canvasState.isDrawing) return;

    setCanvasState(prev => ({
      ...prev,
      paths: prev.paths.map((path, index) => {
        if (index === prev.paths.length - 1) {
          return {
            ...path,
            points: [...path.points, { x, y }],
          };
        }
        return path;
      }),
    }));
  }, [canvasState.isDrawing]);

  const stopDrawing = useCallback(() => {
    setCanvasState(prev => ({
      ...prev,
      isDrawing: false,
    }));
  }, []);

  const clearCanvas = useCallback(() => {
    setCanvasState(prev => ({
      ...prev,
      paths: [],
    }));
  }, []);

  const setTool = useCallback((tool: DrawingTool) => {
    setCanvasState(prev => ({
      ...prev,
      currentTool: tool,
    }));
  }, []);

  return {
    canvasState,
    canvasRef,
    startDrawing,
    draw,
    stopDrawing,
    clearCanvas,
    setTool,
  };
}; 