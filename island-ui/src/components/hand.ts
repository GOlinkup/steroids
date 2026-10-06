// Minimal hand control for Lens — semantics reused from
// vendor/gesture-canvas, none of its weight. Index tip = cursor,
// pinch-hold = tap, palm-hold = back to live. Camera agnostic:
// PC webcam or phone browser camera, whatever opened this view.
export interface HandFrame {
  present: boolean;
  x: number; // 0..1 across the picture (mirrored)
  y: number; // 0..1 down the picture
  pinch: boolean;
  palm: boolean;
  fist: boolean;
}

type Detector = { estimateHands: (video: HTMLVideoElement, opts?: Record<string, unknown>) => Promise<Array<{ keypoints: Array<{ x: number; y: number }> }>> };

let cached: Detector | null = null;

export async function loadHandDetector(): Promise<Detector> {
  if (cached) return cached;
  const tf = await import("@tensorflow/tfjs-core");
  await import("@tensorflow/tfjs-converter");
  await import("@tensorflow/tfjs-backend-webgl");
  const hpd = await import("@tensorflow-models/hand-pose-detection");
  await tf.setBackend("webgl");
  await tf.ready();
  const model = hpd.SupportedModels.MediaPipeHands;
  // ponytail: tfjs runtime only, models self-hosted (public/models/hand).
  // No runtime CDN — hand mode works fully offline after install.
  cached = (await hpd.createDetector(model, {
    runtime: "tfjs",
    modelType: "lite",
    maxHands: 1,
    detectorModelUrl: "/models/hand/detector/model.json",
    landmarkModelUrl: "/models/hand/landmark/model.json",
  })) as unknown as Detector;
  return cached;
}

const ABSENT: HandFrame = { present: false, x: 0.5, y: 0.5, pinch: false, palm: false, fist: false };

export async function estimateHand(detector: Detector, video: HTMLVideoElement): Promise<HandFrame> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return ABSENT;
  let hands;
  try {
    hands = await detector.estimateHands(video, { flipHorizontal: false, staticImageMode: false });
  } catch {
    return ABSENT;
  }
  if (!hands?.length) return ABSENT;
  const kp = hands[0].keypoints;
  if (!kp || kp.length < 21) return ABSENT;
  const d = (a: number, b: number) => Math.hypot(kp[a].x - kp[b].x, kp[a].y - kp[b].y);
  const spread = (tip: number, pip: number) => d(tip, 0) > d(pip, 0);
  const fingers = [spread(8, 6), spread(12, 10), spread(16, 14), spread(20, 18)];
  return {
    present: true,
    x: Math.min(1, Math.max(0, 1 - kp[8].x / w)),
    y: Math.min(1, Math.max(0, kp[8].y / h)),
    pinch: d(4, 8) / w < 0.06,
    palm: fingers.every(Boolean),
    fist: !fingers.some(Boolean),
  };
}
