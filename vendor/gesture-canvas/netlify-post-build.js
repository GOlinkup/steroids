import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the dist directory
const distDir = path.join(__dirname, 'dist');

// Function to recursively find all .gz files
async function findGzFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findGzFiles(fullPath);
      } else if (entry.name.endsWith('.gz')) {
        return [fullPath];
      }
      return [];
    })
  );
  return files.flat();
}

// Function to fix the paths in the dist directory
async function fixGzPaths() {
  try {
    console.log('Fixing compressed file paths for Netlify deployment...');
    
    // Find all .gz files
    const gzFiles = await findGzFiles(distDir);
    
    for (const filePath of gzFiles) {
      // Check if the file path contains an absolute path
      if (filePath.includes('/Users/') || filePath.includes('/home/')) {
        // Get the correct path relative to the dist directory
        const parts = filePath.split('/');
        const fileNameIndex = parts.findIndex(part => part.endsWith('.gz'));
        if (fileNameIndex > 0) {
          // Get the directory name (assets, mediapipe, etc.)
          const dirName = parts[fileNameIndex - 1];
          const fileName = parts[fileNameIndex];
          
          // Create the correct path
          const correctPath = path.join(distDir, dirName, fileName);
          
          // Create the directory if it doesn't exist
          const dirPath = path.dirname(correctPath);
          await fs.mkdir(dirPath, { recursive: true });
          
          // Move the file to the correct location
          await fs.rename(filePath, correctPath);
          console.log(`Fixed: ${path.relative(distDir, correctPath)}`);
        }
      }
    }
    
    console.log('All compressed files fixed successfully for Netlify deployment!');
  } catch (error) {
    console.error('Error fixing compressed files:', error);
    process.exit(1);
  }
}

// Run the function
fixGzPaths();
