import React from 'react';
interface HandTrackingWebcamProps {
    onHandGesture: (isDrawing: boolean, position: {
        x: number;
        y: number;
    } | null, clearCanvas: boolean, changeColor: boolean, maxConfidence: number, additionalPositions?: {
        x: number;
        y: number;
    }[], isPaused?: boolean, isDualHandDrawing?: boolean, fingerDistance?: number) => void;
    width?: number;
    height?: number;
}
export declare const HandTrackingWebcam: React.FC<HandTrackingWebcamProps>;
export default HandTrackingWebcam;
