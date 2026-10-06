import { CanvasState, DrawingTool } from '@/types';
export declare const useCanvas: (initialTool: DrawingTool) => {
    canvasState: CanvasState;
    canvasRef: import("react").RefObject<HTMLCanvasElement>;
    startDrawing: (x: number, y: number) => void;
    draw: (x: number, y: number) => void;
    stopDrawing: () => void;
    clearCanvas: () => void;
    setTool: (tool: DrawingTool) => void;
};
