import fs from 'fs';

export const onPostBuild = async ({ utils }) => {
  console.log('MediaPipe Handler Plugin: Starting...');

  // Check if the mediapipe directory exists in the publish directory
  const mediapipeDir = 'dist/mediapipe';

  if (!fs.existsSync(mediapipeDir)) {
    console.log(`MediaPipe directory not found at ${mediapipeDir}. Creating it...`);
    fs.mkdirSync(mediapipeDir, { recursive: true });
  }

  // Check if the MediaPipe files exist in the public directory
  const publicMediapipeDir = 'public/mediapipe';
  if (!fs.existsSync(publicMediapipeDir)) {
    console.warn(`Public MediaPipe directory not found at ${publicMediapipeDir}. MediaPipe files may be missing.`);
    return;
  }

  // Copy MediaPipe files from public to dist if they exist
  const files = [
    'hands_solution_simd_wasm_bin.js',
    'hands_solution_simd_wasm_bin.wasm',
    'hands_solution_packed_assets_loader.js',
    'hands_solution_packed_assets.data'
  ];

  let copyCount = 0;
  for (const file of files) {
    const sourcePath = `${publicMediapipeDir}/${file}`;
    const destPath = `${mediapipeDir}/${file}`;

    if (fs.existsSync(sourcePath)) {
      try {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${file} to ${destPath}`);
        copyCount++;
      } catch (error) {
        console.error(`Error copying ${file}: ${error.message}`);
      }
    } else {
      console.warn(`MediaPipe file not found: ${sourcePath}`);
    }
  }

  console.log(`MediaPipe Handler Plugin: Completed. Copied ${copyCount} files.`);
};
