import type { ComponentProps, ReactNode } from "react";

// Shared building blocks for the panel screens (identity "sea glass", see DESIGN.md).

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`card overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5 ${className}`}>{children}</section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-lg border border-control-line bg-surface-2 px-3 py-2 text-foreground hover:border-foreground/60 focus-visible:border-primary sm:min-h-10 focus-visible:bg-surface focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-60";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 sm:min-h-10 text-center font-medium whitespace-nowrap active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

export const buttonClass = {
  primary: `${buttonBase} bg-primary px-5 text-on-primary hover:bg-primary-hover`,
  secondary: `${buttonBase} border border-line-strong bg-surface text-foreground hover:border-primary hover:bg-primary-soft`,
  danger: `${buttonBase} border border-danger/50 bg-surface text-danger hover:border-danger hover:bg-danger-soft`,
};

/** Text link inside tables and sentences. */
export const linkClass = "font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary";

const iconPaths = {
  back: "M16 10H4M8.5 5.5 4 10l4.5 4.5",
  prev: "M12 5.5 7.5 10l4.5 4.5",
  next: "M8 5.5 12.5 10 8 14.5",
  check: "m5 10.5 3.2 3.2L15 6.8",
  plus: "M10 4.5v11M4.5 10h11",
};

/** Drawn icons in one stroke. Direction icons follow the reading direction (they flip in Arabic). */
export function Icon({ name, className = "" }: { name: keyof typeof iconPaths; className?: string }) {
  const directional = name === "back" || name === "prev" || name === "next";
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`inline-block size-4 shrink-0 ${directional ? "rtl:-scale-x-100" : ""} ${className}`}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function AlertIcon({ kind }: { kind: "error" | "success" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 size-4 shrink-0">
      <circle cx="10" cy="10" r="7.25" />
      {kind === "error" ? <path d="M10 6.5v4.25M10 13.4v.1" /> : <path d="m6.9 10.2 2.1 2.1 4.1-4.4" />}
    </svg>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const cls = kind === "error" ? "border-danger/25 bg-danger-soft text-danger" : "border-ok/25 bg-ok-soft text-ok";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}>
      <AlertIcon kind={kind} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const badgeTone = {
  ok: "bg-ok-soft text-ok [--disc:var(--ok)]",
  off: "bg-surface-2 text-muted ring-1 ring-inset ring-line [--disc:var(--line-strong)]",
  warn: "bg-warn-soft text-warn [--disc:var(--disc-late)]",
  danger: "bg-danger-soft text-danger [--disc:var(--danger)]",
  info: "bg-info-soft text-info [--disc:var(--info)]",
};

/** A state mark: an enamel disc and a word. State is never colour alone. */
export function Badge({ tone, children }: { tone: keyof typeof badgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${badgeTone[tone]}`}>
      <i className="disc size-1.5!" aria-hidden />
      {children}
    </span>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll relative overflow-x-auto rounded-xl border border-line shadow-card in-[.card]:-mx-4 in-[.card]:rounded-none in-[.card]:border-x-0 in-[.card]:shadow-none in-[.card]:last:-mb-4 in-[.card]:last:border-b-0 sm:in-[.card]:-mx-5 sm:in-[.card]:last:-mb-5">
      <table className="w-full text-sm [&_td]:px-4 [&_td]:py-2.5 max-sm:[&_td]:whitespace-nowrap [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-[0.8125rem] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-muted [&_thead]:bg-primary/4 [&_tr]:border-b [&_tr]:border-line [&_tbody_tr]:hover:bg-primary/4 [&_tbody_tr:last-child]:border-0">
        {children}
      </table>
    </div>
  );
}

/** "Nothing here yet", said calmly, with the identity's discs at rest. */
export function Empty({ children, ...rest }: { children: ReactNode } & ComponentProps<"p">) {
  return (
    <p {...rest} className={`flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm text-muted ${rest.className ?? ""}`}>
      <span className="flex shrink-0 gap-1" aria-hidden>
        <i className="disc" />
        <i className="disc" />
        <i className="disc" />
      </span>
      <span>{children}</span>
    </p>
  );
}
