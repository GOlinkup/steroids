// First-run sheet: max 3 questions, one-tap skip. Never blocks:
// Skip and Save both dismiss via onDone.
import { useState, type JSX } from "react";
import { LEARN_QUESTIONS, type LearnLog } from "./learn";

export function FirstRun(props: {
  log: LearnLog;
  onDone: () => void;
}): JSX.Element {
  const [values, setValues] = useState<string[]>(
    LEARN_QUESTIONS.map(() => ""),
  );
  const set = (i: number, v: string): void => {
    setValues((prev) => prev.map((old, j) => (j === i ? v : old)));
  };
  return (
    <div className="card">
      <div className="card-title">Three quick questions (optional)</div>
      <div className="card-detail">
        Skip any time — the island learns by watching anyway.
      </div>
      {LEARN_QUESTIONS.map((q, i) => (
        <input
          key={q}
          aria-label={q}
          placeholder={q}
          value={values[i]}
          onChange={(e) => set(i, e.target.value)}
        />
      ))}
      <div className="btn-row">
        <button
          onClick={() => {
            props.log.skipQuestions();
            props.onDone();
          }}
        >
          Skip
        </button>
        <button
          className="primary"
          onClick={() => {
            const answers: Record<string, string> = {};
            values.forEach((v, i) => {
              if (v.trim()) answers[`q${i}`] = v.trim();
            });
            props.log.answer(answers);
            props.onDone();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
