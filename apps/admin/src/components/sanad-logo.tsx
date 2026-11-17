/**
 * The Sanad logo: the Sanad bot's head (owner decision 2026-11-17, PRD 12), full colour, drawn by
 * tools/sanad-bot (public/brand/sanad-bot.svg). Set its width with a class; the height follows and
 * it is never stretched. Decorative by default (the wordmark beside it says the name).
 */
export function SanadLogo({ className, title }: { className?: string; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static SVG, no optimisation needed
    <img src="/brand/sanad-bot.svg" alt={title ?? ""} aria-hidden={title ? undefined : true} className={`h-auto ${className ?? ""}`} width={864} height={736} />
  );
}
