
import * as React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ArrowLeftRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { DrawingProvider } from '@/contexts/DrawingContext';
import CameraPanel from '@/components/CameraPanel';
import CanvasPanel from '@/components/CanvasPanel';
import GestureHandler from '@/components/GestureHandler';
import MovableCamera from '@/components/MovableCamera';
import FeedbackForm from '@/components/FeedbackForm';
import GestureInstructions from '@/components/GestureInstructions';
import AppHeader from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [isCameraLeft, setIsCameraLeft] = React.useState(true);
  const [confidence] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [additionalDrawingPositions, setAdditionalDrawingPositions] = React.useState<{ x: number, y: number }[]>([]);

  const handleSwapPanels = () => setIsCameraLeft(!isCameraLeft);

  // This effect handles updating additional drawing positions when needed
  // It's preserved from the original logic, though currently static
  React.useEffect(() => {
    const updatePositionsFromGesture = (positions: { x: number, y: number }[]) => {
      if (positions?.length > 0) {
        setAdditionalDrawingPositions(positions);
      } else {
        setAdditionalDrawingPositions([]);
      }
    };
    if (false) updatePositionsFromGesture([]);
  }, []);

  return (
    <DrawingProvider>
      <div className="min-h-screen bg-background subtle-grid overflow-x-hidden selection:bg-brush-blue/20">
        <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6">

          <AnimatePresence>
            {!isFullscreen && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-8"
              >
                <AppHeader />

                <div className="max-w-3xl mx-auto text-center mb-10">
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    Draw with just your hand! Use gestures to change colors, clear the canvas, and create art without touching your screen.
                  </p>
                </div>

                <div className="mb-10">
                  <GestureInstructions />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Swap Control */}
          {!isFullscreen && (
            <div className="md:hidden flex justify-center mb-6">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSwapPanels}
                className="rounded-full shadow-soft-sm hover:shadow-soft-md transition-all bg-surface-50"
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Swap View
              </Button>
            </div>
          )}

          {/* Main Desktop Layout */}
          {!isFullscreen && (
            <motion.div
              layout
              className="hidden md:block rounded-2xl overflow-hidden border border-white/20 shadow-soft-lg glass-panel-light h-[700px]"
            >
              <ResizablePanelGroup direction="horizontal">
                {isCameraLeft ? (
                  <>
                    <ResizablePanel defaultSize={40} minSize={30}>
                      <div className="h-full p-4 bg-surface-50/50">
                        <GestureHandler>
                          {({ onHandGesture }) => (
                            <CameraPanel onHandGesture={onHandGesture} confidence={confidence} />
                          )}
                        </GestureHandler>
                      </div>
                    </ResizablePanel>
                    <ResizableHandle withHandle className="bg-border/50 hover:bg-brush-blue/50 transition-colors" />
                    <ResizablePanel defaultSize={60}>
                      <div className="h-full bg-white relative">
                        <CanvasPanel
                          onSwapPanels={handleSwapPanels}
                          additionalDrawingPositions={additionalDrawingPositions}
                          onFullscreenToggle={setIsFullscreen}
                          isFullscreen={isFullscreen}
                        />
                      </div>
                    </ResizablePanel>
                  </>
                ) : (
                  <>
                    <ResizablePanel defaultSize={60}>
                      <div className="h-full bg-white relative">
                        <CanvasPanel
                          onSwapPanels={handleSwapPanels}
                          additionalDrawingPositions={additionalDrawingPositions}
                          onFullscreenToggle={setIsFullscreen}
                          isFullscreen={isFullscreen}
                        />
                      </div>
                    </ResizablePanel>
                    <ResizableHandle withHandle className="bg-border/50 hover:bg-brush-blue/50 transition-colors" />
                    <ResizablePanel defaultSize={40} minSize={30}>
                      <div className="h-full p-4 bg-surface-50/50">
                        <GestureHandler>
                          {({ onHandGesture }) => (
                            <CameraPanel onHandGesture={onHandGesture} confidence={confidence} />
                          )}
                        </GestureHandler>
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </motion.div>
          )}

          {/* Mobile Layout Column */}
          {!isFullscreen && (
            <div className="md:hidden space-y-6">
              <div className="rounded-xl overflow-hidden shadow-soft-md border border-border/50 bg-white">
                <GestureHandler>
                  {({ onHandGesture }) => (
                    <CameraPanel onHandGesture={onHandGesture} confidence={confidence} />
                  )}
                </GestureHandler>
              </div>
              <div className="rounded-xl overflow-hidden shadow-soft-md border border-border/50 bg-white h-[500px]">
                <CanvasPanel
                  onSwapPanels={handleSwapPanels}
                  additionalDrawingPositions={additionalDrawingPositions}
                  onFullscreenToggle={setIsFullscreen}
                  isFullscreen={isFullscreen}
                />
              </div>
            </div>
          )}

          {/* Fullscreen Mode */}
          <AnimatePresence>
            {isFullscreen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-white"
              >
                <CanvasPanel
                  onFullscreenToggle={setIsFullscreen}
                  isFullscreen={isFullscreen}
                  additionalDrawingPositions={additionalDrawingPositions}
                />

                <div className="absolute top-4 right-4 z-[60]">
                  <FeedbackForm />
                </div>

                <GestureHandler>
                  {({ onHandGesture }) => (
                    <MovableCamera
                      onHandGesture={onHandGesture}
                      confidence={confidence}
                    />
                  )}
                </GestureHandler>
              </motion.div>
            )}
          </AnimatePresence>

          {!isFullscreen && (
            <div className="mt-8 text-center mb-8">
              <p className="text-xs text-muted-foreground uppercase tracking-widest opacity-50 font-semibold">
                Powered by TensorFlow.js • Handpose Model
              </p>
              <p className="text-[10px] text-muted-foreground mt-2 opacity-40">
                Your data stays private. All processing happens locally in your browser.
              </p>
            </div>
          )}
        </div>
      </div>
    </DrawingProvider>
  );
};

export default Index;
