import React from 'react';
import { HandDetection } from '@/utils/handTracking';
interface HandDetectorProps {
    videoElement: HTMLVideoElement | null;
    onHandDetection: (detection: HandDetection) => void;
}
export declare const HandDetector: React.FC<HandDetectorProps>;
export {};
