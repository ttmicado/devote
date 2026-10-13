/**
 * トップページの線画（写真の代わりに上質さを出すための抽象的な SVG）。
 * すべて currentColor の細線。色と不透明度は呼び出し側の className で決める。
 */

type ArtProps = { className?: string };

/** 都心の街区を抽象化した線画（タワーと中低層の連なり） */
const BUILDINGS: [x: number, w: number, h: number, floors?: number][] = [
  [0, 70, 120],
  [62, 46, 180, 12],
  [100, 90, 96],
  [180, 54, 250, 18],
  [226, 80, 140],
  [300, 40, 300, 22],
  [334, 96, 170, 11],
  [420, 62, 360, 26],
  [478, 88, 120],
  [560, 50, 230, 16],
  [604, 110, 150],
  [706, 44, 330, 24],
  [744, 84, 200, 14],
  [820, 58, 270, 19],
  [872, 100, 110],
  [966, 48, 210, 15],
  [1008, 92, 150],
  [1094, 56, 260, 18],
  [1144, 56, 130],
];

export function Skyline({ className }: ArtProps) {
  const H = 400;
  // 外形は1本のパス、階の線は2階ごとに1本のパスへまとめる（HTML を軽くする）
  const outlines = BUILDINGS.map(([x, w, h]) => `M${x}.5 ${H}V${H - h}h${w}V${H}`).join("");
  const floors = BUILDINGS.flatMap(([x, w, h, n]) =>
    n
      ? Array.from({ length: Math.ceil(n / 2) }, (_, i) => {
          const y = Math.round(H - h + 12 + i * 2 * ((h - 18) / n));
          return `M${x + 6} ${y}h${w - 12}`;
        })
      : [],
  ).join("");
  const masts = BUILDINGS.filter(([, , , n]) => n && n > 20)
    .map(([x, w, h]) => `M${x + w / 2} ${H - h}v-40`)
    .join("");
  return (
    <svg
      viewBox={`0 0 1200 ${H}`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <path d={`${outlines}${masts}M0 ${H - 0.5}H1200`} />
        <path d={floors} strokeOpacity="0.45" />
      </g>
    </svg>
  );
}

/** 等高線のような曲線 */
function contourPath(i: number, cx: number, cy: number, base: number) {
  const pts: string[] = [];
  const N = 36;
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2;
    const r =
      base *
      (1 +
        0.09 * Math.sin(3 * t + i * 0.45) +
        0.05 * Math.cos(5 * t - i * 0.3) +
        0.03 * Math.sin(7 * t));
    pts.push(`${Math.round(cx + r * Math.cos(t) * 1.35)} ${Math.round(cy + r * Math.sin(t))}`);
  }
  return `M${pts.join("L")}Z`;
}

export function Contours({ className, rings = 14 }: ArtProps & { rings?: number }) {
  return (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {Array.from({ length: rings }, (_, i) => (
          <path key={i} d={contourPath(i, 420, 300, 28 + i * 24)} />
        ))}
      </g>
    </svg>
  );
}

/** 間取り図を抽象化した線画 */
export function FloorPlan({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 300 220" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <rect x="10" y="10" width="280" height="200" />
        <path d="M150 10V120M10 120H120M150 150V210M190 120H290M190 120V60H290" />
        <path d="M120 120a30 30 0 0 1 30 -30" strokeOpacity="0.5" />
        <path d="M150 150a30 30 0 0 1 30 -30" strokeOpacity="0.5" />
        <rect x="200" y="140" width="70" height="50" strokeOpacity="0.5" />
        <circle cx="70" cy="60" r="18" strokeOpacity="0.4" />
      </g>
    </svg>
  );
}

/** 窓の格子（12段×5列）。lit は強調する窓だけ */
function windows(lit: boolean) {
  let d = "";
  for (let r = 0; r < 12; r++)
    for (let c = 0; c < 5; c++)
      if (((r * 5 + c) % 7 === 0) === lit) d += `M${14 + c * 36} ${12 + r * 24}h28v16h-28z`;
  return d;
}

/** 窓の格子（ファサード） */
export function Facade({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <path d={windows(false)} strokeOpacity="0.35" />
        <path d={windows(true)} />
      </g>
    </svg>
  );
}
