
import * as React from 'react';
import { toast } from '@/components/ui/use-toast';
import { drawImageOnCanvas } from '@/utils/imageUtils';
import { Color } from '@/utils/colorUtils';

interface MultiHandDrawingCanvasProps {
  isDrawing: boolean;
  drawingPosition: { x: number, y: number } | null;
  clearCanvas: boolean;
  onCanvasCleared: () => void;
  brushColor: string;
  brushSize?: number;
  width?: number;
  height?: number;
  additionalDrawingPositions?: { x: number, y: number }[];
  isEraser?: boolean;
  isFullscreen?: boolean;
  backgroundImage?: string | null;
  backgroundOpacity?: number;
}

const MultiHandDrawingCanvas: React.FC<MultiHandDrawingCanvasProps> = ({
  isDrawing,
  drawingPosition,
  clearCanvas,
  onCanvasCleared,
  brushColor,
  brushSize = 5,
  width = 640,
  height = 480,
  additionalDrawingPositions = [],
  isEraser = false,
  isFullscreen = false,
  backgroundImage = null,
  backgroundOpacity = 100
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDrawingActive, setIsDrawingActive] = React.useState(false);
  const [lastPositions, setLastPositions] = React.useState<Map<string, { x: number, y: number }>>(new Map());
  const [cursorPosition, setCursorPosition] = React.useState<{ x: number, y: number } | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const [canvasSize, setCanvasSize] = React.useState({ width, height });
  const [isMouseDrawing, setIsMouseDrawing] = React.useState(false);
  const [mousePosition, setMousePosition] = React.useState<{ x: number, y: number } | null>(null);

  // Resize canvas when container size changes or fullscreen mode changes
  React.useEffect(() => {
    const updateCanvasSize = () => {
      if (!containerRef.current) return;

      // Get container reference (not used directly but needed for context)
      containerRef.current;

      // Use fixed dimensions with 16:9 aspect ratio for consistency
      const fixedWidth = 640;
      const fixedHeight = 360; // 16:9 aspect ratio

      console.log(`Setting fixed canvas size: ${fixedWidth}x${fixedHeight}`);

      // Set canvas size to fixed dimensions
      setCanvasSize({
        width: fixedWidth,
        height: fixedHeight
      });
    };

    // Initial update
    updateCanvasSize();

    // Add resize listener
    const resizeObserver = new ResizeObserver(() => {
      // Only update if in fullscreen mode
      if (isFullscreen) {
        updateCanvasSize();
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', () => {
      // Only update if in fullscreen mode
      if (isFullscreen) {
        updateCanvasSize();
      }
    });

    // Update when fullscreen mode changes
    if (isFullscreen) {
      updateCanvasSize();
    }

    return () => {
      if (containerRef.current) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [isFullscreen]);

  // Initialize canvas
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    console.log(`Initializing canvas with dimensions: ${canvasSize.width}x${canvasSize.height}`);

    // Set canvas dimensions
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    // Set white background on initial load
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Set default drawing styles
    context.lineWidth = brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = brushColor;

    console.log('Canvas initialized successfully');
  }, [canvasSize, brushSize, brushColor]);

  // Apply background image when it changes or opacity changes
  React.useEffect(() => {
    if (backgroundImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Create a temporary canvas to store the current drawing
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempContext = tempCanvas.getContext('2d');
        if (tempContext) {
          // Copy current canvas content to temp canvas
          tempContext.drawImage(canvas, 0, 0);

          // Clear main canvas and draw background
          context.fillStyle = 'white';
          context.fillRect(0, 0, canvas.width, canvas.height);

          const img = new Image();
          img.onload = () => {
            // Create a separate canvas for the background image with opacity
            const bgCanvas = document.createElement('canvas');
            bgCanvas.width = canvas.width;
            bgCanvas.height = canvas.height;
            const bgContext = bgCanvas.getContext('2d');

            if (bgContext) {
              // Draw the background image on the temporary canvas
              drawImageOnCanvas(bgContext, img, true);

              // Apply opacity
              context.globalAlpha = backgroundOpacity / 100;
              context.drawImage(bgCanvas, 0, 0);
              context.globalAlpha = 1.0; // Reset alpha

              // Restore the drawing on top
              context.drawImage(tempCanvas, 0, 0);
            } else {
              // Fallback if bgContext fails
              drawImageOnCanvas(context, img, true);
              context.drawImage(tempCanvas, 0, 0);
            }

            // Clean up object URL
            URL.revokeObjectURL(img.src);
          };

          img.src = backgroundImage;
        }
      }
    }
  }, [backgroundImage, backgroundOpacity]);

  // Handle drawing logic using hand gestures
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Debug logging removed

    // Create a new map for this render cycle - but don't include it in dependencies
    const newLastPositions = new Map(lastPositions);
    let isAnyHandDrawing = false;

    // Handle primary drawing position
    if (isDrawing && drawingPosition) {
      // Validate coordinates before using them
      if (typeof drawingPosition.x !== 'number' || isNaN(drawingPosition.x) ||
        typeof drawingPosition.y !== 'number' || isNaN(drawingPosition.y)) {
        console.warn(`Invalid drawing position detected: x=${drawingPosition.x}, y=${drawingPosition.y}`);
      } else {
        // Debug logging removed
        isAnyHandDrawing = true;

        // Get canvas dimensions for scaling
        const canvasRect = canvas.getBoundingClientRect();

        // Calculate the scaling factors between the video (640x360) and the canvas
        const videoWidth = 640;
        const videoHeight = 360;

        // Calculate the position within the canvas based on the position in the video
        // First normalize the position to 0-1 range within the video dimensions
        const normalizedX = drawingPosition.x / videoWidth;
        const normalizedY = drawingPosition.y / videoHeight;

        // Then scale to canvas coordinates
        const x = normalizedX * canvas.width;
        const y = normalizedY * canvas.height;

        // Ensure coordinates are within canvas bounds
        const clampedX = Math.min(canvas.width, Math.max(0, x));
        const clampedY = Math.min(canvas.height, Math.max(0, y));

        // Debug logging removed

        // Update cursor position for the floating preview
        // Convert canvas coordinates back to screen coordinates for the cursor
        const screenX = (clampedX / canvas.width) * canvasRect.width;
        const screenY = (clampedY / canvas.height) * canvasRect.height;

        setCursorPosition({
          x: screenX,
          y: screenY
        });

        // Only set showPreview if it's changing to avoid unnecessary renders
        if (!showPreview) {
          setShowPreview(true);
        }

        // Draw line if we have a previous position
        const lastPos = newLastPositions.get('primary');
        if (lastPos) {
          // Debug logging removed
          context.beginPath();
          context.lineWidth = brushSize;
          context.lineCap = 'round';
          context.lineJoin = 'round';

          if (isEraser) {
            context.globalCompositeOperation = 'destination-out';
            context.strokeStyle = 'rgba(255,255,255,1)';
          } else {
            context.globalCompositeOperation = 'source-over';
            context.strokeStyle = brushColor;
          }

          context.moveTo(lastPos.x, lastPos.y);
          context.lineTo(clampedX, clampedY);
          context.stroke();
        } else {
          console.log('No previous position for primary hand, starting new line');
        }

        // Update the position in the map
        newLastPositions.set('primary', { x: clampedX, y: clampedY });
      }
    } else {
      if (isDrawing) {
        console.log('isDrawing is true but drawingPosition is null');
      }
      newLastPositions.delete('primary');
      if (!isMouseDrawing && showPreview) {
        setShowPreview(false);
      }
    }

    // Handle additional drawing positions (for multi-hand support)
    if (additionalDrawingPositions && additionalDrawingPositions.length > 0) {
      additionalDrawingPositions.forEach((pos, index) => {
        // Validate coordinates before using them
        if (pos && typeof pos.x === 'number' && !isNaN(pos.x) &&
          typeof pos.y === 'number' && !isNaN(pos.y)) {
          isAnyHandDrawing = true;
          const handId = `hand_${index}`;

          // Get canvas dimensions for scaling
          const canvasRect = canvas.getBoundingClientRect();

          // Scale drawing position to canvas size
          const scaleX = canvas.width / canvasRect.width;
          const scaleY = canvas.height / canvasRect.height;

          // Ensure drawing position is within canvas bounds
          const clampedX = Math.min(canvasRect.width, Math.max(0, pos.x));
          const clampedY = Math.min(canvasRect.height, Math.max(0, pos.y));

          // Scale the clamped position to canvas coordinates
          const x = clampedX * scaleX;
          const y = clampedY * scaleY;

          console.log(`Additional hand ${index}: scaled position x=${x}, y=${y}`);

          // Draw line if we have a previous position
          const lastPos = newLastPositions.get(handId);
          if (lastPos) {
            context.beginPath();
            context.lineWidth = brushSize;
            context.lineCap = 'round';
            context.lineJoin = 'round';

            if (isEraser) {
              context.globalCompositeOperation = 'destination-out';
              context.strokeStyle = 'rgba(255,255,255,1)';
            } else {
              // Use a slightly different color for the second hand to distinguish the lines
              // This creates a visual distinction between the hands
              context.globalCompositeOperation = 'source-over';

              // Create a slightly different color for secondary hands
              // This helps visually distinguish between hands
              let secondaryColor = brushColor;

              // Only modify the color if it's not black or white
              if (brushColor !== '#000000' && brushColor !== '#FFFFFF') {
                try {
                  // Simple color variation - darken or lighten based on index
                  const colorObj = new Color(brushColor);
                  if (index % 2 === 0) {
                    // Darken for even indices
                    secondaryColor = colorObj.darken(0.2).hex();
                  } else {
                    // Lighten for odd indices
                    secondaryColor = colorObj.lighten(0.2).hex();
                  }
                } catch (error) {
                  console.error('Error processing color:', error);
                  // Fallback to original color if there's an error
                  secondaryColor = brushColor;
                }
              }

              context.strokeStyle = secondaryColor;
            }

            context.moveTo(lastPos.x, lastPos.y);
            context.lineTo(x, y);
            context.stroke();
          }

          // Update the position in the map
          newLastPositions.set(handId, { x, y });
        }
      });
    }

    // Reset composite operation after drawing
    context.globalCompositeOperation = 'source-over';

    // Update last positions state - but don't include it in dependencies
    setLastPositions(newLastPositions);

    // Update drawing active state only if it's changing
    if (isAnyHandDrawing !== isDrawingActive) {
      setIsDrawingActive(isAnyHandDrawing);
    }

    // Important: Remove lastPositions and isDrawingActive from dependencies to prevent infinite loops
  }, [isDrawing, drawingPosition, additionalDrawingPositions, brushColor, brushSize, isEraser, isMouseDrawing, showPreview]);

  // Handle canvas clearing
  React.useEffect(() => {
    if (clearCanvas) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Clear all last positions
      setLastPositions(new Map());

      toast({
        title: "Canvas cleared",
        description: "Your drawing has been erased."
      });

      onCanvasCleared();
    }
  }, [clearCanvas, onCanvasCleared]);

  // Handle mouse/touch drawing

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // Ensure mouse position is within canvas bounds
    const clampedX = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
    const clampedY = Math.min(rect.height, Math.max(0, e.clientY - rect.top));

    // Convert mouse position to canvas coordinates
    const x = clampedX * (canvas.width / rect.width);
    const y = clampedY * (canvas.height / rect.height);

    console.log(`Mouse down at canvas coordinates: x=${x}, y=${y}`);

    setIsMouseDrawing(true);
    setMousePosition({ x, y });

    // Show brush preview
    setCursorPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setShowPreview(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // Always update cursor position for hover effect
    setCursorPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });

    if (isMouseDrawing) {
      // Ensure mouse position is within canvas bounds
      const clampedX = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      const clampedY = Math.min(rect.height, Math.max(0, e.clientY - rect.top));

      // Convert mouse position to canvas coordinates
      const x = clampedX * (canvas.width / rect.width);
      const y = clampedY * (canvas.height / rect.height);

      console.log(`Mouse move at canvas coordinates: x=${x}, y=${y}`);

      const context = canvas.getContext('2d');
      if (!context || !mousePosition) return;

      context.beginPath();
      context.lineWidth = brushSize;
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (isEraser) {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = 'rgba(255,255,255,1)';
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = brushColor;
      }

      context.moveTo(mousePosition.x, mousePosition.y);
      context.lineTo(x, y);
      context.stroke();

      // Reset composite operation
      context.globalCompositeOperation = 'source-over';

      setMousePosition({ x, y });
    }
  };

  const handleMouseUp = () => {
    setIsMouseDrawing(false);
    setMousePosition(null);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.buttons === 1) {
      // Mouse is down while entering
      handleMouseDown(e);
    }
    setShowPreview(true);
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    setShowPreview(false);
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];

    // Ensure touch position is within canvas bounds
    const clampedX = Math.min(rect.width, Math.max(0, touch.clientX - rect.left));
    const clampedY = Math.min(rect.height, Math.max(0, touch.clientY - rect.top));

    // Convert touch position to canvas coordinates
    const x = clampedX * (canvas.width / rect.width);
    const y = clampedY * (canvas.height / rect.height);

    console.log(`Touch start at canvas coordinates: x=${x}, y=${y}`);

    setIsMouseDrawing(true);
    setMousePosition({ x, y });
    setCursorPosition({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
    setShowPreview(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isMouseDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];

    // Ensure touch position is within canvas bounds
    const clampedX = Math.min(rect.width, Math.max(0, touch.clientX - rect.left));
    const clampedY = Math.min(rect.height, Math.max(0, touch.clientY - rect.top));

    // Convert touch position to canvas coordinates
    const x = clampedX * (canvas.width / rect.width);
    const y = clampedY * (canvas.height / rect.height);

    console.log(`Touch move at canvas coordinates: x=${x}, y=${y}`);

    const context = canvas.getContext('2d');
    if (!context || !mousePosition) return;

    context.beginPath();
    context.lineWidth = brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (isEraser) {
      context.globalCompositeOperation = 'destination-out';
      context.strokeStyle = 'rgba(255,255,255,1)';
    } else {
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = brushColor;
    }

    context.moveTo(mousePosition.x, mousePosition.y);
    context.lineTo(x, y);
    context.stroke();

    // Reset composite operation
    context.globalCompositeOperation = 'source-over';

    setMousePosition({ x, y });
    setCursorPosition({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsMouseDrawing(false);
    setMousePosition(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        width: '100%',
        // Create a fixed aspect ratio container (16:9)
        paddingBottom: `${(canvasSize.height / canvasSize.width) * 100}%`,
        overflow: 'hidden'
      }}
    >
      <div
        className="absolute top-0 left-0 w-full h-full flex items-center justify-center"
        style={{
          width: '100%',
          height: '100%'
        }}
      >
        <canvas
          id="drawing-canvas"
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="border-2 border-gray-300 rounded-lg bg-white shadow-lg touch-none"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            maxWidth: '100%',
            maxHeight: '100%'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Floating brush preview */}
        {showPreview && cursorPosition && (
          <div
            className="absolute pointer-events-none transition-all duration-200 ease-out"
            style={{
              left: `${cursorPosition.x}px`,
              top: `${cursorPosition.y}px`,
              width: `${brushSize * (isDrawingActive || isMouseDrawing ? 1 : 1.5)}px`, // Slightly larger when hovering
              height: `${brushSize * (isDrawingActive || isMouseDrawing ? 1 : 1.5)}px`,
              backgroundColor: (isDrawingActive || isMouseDrawing)
                ? (isEraser ? 'rgba(255, 255, 255, 0.9)' : brushColor)
                : 'transparent',
              border: `2px solid ${isEraser ? 'rgba(0,0,0,0.2)' : brushColor}`,
              opacity: (isDrawingActive || isMouseDrawing) ? 1 : 0.6,
              borderRadius: '50%',
              transform: `translate(-50%, -50%) scale(${(isDrawingActive || isMouseDrawing) ? 1 : 0.8})`,
              zIndex: 50,
              boxShadow: (isDrawingActive || isMouseDrawing)
                ? '0 2px 10px rgba(0,0,0,0.2)'
                : 'none'
            }}
          >
            {/* Inner dot for precision when hovering */}
            {!(isDrawingActive || isMouseDrawing) && (
              <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-current rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-50" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiHandDrawingCanvas;
