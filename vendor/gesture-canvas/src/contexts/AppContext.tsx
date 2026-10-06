import React, { createContext, useContext, useState } from 'react';
import { DrawingTool } from '@/types';
import { DRAWING_TOOLS } from '@/constants';

interface AppContextType {
  currentTool: DrawingTool;
  setCurrentTool: (tool: DrawingTool) => void;
  isDrawing: boolean;
  setIsDrawing: (isDrawing: boolean) => void;
  cameraEnabled: boolean;
  setCameraEnabled: (enabled: boolean) => void;
  theme?: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTool, setCurrentTool] = useState<DrawingTool>(DRAWING_TOOLS.PEN);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  return (
    <AppContext.Provider
      value={{
        currentTool,
        setCurrentTool,
        isDrawing,
        setIsDrawing,
        cameraEnabled,
        setCameraEnabled,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};