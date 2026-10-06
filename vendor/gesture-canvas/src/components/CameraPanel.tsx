import React, { useState } from 'react';
import HandTrackingWebcam from '@/components/HandTrackingWebcam';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight, ChevronDown, ChevronUp } from 'lucide-react';

interface CameraPanelProps {
  onSwapPanels?: () => void;
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

const CameraPanel: React.FC<CameraPanelProps> = ({
  onSwapPanels,
  onHandGesture,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black/5 border border-black/10 shadow-inner">

      {/* Overlay Header */}
      <div className="absolute top-0 left-0 w-full p-4 z-20 flex justify-between items-start pointer-events-none">
        <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 shadow-sm">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Cam
          </span>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          {onSwapPanels && (
            <Button
              variant="secondary"
              size="icon"
              onClick={onSwapPanels}
              className="h-8 w-8 rounded-full bg-white/80 backdrop-blur shadow-sm hover:bg-white"
            >
              <ArrowLeftRight className="h-4 w-4 text-gray-700" />
            </Button>
          )}
        </div>
      </div>

      <div className={`w-full h-full transition-all duration-300 ${isCollapsed ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        <HandTrackingWebcam
          onHandGesture={onHandGesture}
          width={640}
          height={480}
        />
      </div>

      {isCollapsed && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground font-medium">
          Camera Paused
        </div>
      )}

      {/* Collapse Toggle Overlay */}
      <div className="absolute bottom-4 right-4 z-20">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="bg-white/50 hover:bg-white/80 backdrop-blur rounded-full px-3 text-xs font-medium transition-all"
        >
          {isCollapsed ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {isCollapsed ? "Show View" : "Hide View"}
        </Button>
      </div>
    </div>
  );
};

export default CameraPanel;
