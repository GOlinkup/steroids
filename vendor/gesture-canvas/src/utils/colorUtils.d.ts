/**
 * Simple color utility class for manipulating colors
 */
export declare class Color {
    r: number;
    g: number;
    b: number;
    constructor(hexColor: string);
    /**
     * Darken the color by a percentage (0-1)
     */
    darken(amount: number): Color;
    /**
     * Lighten the color by a percentage (0-1)
     */
    lighten(amount: number): Color;
    /**
     * Convert to hex string
     */
    hex(): string;
}
