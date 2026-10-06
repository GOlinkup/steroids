
/**
 * Utility functions for handling images in the drawing canvas
 */

/**
 * Loads an image from a file and returns a promise that resolves with the image element
 * @param file The file to load
 * @returns Promise that resolves with the loaded image element
 */
export const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }
    
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Draws an image on a canvas
 * @param ctx Canvas 2D rendering context
 * @param img Image to draw
 * @param fitToCanvas Whether to fit the image to the canvas
 */
export const drawImageOnCanvas = (
  ctx: CanvasRenderingContext2D, 
  img: HTMLImageElement,
  fitToCanvas: boolean = true
): void => {
  const canvas = ctx.canvas;
  
  if (fitToCanvas) {
    // Calculate scaling to fit image within canvas while maintaining aspect ratio
    const scale = Math.min(
      canvas.width / img.width,
      canvas.height / img.height
    );
    
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    
    // Center the image
    const x = (canvas.width - scaledWidth) / 2;
    const y = (canvas.height - scaledHeight) / 2;
    
    // Draw image
    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
  } else {
    // Draw image at original size, centered
    const x = (canvas.width - img.width) / 2;
    const y = (canvas.height - img.height) / 2;
    ctx.drawImage(img, x, y);
  }
};

/**
 * Resizes a canvas to fit the parent container
 * @param canvas The canvas element to resize
 * @param container The parent container of the canvas
 * @param maintainContent Whether to maintain the current content when resizing
 */
export const resizeCanvasToFitContainer = (
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  maintainContent: boolean = true
): void => {
  if (!canvas || !container) return;

  // Remember original content if needed
  let imageData: ImageData | null = null;
  if (maintainContent) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }

  // Get container dimensions
  const rect = container.getBoundingClientRect();
  
  // Set canvas size to match container
  canvas.width = rect.width;
  canvas.height = rect.height;

  // Restore content if needed
  if (maintainContent && imageData) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
  }
};
