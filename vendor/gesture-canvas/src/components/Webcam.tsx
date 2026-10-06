
import React, { useRef, useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';

interface WebcamProps {
  width?: number;
  height?: number;
  onStreamReady: (video: HTMLVideoElement, isActive: boolean) => void;
}

const Webcam: React.FC<WebcamProps> = ({
  width = 640,
  height = 480,
  onStreamReady
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Using setIsStreamActive but not isStreamActive directly
  const [, setIsStreamActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize webcam
  useEffect(() => {
    async function setupWebcam() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const message = "Your browser doesn't support webcam access, which is required for hand tracking.";
        setErrorMessage(message);
        toast({
          title: "Webcam not supported",
          description: message,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      try {
        // Try to get the best possible video constraints for hand tracking
        // Higher resolution helps with detection accuracy, but may cause performance issues
        const constraints = {
          video: {
            width: { ideal: width, min: 320 },
            height: { ideal: height, min: 240 },
            facingMode: 'user',
            // Add these to improve video quality on mobile
            frameRate: { ideal: 30, min: 15 }
          }
        };

        console.log('Requesting camera with constraints:', JSON.stringify(constraints));

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          console.log('Camera access granted, setting up video element');

          // Log the actual constraints we got
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            const settings = videoTrack.getSettings();
            console.log('Camera settings:', settings);
          }

          videoRef.current.srcObject = stream;
          setIsStreamActive(true);

          // Explicitly set this for cross-browser support
          videoRef.current.playsInline = true;
          videoRef.current.muted = true;

          // Notify parent when video is loaded
          videoRef.current.onloadeddata = () => {
            if (videoRef.current) {
              console.log(`Video ready: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);

              if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
                console.warn('Video has zero dimensions after loading data');
                setTimeout(() => {
                  if (videoRef.current && videoRef.current.videoWidth > 0) {
                    console.log(`Delayed video dimensions: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
                    onStreamReady(videoRef.current, true);
                    setIsLoading(false);
                  } else {
                    setErrorMessage("Failed to initialize camera properly. Please refresh and try again.");
                    onStreamReady(null as any, false);
                    setIsLoading(false);
                  }
                }, 1000);
              } else {
                onStreamReady(videoRef.current, true);
                setIsLoading(false);
              }
            }
          };

          // Ensure video plays
          videoRef.current.play().catch(e => {
            console.error('Error playing video:', e);
            setErrorMessage("Failed to play camera stream. Please refresh and try again.");
          });
        }
      } catch (error: any) {
        console.error('Error accessing webcam:', error);

        let message = "Please allow camera access to use hand tracking features";

        // More helpful error messages based on the actual error
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          message = "Camera access was denied. Please allow camera access and reload the page.";
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          message = "No camera was found on your device.";
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          message = "Your camera is being used by another application. Please close other apps using the camera.";
        }

        setErrorMessage(message);
        toast({
          title: "Webcam access issue",
          description: message,
          variant: "destructive"
        });

        setIsLoading(false);
        onStreamReady(null as any, false);
      }
    }

    setupWebcam();

    // Clean up function
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        setIsStreamActive(false);
      }
    };
  }, [height, width, onStreamReady]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mx-auto mb-2"></div>
            <div>Loading camera...</div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 z-20 p-4">
          <div className="bg-red-900 text-white p-4 rounded-lg max-w-md text-center">
            <p className="font-bold mb-2">Camera Error</p>
            <p>{errorMessage}</p>
            <button
              className="mt-4 bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-md"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover rounded-lg mirror-mode"
        style={{
          transform: 'scaleX(-1)',  // Mirror webcam
          opacity: isLoading || errorMessage ? 0.5 : 1,
          display: errorMessage ? 'none' : 'block'
        }}
      />
    </div>
  );
};

export default Webcam;
