import React, { useEffect, useRef, useState } from 'react';
import { HandDetection, drawHandLandmarks } from '@/utils/handTracking';

interface HandLandmarkRendererProps {
  videoElement: HTMLVideoElement;
  detection: HandDetection | null;
}

export const HandLandmarkRenderer: React.FC<HandLandmarkRendererProps> = ({
  videoElement,
  detection
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store dimensions to maintain consistency
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 640, height: 360 });

  // Track the actual display dimensions for scaling
  const [, setDisplayDimensions] = useState({ width: 0, height: 0 });

  // Update canvas dimensions when video dimensions change
  useEffect(() => {
    if (!videoElement) return;

    // Wait for video dimensions to be available
    const checkVideoDimensions = () => {
      if (videoElement.videoWidth && videoElement.videoHeight) {
        // Always use the actual video dimensions for the internal canvas size
        console.log(`Updating canvas dimensions to match video: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
        setCanvasDimensions({
          width: videoElement.videoWidth,
          height: videoElement.videoHeight
        });
      } else {
        // If dimensions aren't available yet, check again in a moment
        setTimeout(checkVideoDimensions, 100);
      }
    };

    checkVideoDimensions();
  }, [videoElement]);

  // Track the container size for proper scaling
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDisplayDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDisplayDimensions({
          width: rect.width,
          height: rect.height
        });
        console.log(`Display dimensions updated: ${rect.width}x${rect.height}`);
      }
    };

    // Initial update
    updateDisplayDimensions();

    // Set up resize observer to track container size changes
    const resizeObserver = new ResizeObserver(updateDisplayDimensions);
    resizeObserver.observe(containerRef.current);

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !videoElement) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Always use the actual video dimensions for the internal canvas size
    const videoWidth = videoElement.videoWidth || 640;
    const videoHeight = videoElement.videoHeight || 360;

    // Set canvas dimensions to match the video's internal dimensions
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // Debug logging removed

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw landmarks for each detected hand
    if (detection && detection.isHandDetected) {
      // Debug logging removed

      // Save the current transformation matrix
      ctx.save();

      // Apply transformations to match the video display
      // First translate to center, then scale (mirror), then translate back
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      // Draw landmarks for each hand
      detection.hands.forEach((hand, index) => {
        // Debug logging removed

        // Check if hand has valid landmarks
        if (hand.landmarks && Array.isArray(hand.landmarks)) {
          // Verify landmarks have valid coordinates
          const validLandmarks = hand.landmarks.filter(lm =>
            typeof lm.x === 'number' && !isNaN(lm.x) &&
            typeof lm.y === 'number' && !isNaN(lm.y)
          );

          if (validLandmarks.length > 0) {
            // Draw all hand landmarks with labels
            drawHandLandmarks(ctx, validLandmarks, {
              color: hand.handedness === 'Right' ? 'lime' : 'yellow',
              radius: 6,
              showLabels: true, // Show labels for all landmarks
              mirrorX: true // The canvas is already mirrored, so don't mirror the points again
            });

            // Draw index finger position with special highlight
            if (hand.indexFingerPosition &&
                typeof hand.indexFingerPosition.x === 'number' && !isNaN(hand.indexFingerPosition.x) &&
                typeof hand.indexFingerPosition.y === 'number' && !isNaN(hand.indexFingerPosition.y)) {
              ctx.fillStyle = '#0000FF';
              ctx.beginPath();
              ctx.arc(
                hand.indexFingerPosition.x,
                hand.indexFingerPosition.y,
                7,
                0,
                2 * Math.PI
              );
              ctx.fill();
            }

            // Add hand label
            ctx.fillStyle = hand.handedness === 'Right' ? 'lime' : 'yellow';
            ctx.font = '16px Arial';

            // Find wrist or use first valid landmark
            const wrist = hand.landmarks.find(lm => lm.name === 'wrist') || validLandmarks[0];
            if (wrist) {
              ctx.fillText(hand.handedness, wrist.x, wrist.y - 10);
            }
          } else {
            console.warn(`Hand ${index} has no valid landmark coordinates`);
          }
        } else {
          console.warn(`Hand ${index} missing valid landmarks array`);
        }
      });

      // Restore the original transformation matrix
      ctx.restore();
    }
  }, [detection, videoElement, canvasDimensions]);

  return (
    <div
      ref={containerRef}
      className="absolute top-0 left-0 w-full h-full"
      style={{
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasDimensions.width}
        height={canvasDimensions.height}
        style={{
          pointerEvents: 'none',
          // We're handling mirroring in the drawing code now, not with CSS
          opacity: detection?.isHandDetected ? 1 : 0,
          transition: 'opacity 0.3s ease-in-out',
          width: '100%',
          height: '100%',
          objectFit: 'cover', // Use cover to match video dimensions
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
    </div>
  );
};
