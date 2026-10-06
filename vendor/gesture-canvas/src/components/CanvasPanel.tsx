import * as React from 'react';
import { useDrawing } from '@/contexts/DrawingContext';
import DrawingTools from './DrawingTools';
import MultiHandDrawingCanvas from './MultiHandDrawingCanvas';
import { Button } from "@/components/ui/button";
import { toast } from '@/components/ui/use-toast';
import { ArrowLeftRight, Maximize, Minimize } from 'lucide-react';
import { loadImageFromFile } from '@/utils/imageUtils';

interface CanvasPanelProps {
  onSwapPanels?: () => void;
  additionalDrawingPositions?: { x: number, y: number }[];
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  isFullscreen?: boolean;
  confidence?: number;
}

const CanvasPanel: React.FC<CanvasPanelProps> = ({
  onSwapPanels,
  additionalDrawingPositions = [],
  onFullscreenToggle,
  isFullscreen = false,
  confidence = 0
}) => {
  const {
    drawingPosition,
    clearCanvas,
    setClearCanvas,
    brushColor,
    brushSize,
    isEraser,
    backgroundImage,
    setBackgroundImage,
    backgroundOpacity,
    // strokeHistory,
    // currentStrokeIndex,
    // addStroke,
    undo,
    redo,
    canUndo,
    canRedo
  } = useDrawing();

  // Function to handle canvas download
  const handleCanvasDownload = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `hand-drawing-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();

      toast({
        title: "Download started",
        description: "Your drawing is being downloaded as a PNG file.",
      });
    } catch (err) {
      console.error("Error downloading canvas:", err);
      toast({
        title: "Download failed",
        description: "There was an error downloading your drawing.",
        variant: "destructive"
      });
    }
  };

  // Handle background upload
  const handleBackgroundUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Load the image (not using the returned image directly)
      await loadImageFromFile(file);

      // Set the background image
      const imageUrl = URL.createObjectURL(file);
      setBackgroundImage(imageUrl);

      toast({
        title: "Background added",
        description: "Your background image has been applied to the canvas.",
      });
    } catch (err) {
      console.error("Error loading background image:", err);
      toast({
        title: "Image load failed",
        description: "There was an error loading your background image.",
        variant: "destructive"
      });
    }
  };

  const handleFullscreenToggle = () => {
    if (onFullscreenToggle) {
      onFullscreenToggle(!isFullscreen);
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'bg-transparent'}`}>

      {/* Header Controls - Overlay on Canvas or Top Bar */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleFullscreenToggle}
          className="shadow-soft-sm hover:shadow-soft-md rounded-full bg-white/90 backdrop-blur-sm border border-white/20"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          <span className="sr-only">{isFullscreen ? "Exit Full Screen" : "Full Screen"}</span>
        </Button>

        {onSwapPanels && !isFullscreen && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onSwapPanels}
            className="shadow-soft-sm hover:shadow-soft-md rounded-full bg-white/90 backdrop-blur-sm border border-white/20"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span className="sr-only">Swap</span>
          </Button>
        )}
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative overflow-hidden bg-white/50 rounded-2xl">
        {/* Background Grid Pattern is applied on the parent container in Index.tsx, 
             but we can add a specific white layer here if needed */}

        <MultiHandDrawingCanvas
          isDrawing={!!drawingPosition}
          drawingPosition={drawingPosition}
          clearCanvas={clearCanvas}
          onCanvasCleared={() => setClearCanvas(false)}
          brushColor={brushColor}
          brushSize={brushSize}
          additionalDrawingPositions={additionalDrawingPositions}
          isEraser={isEraser}
          isFullscreen={isFullscreen}
          backgroundImage={backgroundImage}
          backgroundOpacity={backgroundOpacity}
        />

        {/* Floating Tools at the bottom */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10 w-[95%] max-w-3xl">
          <DrawingTools
            onDownload={handleCanvasDownload}
            onUndo={undo}
            onRedo={redo}
            onBackgroundUpload={handleBackgroundUpload}
            canUndo={canUndo}
            canRedo={canRedo}
            confidence={confidence}
          />
        </div>
      </div>
    </div>
  );
};

export default CanvasPanel;
