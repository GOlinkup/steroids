/**
 * Utility functions for handling images in the drawing canvas
 */
/**
 * Loads an image from a file and returns a promise that resolves with the image element
 * @param file The file to load
 * @returns Promise that resolves with the loaded image element
 */
export declare const loadImageFromFile: (file: File) => Promise<HTMLImageElement>;
/**
 * Draws an image on a canvas
 * @param ctx Canvas 2D rendering context
 * @param img Image to draw
 * @param fitToCanvas Whether to fit the image to the canvas
 */
export declare const drawImageOnCanvas: (ctx: CanvasRenderingContext2D, img: HTMLImageElement, fitToCanvas?: boolean) => void;
/**
 * Resizes a canvas to fit the parent container
 * @param canvas The canvas element to resize
 * @param container The parent container of the canvas
 * @param maintainContent Whether to maintain the current content when resizing
 */
export declare const resizeCanvasToFitContainer: (canvas: HTMLCanvasElement, container: HTMLElement, maintainContent?: boolean) => void;
