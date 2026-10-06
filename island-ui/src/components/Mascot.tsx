import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { SteroidsMascot } from "../mascot";

export interface MascotHandle {
  poke: () => void;
  annoy: () => void;
  dizzy: () => void;
  celebrate: () => void;
  setLook: (x: number, y: number) => void;
}

interface Props {
  px?: number;
  onTap?: (taps: number) => void;
}

// Canvas wrapper around the Steroids pixel renderer (own art, no rewrite).
const Mascot = forwardRef<MascotHandle, Props>(function Mascot({ px = 8, onTap }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<SteroidsMascot | null>(null);
  const tapsRef = useRef<number[]>([]);

  useImperativeHandle(ref, () => ({
    poke: () => instRef.current?.poke(),
    annoy: () => instRef.current?.annoy(),
    dizzy: () => instRef.current?.dizzy(),
    celebrate: () => instRef.current?.celebrate(),
    setLook: (x, y) => instRef.current?.setLook(x, y),
  }));

  useEffect(() => {
    if (!canvasRef.current) return;
    const inst = new SteroidsMascot(canvasRef.current, { px });
    instRef.current = inst;
    return () => {
      inst.destroy();
      instRef.current = null;
    };
  }, [px]);

  const handleClick = () => {
    const now = Date.now();
    tapsRef.current = tapsRef.current.filter((t) => now - t < 600);
    tapsRef.current.push(now);
    const n = tapsRef.current.length;
    if (n >= 3) {
      tapsRef.current = [];
      instRef.current?.dizzy();
      onTap?.(3);
    } else if (n === 2) {
      instRef.current?.annoy();
      onTap?.(2);
    } else {
      instRef.current?.poke();
      onTap?.(1);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="mascot"
      aria-label="Nicki, the Steroids mascot"
      onClick={handleClick}
    />
  );
});

export default Mascot;
