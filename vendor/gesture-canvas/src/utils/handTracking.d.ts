import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
export interface SingleHandDetection {
    isDetected: boolean;
    landmarks: {
        x: number;
        y: number;
        z: number;
        name: string;
    }[] | null;
    confidence: number;
    indexFingerPosition: {
        x: number;
        y: number;
    } | null;
    handedness: 'Left' | 'Right' | 'Unknown';
    gesture: {
        isDrawing: boolean;
        isClearCanvas: boolean;
        isChangeColor: boolean;
        isEraser: boolean;
        isPaused: boolean;
        isPinching?: boolean;
        isDualHandDrawing: boolean;
        fingerDistance?: number;
        gestureHoldTime?: number;
    };
}
export interface HandDetection {
    isHandDetected: boolean;
    hands: SingleHandDetection[];
    landmarks: {
        x: number;
        y: number;
        z: number;
        name: string;
    }[][] | null;
    handInViewConfidence: number;
    indexFingerPosition: {
        x: number;
        y: number;
    } | null;
    gesture: {
        isDrawing: boolean;
        isClearCanvas: boolean;
        isChangeColor: boolean;
        isEraser: boolean;
        isPaused: boolean;
        isDualHandDrawing: boolean;
        fingerDistance?: number;
        gestureHoldTime?: number;
    };
}
export declare const initializeHandTracking: () => Promise<handPoseDetection.HandDetector | null>;
export declare const drawHandLandmarks: (ctx: CanvasRenderingContext2D, landmarks: {
    x: number;
    y: number;
    z?: number;
    name?: string;
}[], options?: {
    color?: string;
    radius?: number;
    showLabels?: boolean;
    mirrorX?: boolean;
}) => void;
export declare const analyzeSingleHand: (hand: any, videoWidth?: number, videoHeight?: number) => SingleHandDetection;
export declare const detectHand: (detector: handPoseDetection.HandDetector | null, video: HTMLVideoElement | null) => Promise<HandDetection>;
