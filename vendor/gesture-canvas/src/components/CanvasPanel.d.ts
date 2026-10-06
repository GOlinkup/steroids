import * as React from 'react';
interface CanvasPanelProps {
    onSwapPanels?: () => void;
    additionalDrawingPositions?: {
        x: number;
        y: number;
    }[];
    onFullscreenToggle?: (isFullscreen: boolean) => void;
    isFullscreen?: boolean;
    confidence?: number;
}
declare const CanvasPanel: React.FC<CanvasPanelProps>;
export default CanvasPanel;
