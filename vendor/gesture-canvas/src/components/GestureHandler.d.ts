import React from 'react';
interface GestureHandlerProps {
    children: (props: {
        onHandGesture: (isDrawing: boolean, position: {
            x: number;
            y: number;
        } | null, clearCanvas: boolean, changeColor: boolean, maxConfidence?: number, // Make this parameter optional
        additionalPositions?: {
            x: number;
            y: number;
        }[], isPaused?: boolean, isDualHandDrawing?: boolean, fingerDistance?: number) => void;
    }) => React.ReactNode;
}
declare const GestureHandler: React.FC<GestureHandlerProps>;
export default GestureHandler;
