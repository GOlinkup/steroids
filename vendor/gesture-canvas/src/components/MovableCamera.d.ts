import * as React from 'react';
interface MovableCameraProps {
    onHandGesture: (isDrawing: boolean, position: {
        x: number;
        y: number;
    } | null, clearCanvas: boolean, changeColor: boolean, maxConfidence: number, additionalPositions?: {
        x: number;
        y: number;
    }[]) => void;
    confidence: number;
}
declare const MovableCamera: React.FC<MovableCameraProps>;
export default MovableCamera;
