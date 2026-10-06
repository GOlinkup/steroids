
import React from 'react';
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from 'lucide-react';
import { useDrawing } from '@/contexts/DrawingContext';

const DrawingControls: React.FC = () => {
  const { setClearCanvas, handleDownload } = useDrawing();

  return (
    <div className="flex justify-between mt-4">
      <Button 
        variant="outline"
        onClick={() => setClearCanvas(true)}
        className="flex items-center gap-2"
      >
        <RefreshCw className="h-4 w-4" />
        Clear Canvas
      </Button>
      <Button 
        onClick={handleDownload}
        className="flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        Download Drawing
      </Button>
    </div>
  );
};

export default DrawingControls;
