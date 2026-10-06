import * as React from 'react';
interface DrawingContextType {
    isDrawing: boolean;
    setIsDrawing: (isDrawing: boolean) => void;
    drawingPosition: {
        x: number;
        y: number;
    } | null;
    setDrawingPosition: (pos: {
        x: number;
        y: number;
    } | null) => void;
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
export declare const DrawingProvider: React.FC<{
    children: React.ReactNode;
}>;
export declare const useDrawing: () => DrawingContextType;
export {};
