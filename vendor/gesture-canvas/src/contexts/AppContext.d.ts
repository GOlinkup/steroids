import React from 'react';
import { DrawingTool } from '@/types';
interface AppContextType {
    currentTool: DrawingTool;
    setCurrentTool: (tool: DrawingTool) => void;
    isDrawing: boolean;
    setIsDrawing: (isDrawing: boolean) => void;
    cameraEnabled: boolean;
    setCameraEnabled: (enabled: boolean) => void;
    theme?: string;
}
export declare const AppProvider: React.FC<{
    children: React.ReactNode;
}>;
export declare const useApp: () => AppContextType;
export {};
