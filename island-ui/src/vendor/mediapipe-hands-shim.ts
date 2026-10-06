// Build shim for @mediapipe/hands: it ships a UMD-without-exports bundle
// that strict bundlers (rolldown) reject on `import { Hands }` inside
// hand-pose-detection. We only use the tfjs runtime, so Hands is never
// constructed — this stub only satisfies the static import.
export const Hands = undefined as unknown as new (...args: never[]) => {
  send: (input: unknown) => Promise<void>;
  onResults: (cb: (r: unknown) => void) => void;
  close: () => Promise<void>;
  setOptions: (o: unknown) => void;
  reset: () => void;
  initialize: () => Promise<void>;
};
export const VERSION = "0.4.1675469240";
export const HAND_CONNECTIONS: number[][] = [];
