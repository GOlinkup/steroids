import React from 'react';
import { HandDetection } from '@/utils/handTracking';
interface HandLandmarkRendererProps {
    videoElement: HTMLVideoElement;
    detection: HandDetection | null;
}
export declare const HandLandmarkRenderer: React.FC<HandLandmarkRendererProps>;
export {};
