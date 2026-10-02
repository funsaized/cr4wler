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
  selector?: {
    rect: { x: number; y: number; width: number; height: number };
    progress: number;
    phase: 'scan' | 'lock' | 'strike';
    color: string;
  };
  surface?: 'light' | 'dark';
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
  ideal: Point;
  hip: Point;
  knee: Point;
  ankle: Point;
  lift: number;
}

const COLORS = [
  '#78f5ff',
  '#73adff',
  '#cb91ff',
  '#ff8cb0',
  '#5fe9ff',
  '#e98dff',
  '#ffaf66',
  '#ab8aff',
];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eight independent feet and an analytic two-bone solver; no timers or DOM reads. */
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
  private gripCaptured = false;
  private gripReach = 0;
  private gripFrom: Point = { x: 0, y: 0 };
  private lastStep = -1;
  private suspension = 0;
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
          ideal: { ...p },
          hip: { ...p },
          knee: { ...p },
          ankle: { ...p },
          lift: 0,
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
  /** The same transformed emitter position used to draw the head and its beam. */
  get headPosition(): Point {
    const x = this.look.x * 0.55 * this.scale;
    const y = (-19 + this.look.y * 0.55) * this.scale;
    return {
      x: this.body.x + x * Math.cos(this.angle) - y * Math.sin(this.angle),
      y: this.body.y + this.bodyOffset() + x * Math.sin(this.angle) + y * Math.cos(this.angle),
    };
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
    if (opts.reducedMotion) {
      // Quiet mode has no integration drift, idle sway, scanning beam, or moving feet.
      Object.assign(this.body, this.destination);
      this.velocity.x = this.velocity.y = this.angle = this.suspension = this.silkAmount = 0;
      this.look.x = this.look.y = 0;
      this.gripLeg = -1;
      this.gripCaptured = false;
      for (const leg of this.legs) {
        Object.assign(leg.foot, this.idealFoot(leg));
        leg.stepping = false;
        leg.lift = 0;
      }
      return;
    }
    const entering = !opts.reducedMotion && this.age < 1.65;
    this.silkAmount = opts.reducedMotion
      ? 0
      : entering || opts.descending
        ? 1
        : Math.max(0, this.silkAmount - dt * 1.8);
    const enterProgress = smooth(clamp(this.age / 1.65, 0, 1));
    const desiredX = this.destination.x;
    const desiredY = entering ? mix(-100, this.destination.y, enterProgress) : this.destination.y;
    const stiffness = opts.reducedMotion ? 65 : dreamy ? 24 : feral ? 60 : 38;
    const damping = Math.exp(-dt * (dreamy ? 8.5 : 11));
    const previousVX = this.velocity.x;
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
    const selector = opts.selector;
    const lookAt = selector
      ? {
          x: selector.rect.x + selector.rect.width / 2,
          y: selector.rect.y + selector.rect.height / 2,
        }
      : (opts.grip?.point ?? opts.pointer ?? this.destination);
    const lookDistance = Math.max(1, distance(lookAt, this.body));
    const intentX = clamp((this.destination.x - this.body.x) / 100, -1, 1);
    const accelerationX = dt > 0 ? clamp((this.velocity.x - previousVX) / dt, -1800, 1800) : 0;
    this.angle = mix(
      this.angle,
      clamp(
        this.velocity.x * 0.00065 +
          accelerationX * 0.000018 +
          intentX * 0.035 +
          (selector ? ((lookAt.x - this.body.x) / lookDistance) * 0.045 : 0),
        -0.28,
        0.28,
      ),
      1 - Math.exp(-dt * 6),
    );
    const lookX = ((lookAt.x - this.body.x) / lookDistance) * 3.6;
    const lookY = ((lookAt.y - this.body.y) / lookDistance) * 3.6;
    // Eye and emitter articulation is local to the rotating head, not the page axes.
    this.look.x = mix(
      this.look.x,
      lookX * Math.cos(this.angle) + lookY * Math.sin(this.angle),
      1 - Math.exp(-dt * (selector ? 11 : 7)),
    );
    this.look.y = mix(
      this.look.y,
      -lookX * Math.sin(this.angle) + lookY * Math.cos(this.angle),
      1 - Math.exp(-dt * (selector ? 11 : 7)),
    );
    // Keep ownership until release, even when the carried contact crosses the torso.
    const nextGrip = opts.grip
      ? this.gripLeg >= 0
        ? this.gripLeg
        : opts.grip.point.x < this.body.x
          ? 0
          : 4
      : -1;
    if (this.gripLeg !== nextGrip) {
      if (this.gripLeg >= 0) this.legs[this.gripLeg]!.rested = 4;
      this.gripCaptured = false;
      this.gripReach = 0;
      if (nextGrip >= 0) Object.assign(this.gripFrom, this.legs[nextGrip]!.foot);
    }
    this.gripLeg = nextGrip;
    let movingFeet = this.legs.filter((leg) => leg.stepping).length;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]!;
      leg.rested += dt;
      if (i === this.gripLeg && opts.grip) {
        if (leg.stepping) movingFeet--;
        leg.stepping = false;
        leg.lift = 0;
        this.gripReach = Math.min(1, this.gripReach + dt / (feral ? 0.18 : 0.25));
        if (this.gripCaptured || this.gripReach === 1) {
          // Once closed, a carried contact is exact rather than trailing its source.
          Object.assign(leg.foot, opts.grip.point);
          this.gripCaptured = true;
        } else {
          const reach = smooth(this.gripReach);
          leg.foot.x = mix(this.gripFrom.x, opts.grip.point.x, reach);
          leg.foot.y =
            mix(this.gripFrom.y, opts.grip.point.y, reach) -
            Math.sin(this.gripReach * Math.PI) ** 2 * 6 * this.scale;
        }
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
        leg.lift = 0;
        continue;
      }
      if (leg.stepping) {
        leg.progress = Math.min(1, leg.progress + dt / leg.duration);
        const t = smooth(leg.progress);
        // Zero lift velocity at both contacts prevents a hard snap into the planted pose.
        const lift = opts.reducedMotion ? 0 : Math.sin(Math.PI * leg.progress) ** 2;
        leg.lift = lift;
        leg.foot.x = mix(leg.from.x, leg.to.x, t) + leg.side * lift * 9 * this.scale;
        leg.foot.y =
          mix(leg.from.y, leg.to.y, t) - lift * (opts.reducedMotion ? 0 : 19) * this.scale;
        if (leg.progress >= 1) {
          leg.stepping = false;
          leg.rested = 0;
          leg.lift = 0;
          movingFeet--;
        }
      }
    }
    if (!entering && !opts.descending) {
      // Replant the most displaced foot first; fixed array order starves rear feet on turns.
      // Keep at least five contacts, and never lift three feet on the same side.
      const budget = (speed > 190 ? 3 : 2) - (this.gripLeg >= 0 ? 1 : 0);
      while (movingFeet < budget) {
        let next = -1;
        let best = -Infinity;
        for (let i = 0; i < this.legs.length; i++) {
          const leg = this.legs[i]!;
          if (i === this.gripLeg || leg.stepping || leg.rested <= 0.09) continue;
          const drift = distance(leg.foot, leg.ideal);
          const needsStep = drift > (feral ? 43 : 57) * this.scale;
          const adjustment = leg.rested > 2.5 + ((i * 0.71) % 3.4) && drift > 7;
          if (!needsStep && !adjustment) continue;
          let sameSideMoving = 0;
          for (const other of this.legs) {
            if (other.side === leg.side && (other.stepping || other === this.legs[this.gripLeg])) {
              sameSideMoving++;
            }
          }
          if (sameSideMoving >= 2) continue;
          const opposite = this.lastStep >= 0 && this.legs[this.lastStep]!.side !== leg.side;
          const score = drift + Math.min(leg.rested, 3) * 2 + (opposite ? 8 : 0);
          if (score > best) {
            next = i;
            best = score;
          }
        }
        if (next < 0) break;
        const leg = this.legs[next]!;
        Object.assign(leg.from, leg.foot);
        leg.to.x = leg.ideal.x + this.velocity.x * 0.12;
        leg.to.y = leg.ideal.y + this.velocity.y * 0.12;
        leg.duration =
          (dreamy ? 0.43 : feral ? 0.19 : 0.29) + (next % 3) * 0.027 - intensity * 0.035;
        leg.progress = 0;
        leg.stepping = true;
        this.lastStep = next;
        movingFeet++;
      }
    }
    let liftLoad = 0;
    for (const leg of this.legs) liftLoad += leg.lift;
    this.suspension = mix(this.suspension, liftLoad * 0.65, 1 - Math.exp(-dt * 12));
  }

  private idealFoot(leg: Leg): Point {
    const x = [112, 157, 147, 99][leg.row]!;
    const y = [-112, -42, 61, 139][leg.row]!;
    const variation = leg.side === 1 ? [12, -12, 16, -20][leg.row]! : 0;
    const localX = leg.side * (x + variation) * this.scale;
    const localY = (y + variation * 0.6) * this.scale;
    const turn = this.angle * 0.65;
    leg.ideal.x = this.body.x + localX * Math.cos(turn) - localY * Math.sin(turn);
    leg.ideal.y = this.body.y + localX * Math.sin(turn) + localY * Math.cos(turn);
    return leg.ideal;
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
    this.renderSelector();
    const offset = this.bodyOffset();
    const torsoCos = Math.cos(this.angle);
    const torsoSin = Math.sin(this.angle);
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]!;
      const gripping = i === this.gripLeg;
      const localHipX = leg.side * 5 * s;
      const localHipY = (-13 + leg.row * 8) * s;
      leg.hip.x = this.body.x + localHipX * torsoCos - localHipY * torsoSin;
      leg.hip.y = this.body.y + offset + localHipX * torsoSin + localHipY * torsoCos;
      leg.ankle.x = leg.foot.x - leg.side * (7 - leg.lift * 2) * s;
      leg.ankle.y = leg.foot.y - (gripping ? 8 : 12 - leg.lift * 3) * s;
      const dx = leg.ankle.x - leg.hip.x;
      const dy = leg.ankle.y - leg.hip.y;
      const actual = Math.max(0.01, Math.hypot(dx, dy));
      // Extend long reaches without snapping or changing the planted contact.
      const upper = Math.max((103 + leg.row * 6) * s, actual * 0.53);
      const lower = Math.max((133 - leg.row * 5) * s, actual * 0.58);
      const length = clamp(actual, Math.abs(upper - lower) + 0.01, upper + lower - 0.01);
      const along = (upper * upper - lower * lower + length * length) / (2 * length);
      const perpendicular = Math.sqrt(Math.max(0, upper * upper - along * along));
      const bend = leg.side * (leg.row < 2 ? 1 : -1);
      leg.knee.x = leg.hip.x + (dx / actual) * along - (dy / actual) * perpendicular * bend;
      leg.knee.y = leg.hip.y + (dy / actual) * along + (dx / actual) * perpendicular * bend;
    }
    // Opaque local edging preserves the thin colored cores even on white or busy pages.
    // Light comes from short active struts and pin joints, never a full-rig blur.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.legs.length; i++) {
        const leg = this.legs[i]!;
        const gripping = i === this.gripLeg;
        const active = gripping || leg.stepping || (!!this.options.selector && leg.row === 0);
        const color = gripping ? this.options.grip!.color : leg.color;
        ctx.strokeStyle = pass === 0 ? '#060c1a' : color;
        ctx.lineWidth = pass === 0 ? (active ? 4 : 3.5) : active ? 1.5 : 1.2;
        ctx.globalAlpha = pass === 0 ? (this.options.surface === 'light' ? 0.9 : 0.73) : 1;
        ctx.beginPath();
        ctx.moveTo(leg.hip.x, leg.hip.y);
        ctx.lineTo(leg.knee.x, leg.knee.y);
        ctx.lineTo(leg.ankle.x, leg.ankle.y);
        ctx.lineTo(leg.foot.x, leg.foot.y);
        ctx.stroke();
        const claw = (gripping ? 4.5 : 2.8) * s;
        ctx.lineWidth = pass === 0 ? 3 : 1;
        ctx.beginPath();
        ctx.moveTo(leg.foot.x - claw, leg.foot.y - 2 * s);
        ctx.lineTo(leg.foot.x, leg.foot.y);
        ctx.lineTo(leg.foot.x + claw, leg.foot.y - 2 * s);
        ctx.stroke();
        if (pass === 1) {
          // Short, sharp highlights articulate the bones without thickening the silhouette.
          const travel = leg.stepping ? smooth(leg.progress) * 0.5 : 0;
          this.strut(leg.hip, leg.knee, 0.2 + travel, active ? 0.16 : 0.08, color, active);
          this.strut(leg.knee, leg.ankle, 0.07, active ? 0.13 : 0.06, color, active);
          this.joint(leg.knee, color, active ? 1.85 : 1.5, active);
          this.joint(leg.ankle, color, 1.1, false);
          this.joint(leg.hip, color, 1.2, active);
          if (!leg.stepping) this.joint(leg.foot, color, gripping ? 1.8 : 0.95, gripping);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(this.body.x, this.body.y + offset);
    ctx.rotate(this.angle);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(6, 12, 25, 0.94)';
    ctx.strokeStyle = '#a6f7ff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-7, -23);
    ctx.lineTo(7, -20);
    ctx.lineTo(8, 20);
    ctx.lineTo(-5, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#d297ff';
    ctx.lineWidth = 1.05;
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
    ctx.strokeStyle = '#72c2df';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(3, 1);
    ctx.lineTo(-2, 10);
    ctx.moveTo(11, -17);
    ctx.lineTo(7, -12);
    ctx.moveTo(11, 2);
    ctx.lineTo(7, 6);
    ctx.stroke();
    // A tiny gimballed head module sits inside the original narrow wireframe cuboid.
    const headX = this.look.x * 0.55;
    const headY = -19 + this.look.y * 0.55;
    const headColor = this.options.selector?.color ?? '#a6f7ff';
    ctx.fillStyle = '#080e20';
    ctx.strokeStyle = '#8bdce9';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(-5 + headX * 0.3, -23 + this.look.y * 0.2);
    ctx.lineTo(5 + headX * 0.3, -21 + this.look.y * 0.2);
    ctx.lineTo(5.5, -9);
    ctx.lineTo(-4.5, -11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e1fdff';
    this.dot(-2.4 + headX * 0.65, -13.6 + this.look.y * 0.3, 1.05);
    this.dot(2.6 + headX * 0.65, -12.6 + this.look.y * 0.3, 1.05);
    ctx.fillStyle = headColor;
    ctx.shadowColor = headColor;
    ctx.shadowBlur = this.options.selector ? 5 : 2;
    this.dot(headX, headY, this.options.selector ? 2.1 : 1.45);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f7ffff';
    this.dot(headX, headY, 0.7);
    ctx.strokeStyle = headColor;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(headX + this.look.x * 1.15, headY + this.look.y * 1.15);
    ctx.stroke();
    ctx.fillStyle = '#ffb3ed';
    this.dot(1, 4, 1.55);
    ctx.fillStyle = '#d8ffff';
    this.dot(-1, 17, 0.9);
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

  private bodyOffset(): number {
    if (this.options.reducedMotion) return 0;
    const breath = Math.sin(this.clock * 2.3) * (this.options.selector ? 0.3 : 0.6);
    return (breath - this.suspension) * this.scale;
  }

  private strut(
    from: Point,
    to: Point,
    start: number,
    length: number,
    color: string,
    active: boolean,
  ): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(mix(from.x, to.x, start), mix(from.y, to.y, start));
    ctx.lineTo(mix(from.x, to.x, start + length), mix(from.y, to.y, start + length));
    if (active) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.globalAlpha = 0.17;
      ctx.stroke();
    }
    ctx.strokeStyle = '#efffff';
    ctx.lineWidth = active ? 0.8 : 0.55;
    ctx.globalAlpha = active ? 0.94 : 0.62;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private joint(point: Point, color: string, radius: number, active: boolean): void {
    const ctx = this.ctx;
    const size = Math.max(0.8, radius * this.scale);
    ctx.fillStyle = '#070c1c';
    this.dot(point.x, point.y, size + 0.85);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = active ? 4.5 : 0;
    this.dot(point.x, point.y, size);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f0ffff';
    this.dot(point.x - size * 0.15, point.y - size * 0.2, active ? size * 0.53 : size * 0.4);
  }

  private renderSelector(): void {
    const selector = this.options.selector;
    if (!selector) return;
    const { rect, color, phase } = selector;
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width <= 0 ||
      rect.height <= 0
    )
      return;
    const ctx = this.ctx;
    const quiet = this.options.reducedMotion;
    const p = clamp(Number.isFinite(selector.progress) ? selector.progress : 0, 0, 1);
    const scan = phase === 'scan' && !quiet;
    const strike = phase === 'strike' && !quiet;
    const acquisition = scan ? smooth(clamp(p / 0.84, 0, 1)) : 1;
    const pad = 4 + (1 - acquisition) * 13;
    const shiftX = scan ? Math.sin(p * Math.PI * 4) * (1 - acquisition) * 9 : 0;
    const shiftY = scan ? Math.cos(p * Math.PI * 3) * (1 - acquisition) * 4 : 0;
    const left = rect.x - pad + shiftX;
    const top = rect.y - pad + shiftY;
    const right = rect.x + rect.width + pad + shiftX;
    const bottom = rect.y + rect.height + pad + shiftY;
    const arm = Math.min(scan ? 9 : strike ? 8 : 12, (right - left) / 3, (bottom - top) / 2.5);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    // One smooth, low-contrast envelope per phase; no flashing or full-page wash.
    const envelope = quiet ? 0 : Math.sin(p * Math.PI) ** 2;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = quiet ? 0.018 : 0.018 + envelope * 0.022;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.globalAlpha = this.options.surface === 'light' ? 0.65 : 0.45;
    ctx.strokeStyle = '#070d1a';
    ctx.lineWidth = 3.5;
    this.brackets(left, top, right, bottom, arm);
    ctx.stroke();
    ctx.globalAlpha = scan ? 0.88 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = strike ? 1.55 : 1.25;
    ctx.stroke();
    ctx.globalAlpha = quiet ? 0.32 : scan ? 0.28 : 0.44;
    ctx.lineWidth = 0.65;
    ctx.setLineDash(scan ? [2, 5] : []);
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.setLineDash([]);
    // Fine external ticks make the lock read as a measured area, without covering the text.
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = mix(left, right, (i + 1) / 4);
      ctx.moveTo(x, top - 3);
      ctx.lineTo(x, top - (i === 1 ? 7 : 5));
      ctx.moveTo(x, bottom + 3);
      ctx.lineTo(x, bottom + (i === 1 ? 7 : 5));
    }
    ctx.moveTo(left - 5, cy - 3);
    ctx.lineTo(left - 5, cy + 3);
    ctx.moveTo(right + 5, cy - 3);
    ctx.lineTo(right + 5, cy + 3);
    ctx.stroke();
    if (!scan) {
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = this.options.surface === 'light' ? '#152139' : '#eaffff';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(left, top + arm * 0.7);
      ctx.lineTo(left, top);
      ctx.lineTo(left + arm * 0.7, top);
      ctx.moveTo(right, bottom - arm * 0.7);
      ctx.lineTo(right, bottom);
      ctx.lineTo(right - arm * 0.7, bottom);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(left, bottom + 10);
      ctx.lineTo(mix(left, right, quiet ? 1 : phase === 'lock' ? smooth(p) : 1), bottom + 10);
      ctx.stroke();
    }
    if (!quiet) {
      const sweep = mix(
        0.5 - 0.5 * Math.cos(p * Math.PI * 4),
        0.5,
        smooth(clamp((p - 0.72) / 0.28, 0, 1)),
      );
      const aim = {
        x: scan
          ? mix(rect.x, rect.x + rect.width, sweep)
          : cx + (strike ? Math.sin(p * Math.PI * 2) * Math.min(22, rect.width * 0.22) : 0),
        y: cy,
      };
      if (scan || strike) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = scan ? 0.65 : 0.8;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(aim.x, top + 3);
        ctx.lineTo(aim.x, bottom - 3);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.045;
        const band = Math.min(12, rect.width);
        ctx.fillRect(
          clamp(aim.x - band / 2, rect.x, rect.x + rect.width - band),
          rect.y,
          band,
          rect.height,
        );
      }
      const head = this.headPosition;
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(aim.x, aim.y);
      ctx.strokeStyle = '#050c18';
      ctx.globalAlpha = this.options.surface === 'light' ? 0.58 : 0.35;
      ctx.lineWidth = 2.7;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.globalAlpha = strike ? 0.9 : scan ? 0.46 : 0.66;
      ctx.lineWidth = strike ? 1.15 : 0.8;
      ctx.stroke();
      if (strike) {
        ctx.strokeStyle = '#edffff';
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
      // A brief traveling highlight conveys a directed beam without brightness strobing.
      const travel = scan ? (p * 2) % 1 : strike ? p : 0.7;
      this.strut(head, aim, clamp(travel, 0.06, 0.9), 0.04, color, strike);
      ctx.strokeStyle = color;
      ctx.globalAlpha = strike ? 1 : 0.85;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const focus = strike ? 5 : 4;
      ctx.moveTo(aim.x - focus, aim.y);
      ctx.lineTo(aim.x - 2, aim.y);
      ctx.moveTo(aim.x + 2, aim.y);
      ctx.lineTo(aim.x + focus, aim.y);
      ctx.moveTo(aim.x, aim.y - focus);
      ctx.lineTo(aim.x, aim.y - 2);
      ctx.moveTo(aim.x, aim.y + 2);
      ctx.lineTo(aim.x, aim.y + focus);
      ctx.stroke();
      this.joint(aim, color, strike ? 1.75 : 1.1, strike);
    }
    ctx.restore();
  }

  private brackets(left: number, top: number, right: number, bottom: number, arm: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(left, top + arm);
    ctx.lineTo(left, top);
    ctx.lineTo(left + arm, top);
    ctx.moveTo(right - arm, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + arm);
    ctx.moveTo(right, bottom - arm);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right - arm, bottom);
    ctx.moveTo(left + arm, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, bottom - arm);
  }

  private dot(x: number, y: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
    this.ctx.fill();
  }
}
