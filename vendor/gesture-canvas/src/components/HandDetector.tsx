import React, { useEffect, useRef, useState } from 'react';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import { detectHand, HandDetection, initializeHandTracking } from '@/utils/handTracking';
import { toast } from '@/components/ui/use-toast';
import { useDrawing } from '@/contexts/DrawingContext';

interface HandDetectorProps {
  videoElement: HTMLVideoElement | null;
  onHandDetection: (detection: HandDetection) => void;
}

export const HandDetector: React.FC<HandDetectorProps> = ({
  videoElement,
  onHandDetection
}) => {
  const [detector, setDetector] = useState<handPoseDetection.HandDetector | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // Using setIsEraserActive but not isEraserActive directly
  const [, setIsEraserActive] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const requestRef = useRef<number>();
  const { setIsEraser } = useDrawing();

  // Initialize the hand pose detection model
  useEffect(() => {
    const initialize = async () => {
      if (isInitialized || !videoElement) return;

      try {
        console.log('Starting hand tracking initialization...');

        // Check if camera is ready
        if (videoElement.readyState < 4) {
          console.log('Video element not ready yet, waiting...');
          setTimeout(initialize, 1000);
          return;
        }

        // Log video dimensions to help debug input issues
        console.log(`Video dimensions: ${videoElement.videoWidth} x ${videoElement.videoHeight}`);

        if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
          console.warn('Video has invalid dimensions - waiting for video to be ready');
          setTimeout(initialize, 1000);
          return;
        }

        const handDetector = await initializeHandTracking();

        if (handDetector) {
          console.log('Hand tracking initialized successfully');

          // Try an immediate test detection to verify the pipeline works
          try {
            console.log('Testing hand detection pipeline...');
            const testDetection = await detectHand(handDetector, videoElement);
            console.log('Initial detection test result:',
              testDetection.isHandDetected ? 'Hand detected' : 'No hand detected (normal if no hand is visible)');

            // Log more details about the test detection
            console.log('Test detection details:', {
              isHandDetected: testDetection.isHandDetected,
              handsCount: testDetection.hands.length,
              handsWithLandmarks: testDetection.hands.filter(h => h.landmarks && h.landmarks.length > 0).length,
              primaryHandLandmarks: testDetection.hands[0]?.landmarks ? 'Available' : 'Not available'
            });
          } catch (testError) {
            console.warn('Initial detection test failed:', testError);
            // Continue anyway as this might be because no hand is visible yet
          }

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
          setTimeout(initialize, 3000); // Wait 3 seconds before retrying
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

  // Store previous detection state to avoid unnecessary updates
  const prevDetectionRef = useRef<{
    isEraserActive: boolean;
    confidence: number;
  }>({
    isEraserActive: false,
    confidence: 0
  });

  // Run hand detection loop
  useEffect(() => {
    if (!isDetecting || !detector || !videoElement) return;

    let isActive = true;
    let frameCount = 0;
    const maxFramesWithoutDetection = 300; // About 10 seconds at 30fps
    let reinitializeRequested = false;
    let lastReinitTime = 0;
    let lastDetectionTime = 0;
    let frameSkip = 0; // For throttling detection on slower devices
    let consecutiveFailures = 0; // Track consecutive detection failures

    const detectFrame = async () => {
      if (!isActive || !detector || !videoElement || reinitializeRequested) return;

      try {
        const now = Date.now();

        // Throttle detection on slower devices to maintain performance
        if (frameSkip > 0) {
          frameSkip--;
          requestRef.current = requestAnimationFrame(detectFrame);
          return;
        }

        // Verify video is still playing and has dimensions before detecting
        if (videoElement.readyState < 4 || videoElement.paused ||
            videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
          console.warn('Video element is not in a valid state for detection');
          requestRef.current = requestAnimationFrame(detectFrame);
          return;
        }

        // Detect hand in current frame
        const detection = await detectHand(detector, videoElement);
        lastDetectionTime = Date.now();

        // Adjust frame skipping based on detection time
        const detectionTime = lastDetectionTime - now;
        if (detectionTime > 50) { // If detection takes more than 50ms
          frameSkip = Math.min(3, Math.floor(detectionTime / 20)); // Skip up to 3 frames
        }

        // Reset frame count if hand is detected
        if (detection.isHandDetected) {
          frameCount = 0;
          consecutiveFailures = 0;
        } else {
          frameCount++;
          consecutiveFailures++;
        }

        // If we have too many consecutive failures, try to reinitialize
        if (consecutiveFailures >= 50) {
          console.warn('Too many consecutive detection failures, attempting to reinitialize...');
          detector.dispose?.();
          setDetector(null);
          setIsInitialized(false);
          setRetryCount(0);
          return;
        }

        // If no hand detected for too long, try to reinitialize, but not too frequently
        const timeSinceLastReinit = now - lastReinitTime;

        if (frameCount >= maxFramesWithoutDetection && timeSinceLastReinit > 30000) { // At least 30 seconds between reinits
          console.log('No hand detected for too long, attempting to reinitialize...');
          toast({
            title: "Checking hand detection",
            description: "Please show your hand to the camera if you want to use hand tracking",
            variant: "default"
          });

          reinitializeRequested = true;
          lastReinitTime = now;

          // Use setTimeout to prevent blocking the UI
          setTimeout(() => {
            if (isActive) {
              setIsInitialized(false);
              setRetryCount(0);
            }
          }, 500);

          return;
        }

        // Update eraser mode based on gesture
        if (detection.isHandDetected) {
          // Check any hand for eraser gesture
          const anyHandHasEraserGesture = detection.hands.some(hand => hand.gesture.isEraser);

          // Only update state if the value has changed
          if (anyHandHasEraserGesture !== prevDetectionRef.current.isEraserActive) {
            setIsEraserActive(anyHandHasEraserGesture);
            setIsEraser(anyHandHasEraserGesture);
            prevDetectionRef.current.isEraserActive = anyHandHasEraserGesture;
          }

          // Update confidence more frequently for better UI feedback
          if (Math.abs(detection.handInViewConfidence - prevDetectionRef.current.confidence) > 0.01) {
            setConfidence(detection.handInViewConfidence);
            prevDetectionRef.current.confidence = detection.handInViewConfidence;
            console.log('Hand confidence updated to:', detection.handInViewConfidence);
          }
        } else if (prevDetectionRef.current.confidence > 0) {
          // Only update if confidence was previously non-zero
          setConfidence(0);
          prevDetectionRef.current.confidence = 0;
        }

        // Send detection results to parent component
        onHandDetection(detection);
      } catch (error) {
        console.error('Error in hand detection frame:', error);
        // If we get an error, skip a few frames to avoid overwhelming the system
        frameSkip = 5;
      }

      // Continue detection loop
      if (isActive && !reinitializeRequested) {
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
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{
        opacity: confidence,
        transition: 'opacity 0.3s ease-in-out'
      }}
      data-confidence={confidence.toString()}
    />
  );
};
