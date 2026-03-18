// banner — Animated welcome banner for forge init

/** Delay helper for line-by-line animation */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if the terminal likely supports 24-bit color */
function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.TERM === "dumb") return false;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- isTTY is undefined when not a TTY
  return process.stdout.isTTY ?? false;
}

// ── Multi-stop gradient interpolation ──

type RGB = [number, number, number];

function lerpColor(stops: readonly RGB[], t: number): RGB {
  const clamped = Math.max(0, Math.min(1, t));
  const segments = stops.length - 1;
  const segment = Math.min(Math.floor(clamped * segments), segments - 1);
  const localT = clamped * segments - segment;
  const a = stops[segment];
  const b = stops[segment + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * localT),
    Math.round(a[1] + (b[1] - a[1]) * localT),
    Math.round(a[2] + (b[2] - a[2]) * localT),
  ];
}

const ESC = "\u001B";

/** Color each non-space character with a diagonal gradient (horizontal + vertical blend) */
function gradientLine(
  text: string,
  lineIndex: number,
  totalLines: number,
  stops: readonly RGB[],
): string {
  if (!supportsColor()) return text;

  const maxCol = 48; // normalization width
  let result = "";

  // eslint-disable-next-line unicorn/no-for-loop -- spread/Array.from both lint-conflict on string iteration
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") {
      result += ch;
      continue;
    }
    // Diagonal blend: 70% horizontal position + 30% vertical position
    const h = i / maxCol;
    const v = lineIndex / Math.max(totalLines - 1, 1);
    const t = h * 0.7 + v * 0.3;
    const [r, g, b] = lerpColor(stops, t);
    result += `${ESC}[38;2;${String(r)};${String(g)};${String(b)}m${ch}`;
  }

  return result + `${ESC}[0m`;
}

// ── ASCII Art — "FORGE" in ANSI Shadow font ──

const ART = [
  "  ███████╗ ██████╗ ██████╗  ██████╗ ███████╗",
  "  ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝",
  "  █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ",
  "  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ",
  "  ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗",
  "  ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
];

// Gradient: amber → orange → violet (forge/fire theme)
const GRADIENT_STOPS: readonly RGB[] = [
  [251, 191, 36], // amber-400
  [249, 115, 22], // orange-500
  [139, 92, 246], // violet-500
];

/** Print animated welcome banner with diagonal gradient (TTY only) */
export async function printBanner(version: string): Promise<void> {
  const delay = 30;
  const useColor = supportsColor();

  console.log();

  // Art lines with per-character diagonal gradient
  for (const [i, line] of ART.entries()) {
    console.log(gradientLine(line, i, ART.length, GRADIENT_STOPS));
    await sleep(delay);
  }

  console.log();

  // Tagline: "SVP · Semantic Voxel Protocol · v{version}"
  if (useColor) {
    const svp = `${ESC}[1m${ESC}[38;2;251;191;36mSVP${ESC}[0m`; // bold amber
    const dot = `${ESC}[38;2;71;85;105m·${ESC}[0m`; // slate-600
    const tag = `${ESC}[38;2;148;163;184mSemantic Voxel Protocol${ESC}[0m`; // slate-400
    const ver = `${ESC}[38;2;100;116;139mv${version}${ESC}[0m`; // slate-500
    console.log(`  ${svp}  ${dot}  ${tag}  ${dot}  ${ver}`);
  } else {
    console.log(`  SVP  ·  Semantic Voxel Protocol  ·  v${version}`);
  }

  console.log();
}
