import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GestureIndicatorProps {
  activeGesture: {
    isDrawing: boolean;
    isClearCanvas: boolean;
    isChangeColor: boolean;
    isEraser: boolean;
    isPaused: boolean;
    isDualHandDrawing: boolean;
  };
  clearCanvasProgress?: number; // 0-100 progress for clear canvas hold gesture
}

const GestureIndicator: React.FC<GestureIndicatorProps> = ({ 
  activeGesture,
  clearCanvasProgress = 0
}) => {
  // Determine which gesture is active
  const getActiveGestureName = (): string => {
    if (activeGesture.isDualHandDrawing) return 'Dual-Hand Drawing';
    if (activeGesture.isDrawing) return 'Drawing';
    if (activeGesture.isClearCanvas) return 'Clear Canvas';
    if (activeGesture.isChangeColor) return 'Color Selection';
    if (activeGesture.isEraser) return 'Eraser';
    if (activeGesture.isPaused) return 'Paused';
    return 'No Gesture';
  };

  // Get icon for active gesture
  const getGestureIcon = (): string => {
    if (activeGesture.isDualHandDrawing) return '👆👆';
    if (activeGesture.isDrawing) return '☝️';
    if (activeGesture.isClearCanvas) return '🖐️';
    if (activeGesture.isChangeColor) return '🖖';
    if (activeGesture.isEraser) return '✌️';
    if (activeGesture.isPaused) return '✊';
    return '👋';
  };

  // Get color for active gesture
  const getGestureColor = (): string => {
    if (activeGesture.isDualHandDrawing) return 'bg-indigo-100';
    if (activeGesture.isDrawing) return 'bg-blue-100';
    if (activeGesture.isClearCanvas) return 'bg-yellow-100';
    if (activeGesture.isChangeColor) return 'bg-green-100';
    if (activeGesture.isEraser) return 'bg-purple-100';
    if (activeGesture.isPaused) return 'bg-red-100';
    return 'bg-gray-100';
  };

  const activeName = getActiveGestureName();
  const activeIcon = getGestureIcon();
  const activeColor = getGestureColor();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="flex items-center gap-2 bg-white/90 rounded-full px-4 py-2 shadow-md border border-gray-200"
        >
          <div className={`${activeColor} rounded-full p-2 flex-shrink-0`}>
            <span className="text-xl">{activeIcon}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-sm">{activeName}</span>
            
            {/* Progress bar for clear canvas gesture */}
            {activeGesture.isClearCanvas && clearCanvasProgress > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <motion.div 
                  className="bg-yellow-500 h-1.5 rounded-full" 
                  initial={{ width: 0 }}
                  animate={{ width: `${clearCanvasProgress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default GestureIndicator;
