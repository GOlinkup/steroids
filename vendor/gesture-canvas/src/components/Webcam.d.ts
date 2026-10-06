import React from 'react';
interface WebcamProps {
    width?: number;
    height?: number;
    onStreamReady: (video: HTMLVideoElement, isActive: boolean) => void;
}
declare const Webcam: React.FC<WebcamProps>;
export default Webcam;
