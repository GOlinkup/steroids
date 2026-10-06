import React, { useEffect, useRef, useState } from 'react';
import { HandDetector } from './HandDetector';
import { HandLandmarkRenderer } from './HandLandmarkRenderer';
import { HandDetection } from '@/utils/handTracking';
import { useApp } from '@/contexts/AppContext';
import { useDrawing } from '@/contexts/DrawingContext';
import { PointSmoother } from '@/utils/smoothing';

interface HandTrackingWebcamProps {
  onHandGesture: (
    isDrawing: boolean,
    position: { x: number, y: number } | null,
    clearCanvas: boolean,
    changeColor: boolean,
    maxConfidence: number,
    additionalPositions?: { x: number, y: number }[],
    isPaused?: boolean,
    isDualHandDrawing?: boolean,
    fingerDistance?: number
  ) => void;
  width?: number;
  height?: number;
}

export const HandTrackingWebcam: React.FC<HandTrackingWebcamProps> = ({
  onHandGesture,
  width = 640,
  height = 480
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [detection, setDetection] = useState<HandDetection | null>(null);
  const { cameraEnabled } = useApp();

  // Initialize camera with fixed aspect ratio
  useEffect(() => {
    if (!cameraEnabled) return;

    const initializeCamera = async () => {
      try {
        // Request a specific aspect ratio (16:9) to maintain consistency
        const aspectRatio = 16 / 9;
        const targetWidth = 640;
        const targetHeight = Math.round(targetWidth / aspectRatio);

        console.log(`Requesting camera with fixed dimensions: ${targetWidth}x${targetHeight}`);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: targetWidth, max: 1280 },
            height: { ideal: targetHeight, max: 720 },
            aspectRatio: { ideal: aspectRatio },
            facingMode: 'user',
            frameRate: { ideal: 30 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // Wait for video to be ready before playing
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              // Log the actual dimensions we got
              console.log(`Camera initialized with dimensions: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);

              // Ensure the video element has the correct internal dimensions
              // This is crucial for proper hand tracking coordinates
              videoRef.current.width = videoRef.current.videoWidth;
              videoRef.current.height = videoRef.current.videoHeight;

              videoRef.current.play().catch(console.error);
            }
          };
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
      }
    };

    initializeCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraEnabled]);

  // Update video element when ref changes
  useEffect(() => {
    if (videoRef.current) {
      setVideoElement(videoRef.current);
    }
  }, [videoRef.current]);

  // Get drawing context functions
  const { setIsEraser } = useDrawing();

  // Initialize smoothers ref
  // We use a map to support multiple hands, though primarily we focus on the first one
  const smoothersRef = useRef<Map<string, PointSmoother>>(new Map());

  // Debounce state for drawing
  const drawingStabilityCounter = useRef<number>(0);
  const STABILITY_THRESHOLD = 2; // Need 2 consecutive frames to switch state ideally, but we'll use a counter
  const MAX_STABILITY = 5;

  // Cleanup smoothers on unmount
  useEffect(() => {
    return () => {
      smoothersRef.current.clear();
    };
  }, []);

  // Handle hand detection
  const handleHandDetection = (detection: HandDetection) => {
    setDetection(detection);

    // Process gestures and notify parent component
    if (detection.isHandDetected && detection.hands.length > 0) {
      // Get the hand with highest confidence for confidence reporting
      const sortedHands = [...detection.hands].sort((a, b) => b.confidence - a.confidence);
      const maxConfidence = sortedHands[0].confidence;

      // Separate hands by handedness - only need right hand for preference
      const rightHand = detection.hands.find(h => h.handedness === 'Right');

      // Track all drawing positions from all hands
      // Include isDrawing flag for each position
      let drawingPositions: { x: number, y: number, isDrawing?: boolean }[] = [];

      // Process all hands to collect drawing positions
      detection.hands.forEach((hand, index) => {
        if (!hand.isDetected) return;

        // Get or create smoother for this hand index
        const handId = `hand-${index}`; // Simple ID based on index for now
        if (!smoothersRef.current.has(handId)) {
          smoothersRef.current.set(handId, new PointSmoother(0.5));
        }
        const smoother = smoothersRef.current.get(handId)!;

        // If hand has a valid index finger position, consider it for drawing
        if (hand.indexFingerPosition) {
          // Validate coordinates before using them
          const { x, y } = hand.indexFingerPosition;

          // Check if coordinates are valid numbers
          if (typeof x === 'number' && !isNaN(x) &&
            typeof y === 'number' && !isNaN(y)) {

            // Mirror the x-coordinate for natural drawing and ensure values are within bounds
            // Note: Mirroring matches the visual feed
            const rawX = Math.min(width, Math.max(0, width - x));
            const rawY = Math.min(height, Math.max(0, y));

            // Apply smoothing
            const smoothed = smoother.smooth({ x: rawX, y: rawY });

            // Add the position to our list, along with the drawing state
            drawingPositions.push({
              x: smoothed.x,
              y: smoothed.y,
              isDrawing: hand.gesture.isDrawing
            });
          }
        }
      });

      // Update eraser mode based on any hand having eraser gesture
      const anyEraser = detection.gesture.isEraser;
      if (anyEraser !== (setIsEraser as any).isEraser) {
        setIsEraser(anyEraser);
      }

      // Determine primary drawing position (prefer right hand if available)
      let primaryDrawingPosition = null;
      let rawIsDrawing = false;

      // Find drawing positions that are actually in drawing mode
      const activeDrawingPositions = drawingPositions.filter(pos => pos.isDrawing);

      // Simple logic: if any hand is drawing, we are drawing
      if (activeDrawingPositions.length > 0) {
        // Prefer right hand if available logic...
        // For simplicity and stability, let's stick to the first active one or right hand one
        const rightHandPos = rightHand ? drawingPositions.find((pos, idx) => detection.hands[idx].handedness === 'Right' && pos.isDrawing) : null;

        if (rightHandPos) {
          primaryDrawingPosition = { x: rightHandPos.x, y: rightHandPos.y };
          rawIsDrawing = true;
        } else {
          primaryDrawingPosition = { x: activeDrawingPositions[0].x, y: activeDrawingPositions[0].y };
          rawIsDrawing = true;
        }
      }
      // If no active drawing positions, track cursor
      else if (drawingPositions.length > 0) {
        // Just use the first position for cursor
        primaryDrawingPosition = { x: drawingPositions[0].x, y: drawingPositions[0].y };
        rawIsDrawing = false;
      }

      // --- Debouncing / Stability Logic for Drawing State ---
      if (rawIsDrawing) {
        drawingStabilityCounter.current = Math.min(drawingStabilityCounter.current + 1, MAX_STABILITY);
      } else {
        drawingStabilityCounter.current = Math.max(drawingStabilityCounter.current - 1, 0);
      }

      // We consider "Drawing" to be true if stability > threshold
      // This prevents flickering if one frame is missed
      const effectiveIsDrawing = drawingStabilityCounter.current >= STABILITY_THRESHOLD;

      // Remove the primary position from additional positions to avoid duplicates
      const secondaryDrawingPositions = activeDrawingPositions
        .filter(pos => !primaryDrawingPosition ||
          Math.abs(pos.x - primaryDrawingPosition.x) > 5 ||
          Math.abs(pos.y - primaryDrawingPosition.y) > 5
        )
        .map(pos => ({ x: pos.x, y: pos.y }));

      // Get finger distance
      let fingerDistance = detection.gesture.fingerDistance || 0;

      onHandGesture(
        effectiveIsDrawing,
        primaryDrawingPosition,
        detection.gesture.isClearCanvas,
        detection.gesture.isChangeColor,
        maxConfidence,
        secondaryDrawingPositions.length > 0 ? secondaryDrawingPositions : undefined,
        detection.gesture.isPaused,
        detection.gesture.isDualHandDrawing,
        fingerDistance
      );

    } else {
      // No hands detected
      // Reset smoothers
      smoothersRef.current.clear();
      drawingStabilityCounter.current = 0; // Reset stability

      onHandGesture(false, null, false, false, 0, undefined, false, false, 0);
    }
  };

  // Define fixed dimensions for consistency
  const fixedWidth = 640;
  const fixedHeight = 360; // 16:9 aspect ratio

  return (
    <div className="relative" style={{
      width: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
      // Create a fixed aspect ratio container
      paddingBottom: `${(fixedHeight / fixedWidth) * 100}%`, // Maintain 16:9 aspect ratio
      position: 'relative'
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
      }}>
        <div className="relative w-full h-full">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              transform: 'scaleX(-1)', // Mirror the video
              display: cameraEnabled ? 'block' : 'none',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0
            }}
          />
          {videoElement && (
            <>
              <HandDetector
                videoElement={videoElement}
                onHandDetection={handleHandDetection}
              />
              <HandLandmarkRenderer
                videoElement={videoElement}
                detection={detection}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HandTrackingWebcam;
