
import React from 'react';
import { cn } from '@/lib/utils';

interface ColorPaletteProps {
  currentColor: string;
  colors: { name: string, value: string }[];
  onSelectColor: (color: string) => void;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({
  currentColor,
  colors,
  onSelectColor,
}) => {
  return (
    <div className="flex flex-wrap gap-2 justify-center mb-4">
      {colors.map((color) => (
        <button
          key={color.name}
          className={cn(
            "w-10 h-10 rounded-full border-2 shadow transition-transform hover:scale-110",
            currentColor === color.value ? "border-black scale-110" : "border-gray-300"
          )}
          style={{ backgroundColor: color.value }}
          onClick={() => onSelectColor(color.value)}
          title={color.name}
          aria-label={`Select ${color.name} color`}
        />
      ))}
    </div>
  );
};

export default ColorPalette;
