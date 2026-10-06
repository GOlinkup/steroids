import React from 'react';
interface DrawingCanvasProps {
    isDrawing: boolean;
    drawingPosition: {
        x: number;
        y: number;
    } | null;
    clearCanvas: boolean;
    onCanvasCleared: () => void;
    brushColor: string;
    brushSize?: number;
    width?: number;
    height?: number;
    isEraser?: boolean;
    backgroundImage?: string | null;
}
declare const DrawingCanvas: React.FC<DrawingCanvasProps>;
export default DrawingCanvas;
