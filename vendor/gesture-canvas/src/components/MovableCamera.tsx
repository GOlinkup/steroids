
import * as React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import HandTrackingWebcam from './HandTrackingWebcam';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MovableCameraProps {
  onHandGesture: (
    isDrawing: boolean,
    position: { x: number, y: number } | null,
    clearCanvas: boolean,
    changeColor: boolean,
    maxConfidence: number,
    additionalPositions?: { x: number, y: number }[]
  ) => void;
  confidence: number;
}

const MovableCamera: React.FC<MovableCameraProps> = ({
  onHandGesture,
  confidence
}) => {
  const [position, setPosition] = React.useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Ensure the camera stays within the window bounds
        const maxX = window.innerWidth - (containerRef.current?.clientWidth || 200);
        const maxY = window.innerHeight - (containerRef.current?.clientHeight || 150);

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) {
        const touch = e.touches[0];
        const newX = touch.clientX - dragOffset.x;
        const newY = touch.clientY - dragOffset.y;

        // Ensure the camera stays within the window bounds
        const maxX = window.innerWidth - (containerRef.current?.clientWidth || 200);
        const maxY = window.innerHeight - (containerRef.current?.clientHeight || 150);

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });

        e.preventDefault(); // Prevent scrolling while dragging
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragOffset]);

  // Add touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches[0]) {
      setIsDragging(true);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top
        });
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50 shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isCollapsed ? 'auto' : '300px',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
    >
      <Card className="border border-gray-300 rounded-lg overflow-hidden">
        <div
          className="bg-gray-100 p-2 flex justify-between items-center cursor-grab"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Camera size={16} />
            Hand Tracking
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-6 w-6 p-0"
          >
            {isCollapsed ? "+" : "-"}
          </Button>
        </div>

        {!isCollapsed && (
          <CardContent className="p-2">
            <div className="relative w-full h-full">
              <HandTrackingWebcam
                onHandGesture={onHandGesture}
              // Use default resolution for logic consistency
              // width={280} height={210} removed to prevent clipping logic
              />

              {/* Confidence indicator */}
              <div className="absolute bottom-2 left-2 right-2 bg-black/50 p-1 rounded-md text-xs text-white">
                Hand Detection: {Math.round(confidence * 100)}%
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default MovableCamera;
