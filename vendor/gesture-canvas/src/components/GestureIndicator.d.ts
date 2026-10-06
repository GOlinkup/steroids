import React from 'react';
interface GestureIndicatorProps {
    activeGesture: {
        isDrawing: boolean;
        isClearCanvas: boolean;
        isChangeColor: boolean;
        isEraser: boolean;
        isPaused: boolean;
        isDualHandDrawing: boolean;
    };
    clearCanvasProgress?: number;
}
declare const GestureIndicator: React.FC<GestureIndicatorProps>;
export default GestureIndicator;
