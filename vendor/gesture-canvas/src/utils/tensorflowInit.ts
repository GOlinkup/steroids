
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-converter';
import '@tensorflow/tfjs-backend-webgl';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

let isInitialized = false;

// Add logging to track initialization progress
export const initializeTensorFlow = async () => {
  if (isInitialized) return;

  try {
    console.log('Starting TensorFlow.js initialization...');

    // Explicitly set flags for better performance on various devices
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', false); // Changed to false for better compatibility
    tf.env().set('WEBGL_VERSION', 2);
    tf.env().set('WEBGL_PACK', true);
    tf.env().set('WEBGL_CPU_FORWARD', false);
    tf.env().set('WEBGL_PACK_DEPTHWISECONV', true);
    
    // Set the backend to WebGL
    await tf.setBackend('webgl');
    console.log('TensorFlow backend set to:', tf.getBackend());
    
    // Initialize WebGL backend
    await tf.ready();
    console.log('TensorFlow.js is ready');
    
    // Log GPU information if available
    try {
      const webGLInfo = (tf.backend() as any).getGPGPUContext().gl.getParameter(0x1F00); // GL_RENDERER
      console.log('WebGL Renderer:', webGLInfo);
    } catch (e) {
      console.log('Could not get WebGL renderer info');
    }
    
    isInitialized = true;
    console.log('TensorFlow.js initialization complete!');
  } catch (error) {
    console.error('Error initializing TensorFlow.js:', error);
    throw error;
  }
};

export const createHandDetector = async () => {
  try {
    // Ensure TensorFlow is initialized
    await initializeTensorFlow();

    // Use MediaPipeHands model
    const model = handPoseDetection.SupportedModels.MediaPipeHands;

    try {
      console.log('Starting hand detector creation with TensorFlow.js runtime...');
      
      // Create detector with optimized settings for wide browser support
      const tfjsConfig: handPoseDetection.MediaPipeHandsTfjsModelConfig = {
        runtime: 'tfjs',
        modelType: 'lite', // Use lite model for better performance across devices
        maxHands: 2,
        detectorModelUrl: undefined, // Use default URL
        landmarkModelUrl: undefined, // Use default URL
      };

      const detector = await handPoseDetection.createDetector(model, tfjsConfig);
      console.log('Hand detector created successfully with TensorFlow.js runtime');
      
      // Verify detector
      if (!detector) {
        throw new Error('Detector creation returned null or undefined');
      }
      
      // Test detector to ensure it's working
      console.log('Detector object:', detector);
      
      return detector;
    } catch (tfjsError) {
      console.warn('Failed to initialize with TensorFlow.js runtime, error:', tfjsError);
      console.log('Falling back to MediaPipe runtime...');

      // Fall back to MediaPipe runtime if TFJS fails
      const mediaPipeConfig: handPoseDetection.MediaPipeHandsMediaPipeModelConfig = {
        runtime: 'mediapipe',
        modelType: 'lite', // Use lite model for better compatibility
        maxHands: 2,
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915', // Use specific version
      };

      const detector = await handPoseDetection.createDetector(model, mediaPipeConfig);
      console.log('Hand detector created successfully with MediaPipe runtime');
      
      return detector;
    }
  } catch (error) {
    console.error('Error creating hand detector:', error);
    throw error;
  }
};
