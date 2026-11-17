// The identity's one picture: a sphere of enamel discs, after the Kuwait Towers.
// Decorative only (aria-hidden); the colours are fixed because it always sits on the deep teal rail colour.
const HUES = ["#1b646b", "#23808a", "#2c9c7c", "#5fd3c6", "#8fe3d9", "#2c6f93", "#7f9db5", "#d7ece9"];
const N = 19;
const STEP = 10;

const discs: { x: number; y: number; fill: string }[] = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const x = c * STEP + STEP / 2;
    const y = r * STEP + STEP / 2;
    const centre = (N * STEP) / 2;
    if (Math.hypot(x - centre, y - centre) > centre - STEP / 2) continue;
    // Slanted bands with a little irregularity, like the towers' spiral of sequins.
    const band = Math.floor((r + c) / 2) + ((r * 7 + c * 13) % 3);
    discs.push({ x, y, fill: HUES[band % HUES.length] });
  }
}

export function DiscSphere({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${N * STEP} ${N * STEP}`} aria-hidden className={className}>
      {discs.map((d) => (
        <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={3.9} fill={d.fill} />
      ))}
    </svg>
  );
}
