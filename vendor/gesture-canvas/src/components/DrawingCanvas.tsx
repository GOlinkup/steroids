
import React, { useRef, useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { resizeCanvasToFitContainer } from '@/utils/imageUtils';

interface DrawingCanvasProps {
  isDrawing: boolean;
  drawingPosition: { x: number, y: number } | null;
  clearCanvas: boolean;
  onCanvasCleared: () => void;
  brushColor: string;
  brushSize?: number;
  width?: number;
  height?: number;
  isEraser?: boolean;
  backgroundImage?: string | null;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  isDrawing,
  drawingPosition,
  clearCanvas,
  onCanvasCleared,
  brushColor,
  brushSize = 5,
  width = 640,
  height = 480,
  isEraser = false,
  backgroundImage = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [lastPosition, setLastPosition] = useState<{ x: number, y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width, height });

  // Initialize canvas and handle resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const updateCanvasSize = () => {
      if (canvas && container) {
        resizeCanvasToFitContainer(canvas, container, true);
        const rect = container.getBoundingClientRect();
        setCanvasSize({
          width: rect.width,
          height: rect.height
        });
      }
    };

    // Initial setup
    updateCanvasSize();
    
    // Set white background on initial load
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Add resize listener
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  // Handle drawing logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;

    // Handle drawing based on hand position
    if (isDrawing && drawingPosition) {
      const canvasRect = canvas.getBoundingClientRect();
      
      // Scale drawing position to canvas size
      const scaleX = canvas.width / canvasRect.width;
      const scaleY = canvas.height / canvasRect.height;
      
      const x = drawingPosition.x * scaleX;
      const y = drawingPosition.y * scaleY;

      context.beginPath();
      context.lineWidth = brushSize;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      
      if (isEraser) {
        // For eraser mode
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = 'rgba(255,255,255,1)';
      } else {
        // Normal drawing mode
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = brushColor;
      }

      if (lastPosition) {
        context.moveTo(lastPosition.x, lastPosition.y);
        context.lineTo(x, y);
        context.stroke();
      }

      setLastPosition({ x, y });
      
      if (!isDrawingActive) {
        setIsDrawingActive(true);
      }
    } else {
      setLastPosition(null);
      if (isDrawingActive) {
        setIsDrawingActive(false);
      }
      
      // Reset composite operation when not drawing
      if (isEraser) {
        context.globalCompositeOperation = 'source-over';
      }
    }
  }, [isDrawing, drawingPosition, brushColor, brushSize, isDrawingActive, isEraser]);

  // Handle canvas clearing
  useEffect(() => {
    if (clearCanvas) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const context = canvas.getContext('2d');
      if (!context) return;
      
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      toast({
        title: "Canvas cleared",
        description: "Your drawing has been erased."
      });
      
      onCanvasCleared();
    }
  }, [clearCanvas, onCanvasCleared]);

  // Handle background image
  useEffect(() => {
    if (backgroundImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        const img = new Image();
        img.onload = () => {
          // Save current drawing
          const drawingData = context.getImageData(0, 0, canvas.width, canvas.height);
          
          // Reset canvas with white background
          context.fillStyle = 'white';
          context.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw background image
          const scale = Math.min(
            canvas.width / img.width,
            canvas.height / img.height
          );
          
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          const x = (canvas.width - scaledWidth) / 2;
          const y = (canvas.height - scaledHeight) / 2;
          
          context.drawImage(img, x, y, scaledWidth, scaledHeight);
          
          // Restore drawing over the background
          context.putImageData(drawingData, 0, 0);
          
          toast({
            title: "Background added",
            description: "Background image has been applied to the canvas."
          });
        };
        
        img.src = backgroundImage;
      }
    }
  }, [backgroundImage]);

  // Mouse/touch support for direct canvas interaction
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    setIsDrawingActive(true);
    setLastPosition({ x, y });
    
    // Set up for drawing style
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
    
    context.moveTo(x, y);
    context.lineTo(x, y);
    context.stroke();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingActive || !lastPosition) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
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
    
    context.moveTo(lastPosition.x, lastPosition.y);
    context.lineTo(x, y);
    context.stroke();
    
    setLastPosition({ x, y });
  };

  const handleMouseUp = () => {
    setIsDrawingActive(false);
    setLastPosition(null);
    
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        // Reset composite operation
        context.globalCompositeOperation = 'source-over';
      }
    }
  };

  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas || !e.touches[0]) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.touches[0].clientY - rect.top) * (canvas.height / rect.height);
    
    setIsDrawingActive(true);
    setLastPosition({ x, y });
    
    // Set up for drawing style
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
    
    context.moveTo(x, y);
    context.lineTo(x, y);
    context.stroke();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    if (!isDrawingActive || !lastPosition || !e.touches[0]) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.touches[0].clientY - rect.top) * (canvas.height / rect.height);
    
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
    
    context.moveTo(lastPosition.x, lastPosition.y);
    context.lineTo(x, y);
    context.stroke();
    
    setLastPosition({ x, y });
  };

  const handleTouchEnd = () => {
    setIsDrawingActive(false);
    setLastPosition(null);
    
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        // Reset composite operation
        context.globalCompositeOperation = 'source-over';
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative bg-gray-50 rounded-lg overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="border-2 border-gray-300 rounded-lg bg-white shadow-lg w-full h-full touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
};

export default DrawingCanvas;
