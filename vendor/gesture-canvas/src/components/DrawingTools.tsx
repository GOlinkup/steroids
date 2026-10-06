import React, { useState } from 'react';
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Download, Undo, Redo, Image as ImageIcon,
  Trash2, Camera, Upload, Eraser, Brush,
  MoreHorizontal, Signal
} from 'lucide-react';
import { useDrawing } from '@/contexts/DrawingContext';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DrawingToolsProps {
  onDownload: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onBackgroundUpload: (file: File) => void;
  canUndo: boolean;
  canRedo: boolean;
  confidence?: number;
}

const DrawingTools: React.FC<DrawingToolsProps> = ({
  onDownload,
  onUndo,
  onRedo,
  onBackgroundUpload,
  canUndo,
  canRedo,
  confidence = 0
}) => {
  const {
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    isEraser,
    setIsEraser,
    backgroundImage,
    setBackgroundImage,
    backgroundOpacity,
    setBackgroundOpacity
  } = useDrawing();

  const [imageUrl, setImageUrl] = useState('');
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);

  const colorPresets = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#800080', '#FFA500', '#FFC0CB',
  ];

  // Logic handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onBackgroundUpload(e.target.files[0]);
  };

  const handleWebcamCapture = () => {
    const video = document.querySelector('video');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setBackgroundImage(canvas.toDataURL('image/png'));
  };

  const handleUrlUpload = () => {
    if (imageUrl) {
      setBackgroundImage(imageUrl);
      setIsUrlDialogOpen(false);
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md shadow-glass rounded-full px-4 py-2 flex items-center justify-between gap-4 border border-white/40">

      {/* 0. Status Signal */}
      <div className="flex items-center pr-4 border-r border-gray-200" title={`Detection Confidence: ${Math.round(confidence * 100)}%`}>
        <div className={`flex items-center gap-1.5 ${confidence > 0.7 ? 'text-green-600' : confidence > 0.3 ? 'text-amber-500' : 'text-red-500'}`}>
          <Signal className="w-5 h-5" />
          <span className="text-[10px] font-bold tabular-nums hidden sm:inline">{Math.round(confidence * 100)}%</span>
        </div>
      </div>

      {/* 1. Tools Group */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
        <Button
          variant={!isEraser ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setIsEraser(false)}
          className={`rounded-full h-10 w-10 ${!isEraser ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100'}`}
          title="Brush"
        >
          <Brush className="w-5 h-5" />
        </Button>
        <Button
          variant={isEraser ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setIsEraser(true)}
          className={`rounded-full h-10 w-10 ${isEraser ? 'bg-pink-50 text-pink-500' : 'hover:bg-gray-100'}`}
          title="Eraser"
        >
          <Eraser className="w-5 h-5" />
        </Button>
      </div>

      {/* 2. Style Group (Color + Size) */}
      <div className="flex items-center gap-4 border-r border-gray-200 pr-4">
        {/* Color Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-10 h-10 rounded-full p-0 border-2 overflow-hidden shadow-sm"
              style={{ borderColor: brushColor, backgroundColor: brushColor }}
            >
              <span className="sr-only">Pick Color</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 bg-white/95 backdrop-blur-xl border-none shadow-glass rounded-xl" side="top">
            <div className="space-y-3">
              <h4 className="font-semibold text-xs uppercase text-muted-foreground">Color Palette</h4>
              <div className="grid grid-cols-4 gap-2">
                {colorPresets.map(color => (
                  <button
                    key={color}
                    onClick={() => setBrushColor(color)}
                    className={`w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 ${brushColor === color ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="pt-2 border-t text-xs text-gray-400">
                Custom: <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="align-middle ml-2" />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Size Slider Popover (Click on Size Text to open) */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="flex flex-col items-center cursor-pointer hover:bg-gray-100 px-2 py-1 rounded-md transition-colors">
              <span className="text-xs font-bold text-gray-500 uppercase">Size</span>
              <span className="font-bold text-sm">{brushSize}px</span>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4" side="top">
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Brush Size</span>
                <span className="text-sm text-muted-foreground">{brushSize}px</span>
              </div>
              <Slider
                value={[brushSize]}
                onValueChange={([v]) => setBrushSize(v)}
                min={1} max={50} step={1}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 3. Actions Group (Undo/Redo) */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
        <Button variant="ghost" size="icon" disabled={!canUndo} onClick={onUndo} className="rounded-full h-9 w-9 text-gray-600 hover:text-primary">
          <Undo className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled={!canRedo} onClick={onRedo} className="rounded-full h-9 w-9 text-gray-600 hover:text-primary">
          <Redo className="w-4 h-4" />
        </Button>
      </div>

      {/* 4. Extra Menu (Background, Download) */}
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 text-gray-600">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 rounded-xl" side="top" align="end">
            <div className="space-y-1">
              {/* Background Opacity if exists */}
              {backgroundImage && (
                <div className="px-2 py-2 mb-2 border-b">
                  <Label className="text-xs mb-1 block">Bg Opacity</Label>
                  <Slider value={[backgroundOpacity]} onValueChange={([v]) => setBackgroundOpacity(v)} min={10} max={100} step={10} />
                </div>
              )}

              <Button variant="ghost" className="w-full justify-start text-xs h-8" onClick={() => document.getElementById('bg-upload-input')?.click()}>
                <Upload className="w-3 h-3 mr-2" /> Upload Background
              </Button>
              <input className="hidden" id="bg-upload-input" type="file" accept="image/*" onChange={handleFileUpload} />

              <Button variant="ghost" className="w-full justify-start text-xs h-8" onClick={handleWebcamCapture}>
                <Camera className="w-3 h-3 mr-2" /> Snapshot Background
              </Button>

              <Dialog open={isUrlDialogOpen} onOpenChange={setIsUrlDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start text-xs h-8">
                    <ImageIcon className="w-3 h-3 mr-2" /> URL Background
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Load Image URL</DialogTitle></DialogHeader>
                  <Input placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
                  <DialogFooter><Button onClick={handleUrlUpload}>Load</Button></DialogFooter>
                </DialogContent>
              </Dialog>

              {backgroundImage && (
                <Button variant="ghost" className="w-full justify-start text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setBackgroundImage(null)}>
                  <Trash2 className="w-3 h-3 mr-2" /> Remove Background
                </Button>
              )}

              <div className="h-px bg-gray-100 my-1" />

              <Button variant="ghost" className="w-full justify-start text-xs h-8 text-blue-600 bg-blue-50/50 hover:bg-blue-100" onClick={onDownload}>
                <Download className="w-3 h-3 mr-2" /> Save as PNG
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default DrawingTools;
