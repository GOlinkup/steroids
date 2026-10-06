import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.join(__dirname, 'node_modules', '@mediapipe', 'hands');
const targetDir = path.join(__dirname, 'public', 'mediapipe');

const filesToCopy = [
  'hands_solution_simd_wasm_bin.js',
  'hands_solution_simd_wasm_bin.wasm',
  'hands_solution_packed_assets_loader.js',
  'hands_solution_packed_assets.data'
];

async function copyFiles() {
  try {
    // Create target directory if it doesn't exist
    await fs.mkdir(targetDir, { recursive: true });
    
    let copyErrors = 0;
    for (const file of filesToCopy) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);

      try {
        // Check if source file exists
        await fs.access(sourcePath);
        
        // Copy the file
        await fs.copyFile(sourcePath, targetPath);
        console.log(`✓ Successfully copied ${file}`);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.warn(`⚠ Warning: Source file ${file} not found - this may be expected for some builds`);
        } else {
          console.error(`✗ Error copying ${file}: ${err.message}`);
          copyErrors++;
        }
      }
    }

    if (copyErrors > 0) {
      console.warn(`\n⚠ Completed with ${copyErrors} errors. Some MediaPipe assets may be missing.`);
      // Don't exit with error to allow build to continue
    } else {
      console.log('\n✓ MediaPipe assets copy completed successfully');
    }
  } catch (err) {
    console.error('Fatal error copying MediaPipe assets:', err);
    // Only exit with error for fatal issues
    if (err.code !== 'ENOENT') {
      process.exit(1);
    }
  }
}

copyFiles(); 