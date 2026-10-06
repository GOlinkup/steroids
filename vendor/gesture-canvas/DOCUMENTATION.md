# Gesture Canvas Art Stream Documentation

## Overview

Gesture Canvas Art Stream is an interactive web application that allows users to create digital art using hand gestures captured through their webcam. The application uses advanced computer vision techniques to track hand movements and translate them into drawing actions on a digital canvas.

This document provides comprehensive documentation for the Gesture Canvas application, including features, setup instructions, technical details, and future plans.

## Table of Contents

1. [Features](#features)
2. [Installation and Setup](#installation-and-setup)
3. [Hand Gesture Recognition System](#hand-gesture-recognition-system)
4. [Feedback Submission System](#feedback-submission-system)
5. [Browser Compatibility](#browser-compatibility)
6. [Known Limitations](#known-limitations)
7. [Planned Future Enhancements](#planned-future-enhancements)
8. [Deployment Options](#deployment-options)
9. [Technical Architecture](#technical-architecture)

## Features

### Gesture Controls
- Draw with hand gestures using your webcam
- Support for drawing with both hands simultaneously
- Six different gesture controls:
  - **Drawing Mode**: Index finger extended, other fingers closed
  - **Color Selection**: Three fingers extended (index, middle, ring)
  - **Stop Drawing**: Closed fist (all fingers closed)
  - **Clear Canvas**: All fingers extended (open palm) - hold for 1-2 seconds
  - **Eraser Mode**: Two fingers extended (index and middle)
  - **Dual-Hand Drawing**: Both hands with index fingers extended
- Visual indicators showing current active gesture
- Mouse/touch fallback for drawing when hand tracking is unavailable

### User Interface
- Responsive design that works on desktop and mobile devices
- Real-time hand tracking with TensorFlow.js and MediaPipe
- Visual feedback for gesture recognition
- Color palette for selecting drawing colors
- Manual brush size control via UI slider (not controlled by hand gestures)

### Feedback System
- User feedback form for bug reports, feature requests, and general feedback
- Email notifications for submitted feedback (development mode only logs email details)
- Confirmation emails to users (not sent in development mode)
- Secure form handling with validation and sanitization
- Rate limiting to prevent abuse (maximum 5 submissions per hour)

## Installation and Setup

### Prerequisites
- Node.js & npm - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
- Git

### Development Setup

```sh
# Step 1: Clone the repository
git clone https://github.com/yourusername/gesture-canvas.git

# Step 2: Navigate to the project directory
cd gesture-canvas

# Step 3: Install the necessary dependencies
npm i

# Step 4: Start the development server
npm run dev
```

The application will be available at http://localhost:8080

### Local Development with Netlify Functions

To test the serverless functions locally:

```sh
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your SMTP settings
nano .env

# Start the development server with Netlify Functions support
npm run dev:netlify
```

## Hand Gesture Recognition System

The application uses a dual-approach to hand tracking:

1. **Primary Method**: TensorFlow.js with the HandPose model for accurate tracking
2. **Fallback Method**: MediaPipe runtime when TensorFlow.js is not available or encounters issues

This ensures compatibility across different browsers and devices, providing a consistent experience for all users.

### Hand Detection Process

1. **Hand Detection**: The webcam feed is processed using TensorFlow.js and MediaPipe's hand pose detection models to identify hands in the frame.

2. **Landmark Tracking**: Once hands are detected, the application tracks 21 key points (landmarks) on each hand, including fingertips, knuckles, and the wrist.

3. **Gesture Recognition**: Based on the relative positions of these landmarks, the application recognizes specific gestures:
   - Index finger extended = Drawing mode
   - Three fingers extended (index, middle, ring) = Color selection
   - Two fingers extended (index and middle) = Eraser mode
   - All fingers extended (open palm) = Clear canvas (when held for 1-2 seconds)
   - Closed fist (all fingers closed) = Stop drawing
   - Both hands with index fingers extended = Dual-hand drawing

4. **Canvas Interaction**: The recognized gestures are translated into drawing actions on the HTML5 Canvas element, allowing users to create digital art without touching their device.

### Performance Optimizations

- **Throttled Rendering**: Limits the frame rate of hand tracking to maintain smooth performance
- **Chunked Processing**: Processes video frames in chunks to prevent UI blocking
- **Lazy Loading**: Loads the hand tracking models only when needed
- **Asset Compression**: Uses compression for faster loading of application assets

## Feedback Submission System

The application includes a feedback submission system implemented as a Netlify serverless function.

### Current Status

- The feedback system is currently in **development mode**
- In development mode, emails are not actually sent but are logged to the console
- The system is fully functional and ready for production use once deployed

### Features

- Email notification to admin when feedback is submitted
- Confirmation email to user
- Input validation and sanitization
- Rate limiting to prevent abuse (maximum 5 submissions per hour)
- CSRF protection

### Configuration

To enable email sending in production, set the following environment variables:

```
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
ADMIN_EMAIL=admin@example.com
SEND_EMAILS_IN_DEV=false  # Set to 'true' to send actual emails in development mode
```

## Browser Compatibility

The application works best on modern browsers that support:
- WebGL for TensorFlow.js
- WebAssembly for MediaPipe
- getUserMedia API for webcam access

Recommended browsers:
- Chrome (latest)
- Firefox (latest)
- Edge (latest)
- Safari 14+

## Known Limitations

1. **Performance on Low-End Devices**: Hand tracking can be resource-intensive and may not perform optimally on low-end devices.

2. **Lighting Sensitivity**: Hand detection accuracy is dependent on good lighting conditions.

3. **Browser Compatibility**: Some older browsers may not support the required WebGL and WebAssembly features.

4. **Mobile Experience**: While the application works on mobile devices, the experience is optimized for desktop use.

5. **Brush Size Control**: Currently, brush size can only be changed manually through the UI controls, not through hand gestures.

## Planned Future Enhancements

1. **Additional Drawing Tools and Effects**: More creative tools and visual effects.

2. **Improved Gesture Recognition Accuracy**: Enhanced algorithms for better hand tracking in various lighting conditions.

3. **Gallery Feature**: Save and share creations with others.

4. **Collaborative Drawing Mode**: Allow multiple users to draw on the same canvas in real-time.

5. **Mobile-Optimized Experience**: Improved interface and performance for mobile devices.

## Deployment Options

### GitHub Pages

The project is deployed on GitHub Pages. You can access the live version at:
https://greenhacker420.github.io/gesture-canvas/

#### Automatic Deployment (GitHub Actions)

The project is configured to automatically deploy to GitHub Pages when changes are pushed to the main branch. The GitHub Actions workflow in `.github/workflows/deploy.yml` handles the build and deployment process.

Key configuration:
- Uses Node.js 20
- Builds with `npm run build:github`
- Creates a `.nojekyll` file to ensure proper asset loading
- Deploys to the `gh-pages` branch

#### Manual Deployment

```sh
# Build the project for GitHub Pages
npm run build:github

# Deploy to GitHub Pages
npm run deploy
```

### Netlify

The project can also be deployed on Netlify with full support for MediaPipe and serverless functions.

#### Automatic Deployment

1. Connect your GitHub repository to Netlify
2. Set the build command to `npm run build:netlify`
3. Set the publish directory to `dist`
4. Set the required environment variables in your Netlify dashboard

The project includes a `netlify.toml` configuration file and custom plugin to ensure:
- Proper handling of MediaPipe WASM files
- Correct CORS headers
- Optimized asset caching
- Serverless functions configuration

## Technical Architecture

### Frontend Components

- **Canvas Panel**: Manages the drawing surface and rendering of strokes
- **Camera Panel**: Handles webcam access and displays the video feed
- **Gesture Handler**: Processes hand tracking data and converts it to drawing commands
- **Drawing Context**: Manages the application state including current tool, color, and canvas history

### Technology Stack

- **Frontend Framework**: React with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **UI Components**: shadcn-ui for accessible and customizable components
- **Styling**: Tailwind CSS for utility-first styling
- **Hand Tracking**: TensorFlow.js and MediaPipe for real-time hand pose detection
- **State Management**: React Context API for application state
- **Routing**: React Router for navigation
- **Testing**: React Testing Library for component testing
