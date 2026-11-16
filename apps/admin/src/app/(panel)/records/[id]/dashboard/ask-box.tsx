"use client";

import { useState } from "react";
import { answerQuestion, type DashboardData } from "@/lib/sanad-dashboard";
import { buttonClass, inputClass } from "@/components/ui";

/** "Ask Sanad" for the opened employee: answers come only from this employee's dashboard data. */
export function AskBox({
  data,
  arabic,
  labels,
}: {
  data: DashboardData;
  arabic: boolean;
  labels: { askHint: string; askSend: string; quick: string[] };
}) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const ask = (text: string) => {
    const v = text.trim();
    if (!v) return;
    setQ(v);
    setAnswer(answerQuestion(data, v, arabic).text);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {labels.quick.map((k) => (
          <button key={k} type="button" className="rounded-full border border-accent px-3 py-1 text-sm hover:bg-primary-soft" onClick={() => ask(k)}>
            {k}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          className={inputClass}
          value={q}
          maxLength={200}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.askHint}
          aria-label={labels.askHint}
          data-testid="ask-field"
        />
        <button type="submit" className={buttonClass.primary}>
          {labels.askSend}
        </button>
      </form>
      {answer && (
        <p data-testid="ask-answer" className="whitespace-pre-line rounded-xl border border-accent bg-primary-soft px-4 py-3 text-sm">
          {answer}
        </p>
      )}
    </div>
  );
}
