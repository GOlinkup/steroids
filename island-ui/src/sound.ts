// Tiny WebAudio blips — zero assets, offline. Coucou has 28 WAVs;
// we synthesize 3 (send/pop/approve) + mute + volume.
// Sound-pack mode (ping-island openpeon.json compat): when a pack dir is
// set and carries a file for the event, play it; else synth fallback.

let ctx: AudioContext | null = null;
let muted = false;
let volume = 0.5;
let pack: Record<string, string[]> = {};

export function setPack(files: Record<string, string[]>) { pack = files; }

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) { muted = m; }
export function isMuted() { return muted; }
export function setVolume(v: number) { volume = Math.max(0, Math.min(1, v)); }
export function getVolume() { return volume; }

function blip(freq: number, dur = 0.08, delay = 0) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25 * volume + 0.0001, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const Sound = {
  send: () => playFile("start") ?? blip(660, 0.07),
  pop: () => playFile("attention") ?? blip(520, 0.06),
  approve: () => { if (!playFile("complete")) { blip(523, 0.08); blip(784, 0.1, 0.09); } },
  deny: () => playFile("error") ?? blip(220, 0.12),
  huddleConnect: () => blip(660, 0.12),
  huddlePop: (i: number) => blip(480 + i * 90, 0.06),
  huddleChime: () => { blip(880, 0.09); blip(1320, 0.09, 0.09); },
};

function playFile(ev: string): boolean {
  if (muted) return true;
  const files = pack[ev];
  if (!files || !files.length) return false;
  try {
    const a = new Audio(files[0]);
    a.volume = volume;
    void a.play();
    return true;
  } catch {
    return false;
  }
}
