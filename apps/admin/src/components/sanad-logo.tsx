import { useId } from "react";

/**
 * The Sanad logo: a handshake (approved by the owner on 2026-11-17, PRD 12). Drawn in `currentColor`
 * so it is white on the rail and teal on light surfaces. The glyph is 3:2 and is never stretched;
 * set its width with a class and the height follows. Source: public/brand/sanad-logo.svg.
 */
export function SanadLogo({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const cut = `sanad-cut-${id}`;
  return (
    <svg
      viewBox="30 70 840 560"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <defs>
        <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width="900" height="768">
          <rect x="0" y="0" width="900" height="768" fill="#fff" />
          <g fill="none" stroke="#000" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
            <path d="M300,420 L438,282 L500,280 C512,280 520,286 526,296 L540,318 C548,330 562,332 574,326" />
            <path d="M380,402 L330,452" />
            <path d="M420,440 L372,494" />
            <path d="M462,478 L418,530" />
            <path d="M626,420 L652,456" />
            <path d="M578,454 L603,490" />
            <path d="M529,488 L553,524" />
          </g>
        </mask>
      </defs>
      <g fill="currentColor" mask={`url(#${cut})`}>
        <polygon points="66,392 172,182 268,238 162,436" />
        <polygon points="636,236 736,176 834,384 744,420" />
        <path d="M290,262 C345,262 382,238 426,212 L512,206 C530,206 540,216 548,230 L566,262 C588,262 606,256 626,250 L712,404 C690,430 640,470 600,498 L520,556 C500,570 480,566 470,552 L262,420 Z" />
        <g stroke="currentColor" strokeWidth="44" strokeLinecap="round">
          <line x1="350" y1="376" x2="290" y2="440" />
          <line x1="392" y1="414" x2="334" y2="482" />
          <line x1="434" y1="452" x2="380" y2="520" />
          <line x1="476" y1="490" x2="428" y2="556" />
        </g>
        <g stroke="currentColor" strokeWidth="54" strokeLinecap="round">
          <line x1="676" y1="414" x2="660" y2="440" />
          <line x1="628" y1="446" x2="612" y2="474" />
          <line x1="580" y1="480" x2="562" y2="508" />
          <line x1="530" y1="514" x2="512" y2="542" />
        </g>
      </g>
    </svg>
  );
}
