
import React, { useEffect, useRef, useState } from 'react';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import { detectHand, HandDetection, initializeHandTracking } from '@/utils/handTracking';
import { toast } from '@/components/ui/use-toast';
import { useDrawing } from '@/contexts/DrawingContext';

interface HandDetectorProps {
  videoElement: HTMLVideoElement | null;
  onHandDetection: (detection: HandDetection) => void;
}

const HandDetector: React.FC<HandDetectorProps> = ({
  videoElement,
  onHandDetection
}) => {
  const [detector, setDetector] = useState<handPoseDetection.HandDetector | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isEraserActive, setIsEraserActive] = useState(false);
  const requestRef = useRef<number>();
  const { setIsEraser } = useDrawing();

  // Initialize the hand pose detection model
  useEffect(() => {
    const initialize = async () => {
      if (isInitialized || !videoElement) return;

      try {
        console.log('Starting hand tracking initialization...');
        const handDetector = await initializeHandTracking();

        if (handDetector) {
          console.log('Hand tracking initialized successfully');
          setDetector(handDetector);
          setIsInitialized(true);
          setIsDetecting(true);
          setRetryCount(0);

          toast({
            title: "Hand tracking ready",
            description: "Hold up your hand in front of the camera to draw"
          });
        } else {
          throw new Error('Failed to initialize hand tracking model');
        }
      } catch (error) {
        console.error('Error initializing hand tracking:', error);

        // Retry initialization up to 3 times
        if (retryCount < 3) {
          console.log(`Retrying initialization (attempt ${retryCount + 1}/3)...`);
          setRetryCount(prev => prev + 1);
          setTimeout(initialize, 2000); // Wait 2 seconds before retrying
        } else {
          // Fall back to drawing without hand tracking
          toast({
            title: "Hand tracking unavailable",
            description: "Drawing with mouse/touch is enabled instead. You can still draw by clicking/touching the canvas.",
            variant: "default"
          });

          // Notify parent that we're in fallback mode
          onHandDetection({
            isHandDetected: false,
            hands: [],
            landmarks: null,
            handInViewConfidence: 0,
            indexFingerPosition: null,
            gesture: {
              isDrawing: false,
              isClearCanvas: false,
              isChangeColor: false,
              isEraser: false,
              isPaused: false,
              isDualHandDrawing: false,
              fingerDistance: 0,
              gestureHoldTime: 0
            }
          });
        }
      }
    };

    initialize();
  }, [videoElement, isInitialized, retryCount, onHandDetection]);

  // Run hand detection loop
  useEffect(() => {
    if (!isDetecting || !detector || !videoElement) return;

    let isActive = true;
    let frameCount = 0;
    const maxFramesWithoutDetection = 30; // About 1 second at 30fps

    const detectFrame = async () => {
      if (!isActive || !detector || !videoElement) return;

      try {
        // Detect hand in current frame
        const detection = await detectHand(detector, videoElement);

        // Reset frame count if hand is detected
        if (detection.isHandDetected) {
          frameCount = 0;
        } else {
          frameCount++;
        }

        // If no hand detected for too long, try to reinitialize
        if (frameCount >= maxFramesWithoutDetection) {
          console.log('No hand detected for too long, attempting to reinitialize...');
          setIsInitialized(false);
          setRetryCount(0);
          return;
        }

        // Update eraser mode based on gesture
        if (detection.isHandDetected) {
          // Check any hand for eraser gesture
          const anyHandHasEraserGesture = detection.hands.some(hand => hand.gesture.isEraser);

          if (anyHandHasEraserGesture) {
            setIsEraserActive(true);
            setIsEraser(true);
          } else {
            setIsEraserActive(false);
            setIsEraser(false);
          }
        }

        // Send detection results to parent component
        onHandDetection(detection);
      } catch (error) {
        console.error('Error in hand detection frame:', error);
      }

      // Continue detection loop
      if (isActive) {
        requestRef.current = requestAnimationFrame(detectFrame);
      }
    };

    // Start detection loop
    requestRef.current = requestAnimationFrame(detectFrame);

    // Cleanup function
    return () => {
      isActive = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isDetecting, detector, videoElement, onHandDetection, setIsEraser]);

  return (
    <div
      id="hand-detector"
      data-eraser-active={isEraserActive ? "true" : "false"}
      className="hidden"
    />
  );
};

export default HandDetector;
