/** Original procedural, planted-foot spider. All positions are viewport CSS pixels. */
export interface Point {
  x: number;
  y: number;
}
export interface SpiderOptions {
  intensity: number;
  personality: 'curious' | 'feral' | 'dreamy';
  reducedMotion: boolean;
  grip?: { point: Point; progress: number; color: string };
  descending?: boolean;
  pointer?: Point;
}

interface Leg {
  side: number;
  row: number;
  foot: Point;
  from: Point;
  to: Point;
  progress: number;
  duration: number;
  stepping: boolean;
  rested: number;
  color: string;
}

const COLORS = [
  '#78f5ff',
  '#3c8fff',
  '#bc7aff',
  '#ff769f',
  '#5fe9ff',
  '#e98dff',
  '#ffaf66',
  '#ab8aff',
];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eight independent feet and an analytic two-bone solver; no timers, DOM reads, or allocations per leg. */
export class Spider {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private age = 0;
  private clock = 0;
  private initialized = false;
  private body: Point = { x: 0, y: -100 };
  private velocity: Point = { x: 0, y: 0 };
  private destination: Point = { x: 0, y: 0 };
  private legs: Leg[] = [];
  private angle = 0;
  private scale = 1;
  private look: Point = { x: 0, y: 0 };
  private gripLeg = -1;
  private silkAnchor = 0;
  private silkAmount = 1;
  private options: SpiderOptions = { intensity: 0.6, personality: 'curious', reducedMotion: false };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Cr4wler needs a 2D canvas context.');
    this.ctx = context;
    for (let side = -1; side <= 1; side += 2) {
      for (let row = 0; row < 4; row++) {
        const p = { x: 0, y: 0 };
        this.legs.push({
          side,
          row,
          foot: { ...p },
          from: { ...p },
          to: { ...p },
          progress: 1,
          duration: 0.3,
          stepping: false,
          rested: row * 0.11,
          color: COLORS[this.legs.length]!,
        });
      }
    }
  }

  resize(width: number, height: number, dpr = 1): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = clamp(dpr, 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.scale = clamp(Math.min(this.width, this.height) / 700, 0.57, 1.12);
  }

  get position(): Point {
    return { ...this.body };
  }
  get feet(): Point[] {
    return this.legs.map((leg) => ({ ...leg.foot }));
  }
  get settled(): boolean {
    return (
      this.initialized &&
      this.silkAmount < 0.08 &&
      distance(this.body, this.destination) < 22 &&
      Math.hypot(this.velocity.x, this.velocity.y) < 35
    );
  }

  update(dt: number, time: number, target: Point, opts: SpiderOptions): void {
    // A suspended tab must never turn the spring integration into an enormous leap.
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.04);
    this.options = opts;
    this.clock = opts.reducedMotion ? 0 : time;
    const intensity = clamp(opts.intensity, 0, 1);
    const feral = opts.personality === 'feral';
    const dreamy = opts.personality === 'dreamy';
    this.destination.x = clamp(target.x, 35, Math.max(35, this.width - 35));
    this.destination.y = clamp(target.y, 45, Math.max(45, this.height - 45));
    if (!this.initialized) {
      this.initialized = true;
      this.silkAnchor = this.destination.x;
      this.body.x = this.destination.x;
      this.body.y = opts.reducedMotion ? this.destination.y : -100;
      this.legs.forEach((leg) => {
        const p = this.idealFoot(leg);
        Object.assign(leg.foot, p);
        Object.assign(leg.to, p);
        Object.assign(leg.from, p);
      });
    }
    this.age += dt;
    const entering = !opts.reducedMotion && this.age < 1.65;
    this.silkAmount = opts.reducedMotion
      ? 0
      : entering || opts.descending
        ? 1
        : Math.max(0, this.silkAmount - dt * 1.8);
    const enterProgress = smooth(clamp(this.age / 1.65, 0, 1));
    const sway = opts.reducedMotion
      ? 0
      : Math.sin(time * (dreamy ? 0.85 : 1.35)) * (dreamy ? 5 : 2);
    const desiredX = this.destination.x + sway;
    const desiredY = entering ? mix(-100, this.destination.y, enterProgress) : this.destination.y;
    const stiffness = opts.reducedMotion ? 65 : dreamy ? 24 : feral ? 60 : 38;
    const damping = Math.exp(-dt * (dreamy ? 8.5 : 11));
    this.velocity.x = (this.velocity.x + (desiredX - this.body.x) * stiffness * dt) * damping;
    this.velocity.y = (this.velocity.y + (desiredY - this.body.y) * stiffness * dt) * damping;
    const maximum = feral ? 520 : dreamy ? 240 : 370;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed > maximum) {
      this.velocity.x *= maximum / speed;
      this.velocity.y *= maximum / speed;
    }
    this.body.x += this.velocity.x * dt;
    this.body.y += this.velocity.y * dt;
    this.angle = mix(
      this.angle,
      clamp(this.velocity.x * 0.0009, -0.24, 0.24),
      1 - Math.exp(-dt * 6),
    );
    const lookAt = opts.grip?.point ?? opts.pointer ?? this.destination;
    const lookDistance = Math.max(1, distance(lookAt, this.body));
    this.look.x = mix(
      this.look.x,
      ((lookAt.x - this.body.x) / lookDistance) * 3,
      1 - Math.exp(-dt * 5),
    );
    this.look.y = mix(
      this.look.y,
      ((lookAt.y - this.body.y) / lookDistance) * 3,
      1 - Math.exp(-dt * 5),
    );
    // Keep ownership until release, even when the carried contact crosses the torso.
    const nextGrip = opts.grip
      ? this.gripLeg >= 0
        ? this.gripLeg
        : opts.grip.point.x < this.body.x
          ? 0
          : 4
      : -1;
    if (this.gripLeg !== nextGrip && this.gripLeg >= 0) this.legs[this.gripLeg]!.rested = 4;
    this.gripLeg = nextGrip;
    let movingFeet = this.legs.filter((leg) => leg.stepping).length;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]!;
      leg.rested += dt;
      if (i === this.gripLeg && opts.grip) {
        leg.stepping = false;
        const reach = 1 - Math.exp(-dt * (feral ? 19 : 12));
        leg.foot.x = mix(leg.foot.x, opts.grip.point.x, reach);
        leg.foot.y = mix(leg.foot.y, opts.grip.point.y, reach);
        continue;
      }
      const ideal = this.idealFoot(leg);
      if (entering || opts.descending) {
        // Legs unfold from their silk-hanging pose before they find the page.
        const hanging = 1 - smooth(clamp((this.age - 0.7) / 0.9, 0, 1));
        ideal.x = mix(ideal.x, this.body.x + leg.side * (28 + leg.row * 13) * this.scale, hanging);
        ideal.y = mix(ideal.y, this.body.y + (80 + leg.row * 24) * this.scale, hanging);
        leg.foot.x = mix(leg.foot.x, ideal.x, 1 - Math.exp(-dt * 9));
        leg.foot.y = mix(leg.foot.y, ideal.y, 1 - Math.exp(-dt * 9));
        leg.stepping = false;
        continue;
      }
      if (leg.stepping) {
        leg.progress = Math.min(1, leg.progress + dt / leg.duration);
        const t = smooth(leg.progress);
        // Zero lift velocity at both contacts prevents a hard snap into the planted pose.
        const lift = opts.reducedMotion ? 0 : Math.sin(Math.PI * leg.progress) ** 2;
        leg.foot.x = mix(leg.from.x, leg.to.x, t) + leg.side * lift * 9 * this.scale;
        leg.foot.y =
          mix(leg.from.y, leg.to.y, t) - lift * (opts.reducedMotion ? 0 : 19) * this.scale;
        if (leg.progress >= 1) {
          leg.stepping = false;
          leg.rested = 0;
          movingFeet--;
        }
      } else {
        const drift = distance(leg.foot, ideal);
        const needsStep = drift > (feral ? 43 : 57) * this.scale;
        const adjustment =
          !opts.reducedMotion && leg.rested > 2.5 + ((i * 0.71) % 3.4) && drift > 7;
        if ((needsStep || adjustment) && movingFeet < (speed > 190 ? 3 : 2) && leg.rested > 0.09) {
          Object.assign(leg.from, leg.foot);
          leg.to.x = ideal.x + this.velocity.x * 0.12;
          leg.to.y = ideal.y + this.velocity.y * 0.12;
          leg.duration = opts.reducedMotion
            ? 0.16
            : (dreamy ? 0.43 : feral ? 0.19 : 0.29) + (i % 3) * 0.027 - intensity * 0.035;
          leg.progress = 0;
          leg.stepping = true;
          movingFeet++;
        }
      }
    }
  }

  private idealFoot(leg: Leg): Point {
    const x = [112, 157, 147, 99][leg.row]!;
    const y = [-112, -42, 61, 139][leg.row]!;
    const variation = leg.side === 1 ? [12, -12, 16, -20][leg.row]! : 0;
    return {
      x: this.body.x + leg.side * (x + variation) * this.scale,
      y: this.body.y + (y + variation * 0.6) * this.scale,
    };
  }

  render(): void {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.initialized) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.silkAmount > 0) {
      ctx.globalAlpha = this.silkAmount * 0.45;
      ctx.strokeStyle = '#b0e9ff';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(this.silkAnchor, 0);
      ctx.bezierCurveTo(
        this.silkAnchor,
        this.body.y * 0.3,
        this.body.x - 7,
        this.body.y * 0.65,
        this.body.x,
        this.body.y - 23 * s,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const breathing = this.options.reducedMotion ? 0 : Math.sin(this.clock * 2.7) * 1.4;
    const torsoCos = Math.cos(this.angle);
    const torsoSin = Math.sin(this.angle);
    // The two passes provide a fine dark edge on light pages and a restrained neon core.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.legs.length; i++) {
        const leg = this.legs[i]!;
        const gripping = i === this.gripLeg;
        const localHipX = leg.side * 5 * s;
        const localHipY = (-13 + leg.row * 8) * s;
        const hipX = this.body.x + localHipX * torsoCos - localHipY * torsoSin;
        const hipY = this.body.y + breathing * s + localHipX * torsoSin + localHipY * torsoCos;
        const ankleX = leg.foot.x - leg.side * 7 * s;
        const ankleY = leg.foot.y - (gripping ? 8 : 12) * s;
        const dx = ankleX - hipX,
          dy = ankleY - hipY;
        const actual = Math.max(0.01, Math.hypot(dx, dy));
        // Extend long reaches without snapping or changing the planted contact.
        const upper = Math.max((103 + leg.row * 6) * s, actual * 0.53);
        const lower = Math.max((133 - leg.row * 5) * s, actual * 0.58);
        const length = clamp(actual, Math.abs(upper - lower) + 0.01, upper + lower - 0.01);
        const along = (upper * upper - lower * lower + length * length) / (2 * length);
        const perpendicular = Math.sqrt(Math.max(0, upper * upper - along * along));
        const bend = leg.side * (leg.row < 2 ? 1 : -1);
        const kneeX = hipX + (dx / actual) * along - (dy / actual) * perpendicular * bend;
        const kneeY = hipY + (dy / actual) * along + (dx / actual) * perpendicular * bend;
        ctx.strokeStyle =
          pass === 0 ? 'rgba(4, 9, 21, 0.72)' : gripping ? this.options.grip!.color : leg.color;
        ctx.lineWidth = pass === 0 ? 3.1 : gripping ? 1.35 : 0.95;
        ctx.globalAlpha = pass === 0 ? 0.65 : gripping ? 1 : 0.84;
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(ankleX, ankleY);
        ctx.lineTo(leg.foot.x, leg.foot.y);
        ctx.stroke();
        if (pass === 1) {
          ctx.fillStyle = gripping ? this.options.grip!.color : i % 2 === 0 ? '#f7b3fa' : '#c1faff';
          this.dot(kneeX, kneeY, 1.7 * s);
          this.dot(ankleX, ankleY, 1.05 * s);
          this.dot(hipX, hipY, 1.1 * s);
          // A pair of minute claws closes around a text contact; feet remain visible at rest.
          ctx.lineWidth = 0.8;
          const claw = gripping ? 4.5 : 2.5;
          ctx.beginPath();
          ctx.moveTo(leg.foot.x - claw, leg.foot.y - 2);
          ctx.lineTo(leg.foot.x, leg.foot.y);
          ctx.lineTo(leg.foot.x + claw, leg.foot.y - 2);
          ctx.stroke();
          if (!leg.stepping) this.dot(leg.foot.x, leg.foot.y, gripping ? 2 : 1.1);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(this.body.x, this.body.y + breathing * s);
    ctx.rotate(this.angle);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(7, 12, 24, 0.78)';
    ctx.strokeStyle = '#94eeff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, -23);
    ctx.lineTo(7, -20);
    ctx.lineTo(8, 20);
    ctx.lineTo(-5, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ce87ff';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-7, -23);
    ctx.lineTo(-2, -28);
    ctx.lineTo(11, -25);
    ctx.lineTo(12, 15);
    ctx.lineTo(8, 20);
    ctx.moveTo(7, -20);
    ctx.lineTo(11, -25);
    ctx.moveTo(-6, -6);
    ctx.lineTo(8, -3);
    ctx.moveTo(-5, 12);
    ctx.lineTo(8, 8);
    ctx.stroke();
    ctx.fillStyle = '#b9faff';
    this.dot(-2.5 + this.look.x * 0.5, -15 + this.look.y * 0.35, 1.25);
    this.dot(2.8 + this.look.x * 0.5, -14 + this.look.y * 0.35, 1.25);
    ctx.fillStyle = '#ff8fe0';
    this.dot(1, 5, 1.45);
    ctx.restore();
    if (this.options.grip && this.gripLeg >= 0) {
      const grip = this.options.grip;
      const foot = this.legs[this.gripLeg]!.foot;
      const contact = clamp(1 - distance(foot, grip.point) / 35, 0, 1);
      ctx.strokeStyle = grip.color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = contact * 0.7;
      const radius = 5 + Math.sin(clamp(grip.progress, 0, 1) * Math.PI) * 3;
      // Broken contact ring reads like a precise grab, without a flashing halo.
      ctx.beginPath();
      ctx.arc(foot.x, foot.y, radius, -0.6, 0.8);
      ctx.moveTo(foot.x + Math.cos(2.5) * radius, foot.y + Math.sin(2.5) * radius);
      ctx.arc(foot.x, foot.y, radius, 2.5, 3.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private dot(x: number, y: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
    this.ctx.fill();
  }
}
