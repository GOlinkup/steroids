import React from 'react';
interface ColorPaletteProps {
    currentColor: string;
    colors: {
        name: string;
        value: string;
    }[];
    onSelectColor: (color: string) => void;
}
declare const ColorPalette: React.FC<ColorPaletteProps>;
export default ColorPalette;
