/**
 * Simple color utility class for manipulating colors
 */
export class Color {
  r: number;
  g: number;
  b: number;

  constructor(hexColor: string) {
    // Parse hex color
    const hex = hexColor.replace('#', '');
    this.r = parseInt(hex.substring(0, 2), 16);
    this.g = parseInt(hex.substring(2, 4), 16);
    this.b = parseInt(hex.substring(4, 6), 16);
  }

  /**
   * Darken the color by a percentage (0-1)
   */
  darken(amount: number): Color {
    this.r = Math.max(0, Math.floor(this.r * (1 - amount)));
    this.g = Math.max(0, Math.floor(this.g * (1 - amount)));
    this.b = Math.max(0, Math.floor(this.b * (1 - amount)));
    return this;
  }

  /**
   * Lighten the color by a percentage (0-1)
   */
  lighten(amount: number): Color {
    this.r = Math.min(255, Math.floor(this.r + (255 - this.r) * amount));
    this.g = Math.min(255, Math.floor(this.g + (255 - this.g) * amount));
    this.b = Math.min(255, Math.floor(this.b + (255 - this.b) * amount));
    return this;
  }

  /**
   * Convert to hex string
   */
  hex(): string {
    return `#${this.r.toString(16).padStart(2, '0')}${this.g.toString(16).padStart(2, '0')}${this.b.toString(16).padStart(2, '0')}`;
  }
}
