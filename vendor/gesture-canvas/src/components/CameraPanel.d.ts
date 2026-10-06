import React from 'react';
interface CameraPanelProps {
    onSwapPanels?: () => void;
    onHandGesture: (isDrawing: boolean, position: {
        x: number;
        y: number;
    } | null, clearCanvas: boolean, changeColor: boolean, maxConfidence: number, additionalPositions?: {
        x: number;
        y: number;
    }[]) => void;
    confidence: number;
}
declare const CameraPanel: React.FC<CameraPanelProps>;
export default CameraPanel;
