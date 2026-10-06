
import React, { useCallback, useState } from 'react';
import { useDrawing } from '@/contexts/DrawingContext';
import { toast } from '@/components/ui/use-toast';
import GestureIndicator from './GestureIndicator';

interface GestureHandlerProps {
  children: (props: { onHandGesture: (
    isDrawing: boolean,
    position: { x: number, y: number } | null,
    clearCanvas: boolean,
    changeColor: boolean,
    maxConfidence?: number, // Make this parameter optional
    additionalPositions?: { x: number, y: number }[],
    isPaused?: boolean,
    isDualHandDrawing?: boolean,
    fingerDistance?: number
  ) => void }) => React.ReactNode;
}

const GestureHandler: React.FC<GestureHandlerProps> = ({ children }) => {
  const {
    setIsDrawing,
    setDrawingPosition,
    setClearCanvas,
    setBrushColor,
    brushColor,
    setIsEraser,
    isEraser
  } = useDrawing();

  // Define color options array
  const brushColorOptions = [
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#FF0000' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Blue', value: '#0000FF' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Purple', value: '#800080' },
    { name: 'Orange', value: '#FFA500' },
    { name: 'Pink', value: '#FFC0CB' }
  ];

  // Track last gesture activation to prevent repeated notifications
  const lastGestureRef = React.useRef({
    clearCanvas: false,
    changeColor: false,
    eraserMode: false,
    multiHandDrawing: false,
    pausedDrawing: false,
    clearCanvasHoldStartTime: 0, // Track when clear canvas gesture started
    colorSelectionActive: false  // Track when color selection is active
  });

  // State for color palette visibility
  const [showColorPalette, setShowColorPalette] = useState(false);

  // State for active gesture tracking
  const [activeGesture, setActiveGesture] = useState({
    isDrawing: false,
    isClearCanvas: false,
    isChangeColor: false,
    isEraser: false,
    isPaused: false,
    isDualHandDrawing: false
  });

  // State for clear canvas progress (0-100)
  const [clearCanvasProgress, setClearCanvasProgress] = useState(0);

  // Handle hand gesture detection
  const handleHandGesture = useCallback((
    gestureIsDrawing: boolean,
    position: { x: number, y: number } | null,
    gestureClearCanvas: boolean,
    gestureChangeColor: boolean,
    _maxConfidence?: number, // Optional parameter (unused)
    additionalPositions?: { x: number, y: number }[],
    isPaused?: boolean,
    isDualHandDrawing?: boolean,
    fingerDistance?: number
  ) => {
    // Debug logging removed

    // Update active gesture state for the indicator
    setActiveGesture({
      isDrawing: gestureIsDrawing && !isPaused,
      isClearCanvas: gestureClearCanvas,
      isChangeColor: gestureChangeColor,
      isEraser: isEraser,
      isPaused: !!isPaused,
      isDualHandDrawing: !!isDualHandDrawing
    });

    // Handle pause gesture (closed fist)
    if (isPaused && !lastGestureRef.current.pausedDrawing) {
      setIsDrawing(false);
      setDrawingPosition(null);
      toast({
        title: "Drawing paused",
        description: "Closed fist gesture detected",
        variant: "default"
      });
      lastGestureRef.current.pausedDrawing = true;
    } else if (!isPaused && lastGestureRef.current.pausedDrawing) {
      lastGestureRef.current.pausedDrawing = false;
    }

    // Only set drawing state if not paused
    if (!isPaused) {
      setIsDrawing(gestureIsDrawing);
      setDrawingPosition(position);
    }

    // Handle clear canvas gesture with hold time
    if (gestureClearCanvas) {
      const now = Date.now();

      // If this is the first time we're seeing the clear gesture, record the start time
      if (!lastGestureRef.current.clearCanvas) {
        lastGestureRef.current.clearCanvasHoldStartTime = now;
        lastGestureRef.current.clearCanvas = true;
        setClearCanvasProgress(0);

        // Show a toast indicating the user should hold the gesture
        toast({
          title: "Hold to clear canvas",
          description: "Keep your hand open for 1-2 seconds to clear",
          variant: "default"
        });
      }
      else {
        // Calculate progress as a percentage (0-100)
        const holdTime = now - lastGestureRef.current.clearCanvasHoldStartTime;
        const requiredHoldTime = 1500; // 1.5 seconds
        const progress = Math.min(100, Math.floor((holdTime / requiredHoldTime) * 100));
        setClearCanvasProgress(progress);

        // If we've been holding the gesture for more than 1.5 seconds, clear the canvas
        if (holdTime > requiredHoldTime) {
          setClearCanvas(true);
          toast({
            title: "Canvas cleared",
            description: "Canvas has been cleared by gesture",
            variant: "default"
          });
          // Reset the timer to prevent multiple clears
          lastGestureRef.current.clearCanvasHoldStartTime = now + 3000; // Add a cooldown
          setClearCanvasProgress(0);
        }
      }
    } else if (!gestureClearCanvas && lastGestureRef.current.clearCanvas) {
      lastGestureRef.current.clearCanvas = false;
      lastGestureRef.current.clearCanvasHoldStartTime = 0;
      setClearCanvasProgress(0);
    }

    // Handle color selection gesture (three fingers extended)
    if (gestureChangeColor) {
      if (!lastGestureRef.current.colorSelectionActive) {
        // Show color palette
        setShowColorPalette(true);
        toast({
          title: "Color selection mode",
          description: "Move your hand to select a color",
          variant: "default"
        });
        lastGestureRef.current.colorSelectionActive = true;
      }

      // If we have a position, use it to select a color based on position
      if (position) {
        // Determine which color to select based on position
        // This is a simple implementation - divide the screen into sections for each color
        const colorIndex = Math.min(
          Math.floor((position.x / window.innerWidth) * brushColorOptions.length),
          brushColorOptions.length - 1
        );

        // Only change color if it's different from current
        if (brushColor !== brushColorOptions[colorIndex].value) {
          setBrushColor(brushColorOptions[colorIndex].value);
          toast({
            title: "Color selected",
            description: `Brush color set to ${brushColorOptions[colorIndex].name}`,
            variant: "default"
          });
        }
      }
    } else {
      // Hide color palette when not in color selection mode
      if (lastGestureRef.current.colorSelectionActive) {
        setShowColorPalette(false);
        lastGestureRef.current.colorSelectionActive = false;
      }
    }

    // Handle eraser mode activation/deactivation
    if (position && fingerDistance) {
      // Check if we're in eraser mode
      if (position && fingerDistance > 0) {
        if (!lastGestureRef.current.eraserMode) {
          setIsEraser(true);
          toast({
            title: "Eraser activated",
            description: "Two fingers up gesture detected",
            variant: "default"
          });
          lastGestureRef.current.eraserMode = true;
        }
      } else if (isEraser && lastGestureRef.current.eraserMode) {
        setIsEraser(false);
        lastGestureRef.current.eraserMode = false;
      }
    }

    // Handle dual-hand drawing
    if (isDualHandDrawing && additionalPositions && additionalPositions.length > 0) {
      // Log multi-hand drawing activity
      console.log(`Drawing with multiple hands: Primary position and ${additionalPositions.length} additional positions`);

      // Show toast notification for multi-hand drawing the first time it's detected
      if (!lastGestureRef.current.multiHandDrawing) {
        toast({
          title: "Multi-hand drawing active",
          description: "Drawing with both hands simultaneously",
          variant: "default"
        });
        lastGestureRef.current.multiHandDrawing = true;
      }
    } else if (lastGestureRef.current.multiHandDrawing) {
      // Reset multi-hand drawing state when no longer using multiple hands
      lastGestureRef.current.multiHandDrawing = false;
    }
  }, [setIsDrawing, setDrawingPosition, setClearCanvas, setBrushColor, brushColor, setIsEraser, isEraser, brushColorOptions]);

  return (
    <>
      {/* Color Palette Modal */}
      {showColorPalette && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 p-4 rounded-lg shadow-lg border border-gray-200 max-w-md w-full">
            <h3 className="text-lg font-bold mb-2">Select a Color</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {brushColorOptions.map((color) => (
                <div
                  key={color.value}
                  className={`w-16 h-16 rounded-full cursor-pointer transition-all duration-200 flex items-center justify-center
                             ${brushColor === color.value ? 'ring-4 ring-blue-500 scale-110' : 'ring-1 ring-gray-300'}`}
                  style={{
                    backgroundColor: color.value,
                    transform: `scale(${brushColor === color.value ? 1.1 : 1})`
                  }}
                >
                  {brushColor === color.value && (
                    <span className={`text-${color.value === '#000000' || color.value === '#0000FF' || color.value === '#800080' ? 'white' : 'black'} text-xs font-bold`}>
                      Selected
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Move your hand to select a color, or close your hand to exit
            </p>
          </div>
        </div>
      )}

      {/* Gesture Indicator */}
      <GestureIndicator
        activeGesture={activeGesture}
        clearCanvasProgress={clearCanvasProgress}
      />

      {/* Render children with the gesture handler */}
      {children({ onHandGesture: handleHandGesture })}
    </>
  );
};

export default GestureHandler;
