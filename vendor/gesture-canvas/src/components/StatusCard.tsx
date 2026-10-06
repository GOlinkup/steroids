import { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";
import { useDrawing } from '@/contexts/DrawingContext';
import { Activity, Brush, Eraser, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const StatusCard = () => {
  const { brushColor, brushSize, isEraser } = useDrawing();
  const [handConfidence, setHandConfidence] = useState(0);
  const [showTips, setShowTips] = useState(false);

  // Listen for hand detection confidence updates from HandDetector
  useEffect(() => {
    const handConfidenceElement = document.getElementById('hand-detector');
    if (!handConfidenceElement) return;

    // Initial read
    const initialConfidence = parseFloat(handConfidenceElement.getAttribute('data-confidence') || '0');
    setHandConfidence(initialConfidence * 100);
    setShowTips(initialConfidence < 0.5);

    // Mutation observer for real-time updates
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-confidence') {
          const confidenceValue = parseFloat(handConfidenceElement.getAttribute('data-confidence') || '0');
          setHandConfidence(confidenceValue * 100);
          setShowTips(confidenceValue < 0.5);
        }
      });
    });

    observer.observe(handConfidenceElement, { attributes: true, attributeFilter: ['data-confidence'] });
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-panel-light rounded-2xl p-6 relative overflow-hidden group"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brush-blue via-brush-purple to-brush-red opacity-50" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-center">

        {/* Brush Color */}
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div
              className="w-12 h-12 rounded-full shadow-soft-sm border-2 border-white ring-2 ring-offset-2 ring-offset-white transition-all duration-300"
              style={{ backgroundColor: brushColor, borderColor: 'white', '--tw-ring-color': brushColor } as React.CSSProperties}
            />
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm">
              <Brush className="w-3 h-3 text-gray-400" />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Active Color</p>
            <p className="text-sm font-medium capitalize" style={{ color: brushColor }}>{brushColor}</p>
          </div>
        </div>

        {/* Brush Size */}
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center relative overflow-hidden">
            <div
              className="rounded-full bg-current transition-all duration-300"
              style={{
                width: `${Math.min(brushSize * 2, 24)}px`,
                height: `${Math.min(brushSize * 2, 24)}px`,
                color: isEraser ? '#94a3b8' : brushColor
              }}
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Size</p>
            <p className="text-sm font-medium">{brushSize}px</p>
          </div>
        </div>

        {/* Mode */}
        <div className="flex items-center space-x-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isEraser ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
            {isEraser ? <Eraser className="w-5 h-5" /> : <Brush className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Mode</p>
            <p className={`text-sm font-bold ${isEraser ? 'text-red-500' : 'text-green-600'}`}>
              {isEraser ? 'Eraser' : 'Drawing'}
            </p>
          </div>
        </div>

        {/* Hand Detection */}
        <div className="flex flex-col space-y-2">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center space-x-2">
              <Activity className={`w-4 h-4 ${handConfidence > 70 ? 'text-green-500' : 'text-amber-500'}`} />
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Signal</span>
            </div>
            <span className={`text-xs font-bold ${handConfidence > 70 ? 'text-green-600' : 'text-amber-600'}`}>
              {Math.round(handConfidence)}%
            </span>
          </div>
          <Progress
            value={handConfidence}
            className="h-2 bg-surface-100"
          />
        </div>

      </div>

      <AnimatePresence>
        {showTips && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-border/40"
          >
            <div className="flex items-start space-x-3 text-amber-600 bg-amber-50/50 p-3 rounded-lg border border-amber-100/50">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold">Detection is weak. Try these tips:</p>
                <p>• Ensure good lighting on your hand</p>
                <p>• Keep your hand within the camera frame</p>
                <p>• Avoid cluttered backgrounds</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StatusCard;
