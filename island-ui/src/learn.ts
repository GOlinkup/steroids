// First-run study + learn-me. On-device only: localStorage event log,
// zero telemetry. This module has NO runtime imports at all — not even
// a type import that could smuggle network code (storage seam is local).
// Q8 default = observe-only from install; max 3 questions, one-tap skip.
export interface KVStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const LEARN_QUESTIONS = [
  "What work fits you best?",
  "When are you usually free?",
  "How far can you travel for a gig?",
];

/** Days of watching before suggestions rank by behavior (~a week). */
export const LEARN_DAYS = 7;

export interface LearnPick {
  id: string;
  category: string;
}

const K_EVENTS = "island_learn_events";
const K_ASKED = "island_q_asked";
const K_ANSWERS = "island_q_answers";

export class LearnLog {
  private store: KVStore;
  private now: () => Date;

  constructor(store: KVStore, now?: () => Date) {
    this.store = store;
    this.now = now ?? (() => new Date());
  }

  observe(event: string): void {
    const rows = this.read();
    rows.push({ e: event, t: this.now().toISOString() });
    this.store.setItem(K_EVENTS, JSON.stringify(rows));
  }

  /** Every learned datum, viewable. */
  all(): Array<{ e: string; t: string }> {
    return this.read();
  }

  /** Every learned datum, deletable. */
  clear(): void {
    this.store.removeItem(K_EVENTS);
    this.store.removeItem(K_ANSWERS);
    this.store.removeItem(K_ASKED);
  }

  questionsDone(): boolean {
    return this.store.getItem(K_ASKED) === "1";
  }

  /** Stores at most 3 answers (the max the sheet can ask). */
  answer(answers: Record<string, string>): void {
    const take: Record<string, string> = {};
    for (const k of Object.keys(answers).slice(0, 3)) {
      take[k] = answers[k];
    }
    this.store.setItem(K_ANSWERS, JSON.stringify(take));
    this.store.setItem(K_ASKED, "1");
  }

  /** One tap skips all questions. Observing continues (Q8 default). */
  skipQuestions(): void {
    this.store.setItem(K_ASKED, "1");
  }

  daysObserved(): number {
    const days = new Set<string>();
    for (const m of this.read()) {
      if (typeof m.t === "string" && m.t.length >= 10) {
        days.add(m.t.substring(0, 10));
      }
    }
    return days.size;
  }

  /**
   * Honest while learning: unchanged order + note. Ranked after ~a week:
   * category affinity = views + 3 x saves; unknown keeps input order.
   */
  suggest(picks: LearnPick[]): { ranked: LearnPick[]; note: string | null } {
    const days = this.daysObserved();
    if (days < LEARN_DAYS) {
      return {
        ranked: picks,
        note: `Still learning your rhythm — ${days} of ~${LEARN_DAYS} days in.`,
      };
    }
    const score: Record<string, number> = {};
    for (const m of this.read()) {
      if (m.e.startsWith("gig_view:")) {
        const c = m.e.substring(9);
        score[c] = (score[c] ?? 0) + 1;
      } else if (m.e.startsWith("gig_save:")) {
        const c = m.e.substring(9);
        score[c] = (score[c] ?? 0) + 3;
      }
    }
    const ranked = [...picks];
    ranked.sort(
      (a, b) => (score[b.category] ?? 0) - (score[a.category] ?? 0),
    );
    return { ranked, note: null };
  }

  private read(): Array<{ e: string; t: string }> {
    let raw: string | null = null;
    try {
      raw = this.store.getItem(K_EVENTS);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const decoded: unknown = JSON.parse(raw);
      if (!Array.isArray(decoded)) return [];
      return (decoded as Array<{ e: string; t: string }>).filter(
        (m) => m && typeof m.e === "string",
      );
    } catch {
      return [];
    }
  }
}
