import * as React from 'react';
interface MultiHandDrawingCanvasProps {
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
    additionalDrawingPositions?: {
        x: number;
        y: number;
    }[];
    isEraser?: boolean;
    isFullscreen?: boolean;
    backgroundImage?: string | null;
    backgroundOpacity?: number;
}
declare const MultiHandDrawingCanvas: React.FC<MultiHandDrawingCanvasProps>;
export default MultiHandDrawingCanvas;
