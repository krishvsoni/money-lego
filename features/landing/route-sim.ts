// A payout route drawn in glyph cells: value leaves a treasury, passes three hops, then
// splits across four recipients by allocation. Particles stamp "heat" into a cell grid that
// decays each frame, which is what makes the trails read like moving ASCII creatures.

export interface Point {
  x: number;
  y: number;
}

export const GLYPHS = "$%#@8St:xo";

// The route hugs the edges of the hero, so the headline and card in the middle stay
// clear: down the left side, along the bottom, then up the right into the recipients.
export const SOURCE: Point = { x: 0.05, y: 0.16 };
export const HOPS: Point[] = [
  { x: 0.15, y: 0.5 },
  { x: 0.07, y: 0.84 },
  { x: 0.5, y: 0.96 },
];
export const SPLIT: Point = { x: 0.82, y: 0.9 };
export const RECIPIENTS = [
  { at: { x: 0.94, y: 0.16 }, share: 0.4, label: "design 40%" },
  { at: { x: 0.88, y: 0.38 }, share: 0.3, label: "eng 30%" },
  { at: { x: 0.95, y: 0.58 }, share: 0.2, label: "ops 20%" },
  { at: { x: 0.9, y: 0.76 }, share: 0.1, label: "community 10%" },
];

function catmullRom(points: Point[], samples = 40): Point[] {
  const out: Point[] = [];
  const p = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p[i - 1].x, p[i].x, p[i + 1].x, p[i + 2].x), y: f(p[i - 1].y, p[i].y, p[i + 1].y, p[i + 2].y) });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// Paths are arc-length parametrised so particles keep a steady pace around curves.
class Path {
  readonly pts: Point[];
  readonly lengths: number[];
  readonly total: number;
  constructor(points: Point[], aspect: number) {
    this.pts = catmullRom(points);
    this.lengths = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const dx = (this.pts[i].x - this.pts[i - 1].x) * aspect;
      const dy = this.pts[i].y - this.pts[i - 1].y;
      this.lengths.push(this.lengths[i - 1] + Math.hypot(dx, dy));
    }
    this.total = this.lengths[this.lengths.length - 1];
  }
  at(t: number): Point {
    const target = Math.min(1, Math.max(0, t)) * this.total;
    let lo = 0;
    let hi = this.lengths.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.lengths[mid] < target) lo = mid;
      else hi = mid;
    }
    const span = this.lengths[hi] - this.lengths[lo] || 1;
    const k = (target - this.lengths[lo]) / span;
    return { x: this.pts[lo].x + (this.pts[hi].x - this.pts[lo].x) * k, y: this.pts[lo].y + (this.pts[hi].y - this.pts[lo].y) * k };
  }
}

interface Particle {
  leg: number;
  t: number;
  speed: number;
  dest: number;
  wobble: number;
}

export class RouteSim {
  cols = 0;
  rows = 0;
  heat = new Float32Array(0);
  tint = new Int8Array(0);
  glyph = new Uint8Array(0);
  private main!: Path;
  private branches: Path[] = [];
  private particles: Particle[] = [];
  private spawnDebt = 0;
  private seed = 7;

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.heat = new Float32Array(cols * rows);
    this.tint = new Int8Array(cols * rows).fill(-1);
    this.glyph = new Uint8Array(cols * rows).map(() => Math.floor(this.random() * GLYPHS.length));
    const aspect = cols / Math.max(rows, 1);
    this.main = new Path([SOURCE, ...HOPS, SPLIT], aspect);
    this.branches = RECIPIENTS.map((r) => new Path([SPLIT, { x: (SPLIT.x + r.at.x) / 2, y: (SPLIT.y + r.at.y) / 2 }, r.at], aspect));
    this.particles = [];
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private pickDestination(): number {
    let r = this.random();
    for (let i = 0; i < RECIPIENTS.length; i++) {
      r -= RECIPIENTS[i].share;
      if (r <= 0) return i;
    }
    return RECIPIENTS.length - 1;
  }

  private stamp(p: Point, amount: number, dest: number, radius: number) {
    const cx = p.x * this.cols;
    const cy = p.y * this.rows;
    const r = Math.ceil(radius);
    for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
        if (x < 0 || x >= this.cols) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > radius) continue;
        const i = y * this.cols + x;
        this.heat[i] = Math.min(1.4, this.heat[i] + amount * (1 - d / (radius + 0.5)));
        if (dest >= 0 && this.random() < 0.08) this.tint[i] = dest;
        if (this.random() < 0.02) this.glyph[i] = Math.floor(this.random() * GLYPHS.length);
      }
    }
  }

  step(dt: number) {
    for (let i = 0; i < this.heat.length; i++) {
      this.heat[i] *= 0.955;
      if (this.heat[i] < 0.02) {
        this.heat[i] = 0;
        this.tint[i] = -1;
      }
    }

    this.spawnDebt += dt * 26;
    while (this.spawnDebt > 1) {
      this.spawnDebt -= 1;
      this.particles.push({ leg: -1, t: 0, speed: 0.3 + this.random() * 0.14, dest: this.pickDestination(), wobble: this.random() * Math.PI * 2 });
    }

    const alive: Particle[] = [];
    for (const p of this.particles) {
      const path = p.leg < 0 ? this.main : this.branches[p.leg];
      p.t += (p.speed * dt) / Math.max(path.total, 0.01);
      if (p.t >= 1) {
        if (p.leg < 0) {
          p.leg = p.dest;
          p.t = 0;
        } else continue;
      }
      const at = path.at(p.t);
      const offset = Math.sin(p.wobble + p.t * 9) * 0.6;
      this.stamp({ x: at.x, y: at.y + offset / this.rows }, 0.22, p.leg < 0 ? -1 : p.dest, 1.6);
      alive.push(p);
    }
    this.particles = alive;

    for (const hop of [SOURCE, ...HOPS, SPLIT]) this.stamp(hop, 0.05, -1, 2.2);
    RECIPIENTS.forEach((r, i) => this.stamp(r.at, 0.05, i, 2.4));
  }

  // Run the simulation forward without drawing, for a static frame or a warm start.
  warm(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 30) this.step(1 / 30);
  }
}
