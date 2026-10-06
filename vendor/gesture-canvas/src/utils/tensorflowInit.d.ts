import '@tensorflow/tfjs-converter';
import '@tensorflow/tfjs-backend-webgl';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
export declare const initializeTensorFlow: () => Promise<void>;
export declare const createHandDetector: () => Promise<handPoseDetection.HandDetector>;
