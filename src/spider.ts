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
  /** Immediate hover attention can change while a captured strike finishes. */
  attention?: Point;
  pursuing?: boolean;
  /** Page movement in viewport pixels; consume each scroll delta exactly once. */
  surfaceDelta?: Point;
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

interface MotionProfile {
  speed: number;
  acceleration: number;
  braking: number;
  turnRate: number;
  turnResponse: number;
  eyeResponse: number;
  stepTime: number;
  stepDrift: number;
  stepRest: number;
  stepLift: number;
  stanceX: readonly number[];
  stanceY: readonly number[];
  upper: number;
  lower: number;
  torso: number;
  headWidth: number;
  eyeSize: number;
}

// Each temperament changes its skeleton, support rhythm, steering, and attention.
const PROFILES: Record<SpiderOptions['personality'], MotionProfile> = {
  dreamy: {
    speed: 350,
    acceleration: 1200,
    braking: 1600,
    turnRate: 3.8,
    turnResponse: 5,
    eyeResponse: 6,
    stepTime: 0.3,
    stepDrift: 39,
    stepRest: 0.07,
    stepLift: 13,
    stanceX: [106, 148, 137, 95],
    stanceY: [-105, -34, 63, 125],
    upper: 101,
    lower: 118,
    torso: 1.14,
    headWidth: 8,
    eyeSize: 2.15,
  },
  curious: {
    speed: 650,
    acceleration: 2900,
    braking: 3900,
    turnRate: 8,
    turnResponse: 13,
    eyeResponse: 16,
    stepTime: 0.17,
    stepDrift: 29,
    stepRest: 0.025,
    stepLift: 20,
    stanceX: [87, 127, 119, 82],
    stanceY: [-98, -32, 52, 112],
    upper: 91,
    lower: 104,
    torso: 1,
    headWidth: 9.5,
    eyeSize: 2.65,
  },
  feral: {
    speed: 1150,
    acceleration: 8200,
    braking: 10000,
    turnRate: 17,
    turnResponse: 25,
    eyeResponse: 29,
    stepTime: 0.095,
    stepDrift: 18,
    stepRest: 0.012,
    stepLift: 12,
    stanceX: [61, 99, 94, 65],
    stanceY: [-79, -25, 43, 93],
    upper: 74,
    lower: 87,
    torso: 0.82,
    headWidth: 11.5,
    eyeSize: 3.35,
  },
};
const COLORS = [
  '#68f9df',
  '#9bff7b',
  '#66e8ff',
  '#dc8fff',
  '#6fffee',
  '#60d7ff',
  '#d6ff80',
  '#f28eff',
];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

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
  private crouch = 0;
  private alert = 0;
  private attention: Point = { x: 0, y: 0 };
  private burstAge = 0;
  private burstCount = 0;
  private holding = false;
  private gestureAge = 0;
  private gestureLeg = -1;
  private gaitStep = 0;
  private headAngle = 0;
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
  /** The exact articulated emitter used by the beam and the head renderer. */
  get headPosition(): Point {
    return this.toWorld(this.headLocal());
  }

  private get profile(): MotionProfile {
    return PROFILES[this.options.personality];
  }

  private toWorld(point: Point): Point {
    const x = point.x * this.scale;
    const y = point.y * this.scale;
    return {
      x: this.body.x + x * Math.cos(this.angle) - y * Math.sin(this.angle),
      y: this.body.y + this.bodyOffset() + x * Math.sin(this.angle) + y * Math.cos(this.angle),
    };
  }

  private headLocal(): Point {
    const neck = -13 * this.profile.torso;
    return {
      x: this.look.x * 0.46 + Math.sin(this.headAngle) * 7,
      y: neck + this.look.y * 0.22 - Math.cos(this.headAngle) * 7,
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
    // A suspended tab must never turn integration into an enormous leap.
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.04);
    const wasInitialized = this.initialized;
    const wasQuiet = this.options.reducedMotion;
    this.options = opts;
    this.clock = opts.reducedMotion ? 0 : time;
    const profile = this.profile;
    const intensity = clamp(opts.intensity, 0, 1);
    const feral = opts.personality === 'feral';
    const dreamy = opts.personality === 'dreamy';
    const previousDestination = { ...this.destination };
    this.destination.x = clamp(target.x, 35, Math.max(35, this.width - 35));
    this.destination.y = clamp(target.y, 45, Math.max(45, this.height - 45));
    const selector = opts.selector;
    const lookAt =
      opts.attention ??
      (selector
        ? {
            x: selector.rect.x + selector.rect.width / 2,
            y: selector.rect.y + selector.rect.height / 2,
          }
        : (opts.grip?.point ?? opts.pointer ?? this.destination));
    if (!this.initialized) {
      this.initialized = true;
      this.silkAnchor = this.destination.x;
      this.body.x = this.destination.x;
      this.body.y = opts.reducedMotion ? this.destination.y : -100;
      Object.assign(this.attention, lookAt);
      this.legs.forEach((leg) => {
        const p = this.idealFoot(leg);
        Object.assign(leg.foot, p);
        Object.assign(leg.to, p);
        Object.assign(leg.from, p);
      });
    }
    let surfaceVX = 0;
    let surfaceVY = 0;
    if (wasInitialized && opts.surfaceDelta) {
      const dx = Number.isFinite(opts.surfaceDelta.x) ? opts.surfaceDelta.x : 0;
      const dy = Number.isFinite(opts.surfaceDelta.y) ? opts.surfaceDelta.y : 0;
      const supportLimit = Math.max(240, Math.min(this.width, this.height) * 0.65);
      const beyondFrozenSupport =
        dt === 0 &&
        (dx !== 0 || dy !== 0) &&
        this.legs.some(
          (leg, i) =>
            i !== this.gripLeg &&
            Math.hypot(leg.foot.x + dx - this.body.x, leg.foot.y + dy - this.body.y) > supportLimit,
        );
      const discontinuity = Math.hypot(dx, dy) > supportLimit || beyondFrozenSupport;
      if (!discontinuity && dt > 0) {
        surfaceVX = dx / dt;
        surfaceVY = dy / dt;
      }
      // Contacts follow ordinary page movement. A page jump establishes a new support surface.
      for (const leg of this.legs) {
        const rebase = discontinuity ? this.idealFoot(leg) : undefined;
        for (const point of [leg.foot, leg.from, leg.to]) {
          if (rebase) Object.assign(point, rebase);
          else {
            point.x += dx;
            point.y += dy;
          }
        }
        if (discontinuity) {
          leg.stepping = false;
          leg.progress = 1;
          leg.lift = 0;
        }
      }
      if (discontinuity) Object.assign(this.gripFrom, this.legs[this.gripLeg]?.foot ?? this.body);
      else {
        this.gripFrom.x += dx;
        this.gripFrom.y += dy;
      }
    }
    // A captured point is already in current viewport coordinates, including any scroll.
    if (this.gripCaptured && this.gripLeg >= 0 && opts.grip) {
      Object.assign(this.legs[this.gripLeg]!.foot, opts.grip.point);
    }
    this.age += dt;
    if (opts.reducedMotion) {
      // Quiet geometry can follow the surface, but has no integration or contact animation.
      const quietDX = this.destination.x - this.body.x;
      const quietDY = this.destination.y - this.body.y;
      Object.assign(this.body, this.destination);
      this.velocity.x = this.velocity.y = this.angle = this.headAngle = 0;
      this.suspension = this.crouch = this.alert = this.silkAmount = 0;
      this.look.x = this.look.y = 0;
      this.gripLeg = this.gestureLeg = -1;
      this.gripCaptured = false;
      this.holding = false;
      this.burstAge = this.gestureAge = 0;
      for (const leg of this.legs) {
        if (!wasInitialized || !wasQuiet) {
          const pose = this.idealFoot(leg);
          Object.assign(leg.foot, pose);
          Object.assign(leg.from, pose);
          Object.assign(leg.to, pose);
        } else {
          // Preserve prior surface movement across quiet RAFs; resize may move the whole pose.
          for (const point of [leg.foot, leg.from, leg.to]) {
            point.x += quietDX;
            point.y += quietDY;
          }
        }
        leg.stepping = false;
        leg.lift = 0;
      }
      return;
    }
    // Paused geometry refreshes must not schedule a step or advance any pose state.
    if (dt === 0) return;

    const entering = this.age < 1.45;
    this.silkAmount = entering || opts.descending ? 1 : Math.max(0, this.silkAmount - dt * 2.6);
    const changed =
      distance(previousDestination, this.destination) > 16 || distance(this.attention, lookAt) > 20;
    Object.assign(this.attention, lookAt);
    if (changed) {
      // A new hover cancels a hold immediately; the target always wins over idle business.
      this.alert = 1;
      this.holding = false;
      this.burstAge = 0;
      this.gestureAge = 0;
    } else this.alert = Math.max(0, this.alert - dt * (feral ? 3.5 : 1.6));

    const enterProgress = smooth(clamp(this.age / 1.45, 0, 1));
    const desiredY = entering ? mix(-100, this.destination.y, enterProgress) : this.destination.y;
    const dx = this.destination.x - this.body.x;
    const dy = desiredY - this.body.y;
    const remaining = Math.hypot(dx, dy);
    this.burstAge += dt;
    if (feral && !entering && !opts.grip && remaining > 30) {
      const duration = this.holding
        ? 0.032 + ((this.burstCount * 7) % 4) * 0.008
        : 0.24 + ((this.burstCount * 5) % 4) * 0.03;
      if (this.burstAge >= duration) {
        this.holding = !this.holding;
        this.burstAge = 0;
        if (!this.holding) this.burstCount++;
      }
    } else this.holding = false;

    const urgency = opts.pursuing ? 1.12 : 1;
    const maxSpeed = profile.speed * (0.84 + intensity * 0.24) * urgency;
    const approach = dreamy ? 5 : feral ? 17 : 10;
    let wantedSpeed = Math.min(
      maxSpeed,
      Math.sqrt(2 * profile.braking * remaining),
      remaining * approach,
    );
    if (this.holding) wantedSpeed = 0;
    if (entering) wantedSpeed = Math.min(wantedSpeed, 700);
    const desiredVX = remaining > 0.05 ? (dx / remaining) * wantedSpeed : 0;
    const desiredVY = remaining > 0.05 ? (dy / remaining) * wantedSpeed : 0;
    const deltaX = desiredVX - this.velocity.x;
    const deltaY = desiredVY - this.velocity.y;
    const deltaSpeed = Math.hypot(deltaX, deltaY);
    const braking = this.velocity.x * deltaX + this.velocity.y * deltaY < 0;
    const acceleration =
      (braking ? profile.braking * (this.holding ? 3.2 : 1) : profile.acceleration) * urgency;
    const velocityMix = deltaSpeed > 0 ? Math.min(1, (acceleration * dt) / deltaSpeed) : 1;
    this.velocity.x += deltaX * velocityMix;
    this.velocity.y += deltaY * velocityMix;
    this.body.x += this.velocity.x * dt;
    this.body.y += this.velocity.y * dt;
    const walkingVX = this.velocity.x - surfaceVX;
    const walkingVY = this.velocity.y - surfaceVY;
    const speed = Math.hypot(walkingVX, walkingVY);

    const lookDX = lookAt.x - this.body.x;
    const lookDY = lookAt.y - this.body.y;
    const lookDistance = Math.max(1, Math.hypot(lookDX, lookDY));
    const heading = lookDistance > 12 ? Math.atan2(lookDX, -lookDY) : this.angle;
    const turn = angleDelta(heading, this.angle);
    const turnStep = clamp(
      turn * (1 - Math.exp(-dt * profile.turnResponse)),
      -profile.turnRate * dt,
      profile.turnRate * dt,
    );
    this.angle = angleDelta(this.angle + turnStep, 0);
    const localLookX =
      (lookDX * Math.cos(this.angle) + lookDY * Math.sin(this.angle)) / lookDistance;
    const localLookY =
      (-lookDX * Math.sin(this.angle) + lookDY * Math.cos(this.angle)) / lookDistance;
    const eyeMix = 1 - Math.exp(-dt * profile.eyeResponse);
    this.look.x = mix(this.look.x, localLookX * 4, eyeMix);
    this.look.y = mix(this.look.y, localLookY * 4, eyeMix);
    this.headAngle = mix(
      this.headAngle,
      clamp(angleDelta(heading, this.angle), -0.48, 0.48),
      eyeMix,
    );
    const compression = feral
      ? this.holding
        ? 1
        : 0.16 + this.alert * 0.45
      : dreamy
        ? -0.2
        : this.alert * 0.25;
    this.crouch = mix(this.crouch, compression, 1 - Math.exp(-dt * (feral ? 24 : 8)));

    // Keep a grip on its original limb until release, even across a sharp body pivot.
    const contactLocalX = opts.grip
      ? (opts.grip.point.x - this.body.x) * Math.cos(this.angle) +
        (opts.grip.point.y - this.body.y) * Math.sin(this.angle)
      : 0;
    const nextGrip = opts.grip
      ? this.gripLeg >= 0
        ? this.gripLeg
        : contactLocalX < 0
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
        this.gripReach = Math.min(1, this.gripReach + dt / (feral ? 0.075 : dreamy ? 0.22 : 0.12));
        if (this.gripCaptured || this.gripReach === 1) {
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
        const hanging = opts.descending ? 0.8 : 1 - smooth(clamp((this.age - 0.55) / 0.8, 0, 1));
        ideal.x = mix(ideal.x, this.body.x + leg.side * (21 + leg.row * 10) * this.scale, hanging);
        ideal.y = mix(ideal.y, this.body.y + (61 + leg.row * 17) * this.scale, hanging);
        leg.foot.x = mix(leg.foot.x, ideal.x, 1 - Math.exp(-dt * 12));
        leg.foot.y = mix(leg.foot.y, ideal.y, 1 - Math.exp(-dt * 12));
        leg.stepping = false;
        leg.lift = 0;
        continue;
      }
      if (leg.stepping) {
        leg.progress = Math.min(1, leg.progress + dt / leg.duration);
        const t = smooth(leg.progress);
        const lift = Math.sin(Math.PI * leg.progress) ** 2;
        leg.lift = lift;
        // The swing arcs through local space; both endpoints stay fixed in page space.
        const arcSide = leg.side * lift * (feral ? 5 : dreamy ? 6 : 11) * this.scale;
        const arcForward = -lift * profile.stepLift * this.scale;
        leg.foot.x =
          mix(leg.from.x, leg.to.x, t) +
          arcSide * Math.cos(this.angle) -
          arcForward * Math.sin(this.angle);
        leg.foot.y =
          mix(leg.from.y, leg.to.y, t) +
          arcSide * Math.sin(this.angle) +
          arcForward * Math.cos(this.angle);
        if (leg.progress >= 1) {
          // Exact contact assignment, never velocity-driven dragging of a planted foot.
          Object.assign(leg.foot, leg.to);
          leg.stepping = false;
          leg.rested = 0;
          leg.lift = 0;
          movingFeet--;
          if (this.gestureLeg === i) this.gestureLeg = -1;
        }
      }
    }

    if (!entering && !opts.descending) {
      const budget =
        (speed > (feral ? 130 : 240) ? 4 : dreamy ? 2 : 3) - (this.gripLeg >= 0 ? 1 : 0);
      this.gestureAge += dt;
      // An occasional single front-foot feeler is an articulated gesture, not a body wander.
      const gestureInterval = feral
        ? 0.4 + (this.gaitStep % 3) * 0.09
        : dreamy
          ? 3.4
          : 1.05 + (this.gaitStep % 3) * 0.17;
      const gesture =
        speed < 22 && remaining < 30 && this.gestureAge > gestureInterval && this.gripLeg < 0;
      while (movingFeet < budget) {
        let next = -1;
        let best = -Infinity;
        for (let i = 0; i < this.legs.length; i++) {
          const leg = this.legs[i]!;
          if (i === this.gripLeg || leg.stepping || leg.rested <= profile.stepRest) continue;
          const drift = distance(leg.foot, leg.ideal);
          const needsStep = drift > profile.stepDrift * this.scale;
          const adjustment = leg.rested > (dreamy ? 3.5 : 1.7) + ((i * 0.71) % 2.3) && drift > 6;
          const feeler = gesture && this.gestureLeg < 0 && i === (this.gaitStep % 2 ? 0 : 4);
          if (!needsStep && !adjustment && !feeler) continue;
          let sameSideMoving = 0;
          for (const other of this.legs) {
            if (other.side === leg.side && (other.stepping || other === this.legs[this.gripLeg]))
              sameSideMoving++;
          }
          if (sameSideMoving >= 2) continue;
          const opposite = this.lastStep >= 0 && this.legs[this.lastStep]!.side !== leg.side;
          // Alternating diagonal contacts supply rhythm without locking every limb in phase.
          const diagonal = (leg.row + (leg.side > 0 ? 1 : 0)) % 2 === this.gaitStep % 2;
          const score =
            drift +
            Math.min(leg.rested, 3) * 2 +
            (opposite ? 9 : 0) +
            (diagonal ? 6 : 0) +
            (feeler ? 20 : 0);
          if (score > best) {
            next = i;
            best = score;
          }
        }
        if (next < 0) break;
        const leg = this.legs[next]!;
        const feeler =
          gesture &&
          this.gestureLeg < 0 &&
          leg.row === 0 &&
          distance(leg.foot, leg.ideal) < profile.stepDrift * this.scale;
        Object.assign(leg.from, leg.foot);
        const lead = profile.stepTime * (feral ? 0.9 : 0.75);
        leg.to.x = leg.ideal.x + walkingVX * lead;
        leg.to.y = leg.ideal.y + walkingVY * lead;
        leg.duration =
          profile.stepTime * (1.1 - intensity * 0.18 + ((next + this.gaitStep) % 3) * 0.055);
        if (feeler) {
          this.gestureLeg = next;
          this.gestureAge = 0;
          leg.duration *= dreamy ? 1.65 : 1.35;
          const reach = (feral ? 14 : 19) * this.scale * (this.gaitStep % 2 ? -0.65 : 1);
          leg.to.x += Math.sin(this.angle) * reach;
          leg.to.y -= Math.cos(this.angle) * reach;
        }
        leg.progress = 0;
        leg.stepping = true;
        this.lastStep = next;
        this.gaitStep++;
        movingFeet++;
      }
    }
    let liftLoad = 0;
    for (const leg of this.legs) liftLoad += leg.lift;
    this.suspension = mix(
      this.suspension,
      liftLoad * (feral ? 1.1 : dreamy ? 0.35 : 0.7),
      1 - Math.exp(-dt * (feral ? 26 : 12)),
    );
  }

  private idealFoot(leg: Leg): Point {
    const profile = this.profile;
    const asymmetry = leg.side === 1 ? [5, -6, 7, -8][leg.row]! : 0;
    const frontFold = leg.row === 0 ? this.crouch * 12 : 0;
    const localX = leg.side * (profile.stanceX[leg.row]! + asymmetry - frontFold) * this.scale;
    const localY = (profile.stanceY[leg.row]! + asymmetry * 0.35 + frontFold) * this.scale;
    leg.ideal.x = this.body.x + localX * Math.cos(this.angle) - localY * Math.sin(this.angle);
    leg.ideal.y = this.body.y + localX * Math.sin(this.angle) + localY * Math.cos(this.angle);
    return leg.ideal;
  }

  render(): void {
    const ctx = this.ctx;
    const s = this.scale;
    const profile = this.profile;
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
      const localHipX = leg.side * (leg.row === 0 ? 7 : 5) * s;
      const localHipY = (-10 + leg.row * 7) * profile.torso * s;
      leg.hip.x = this.body.x + localHipX * torsoCos - localHipY * torsoSin;
      leg.hip.y = this.body.y + offset + localHipX * torsoSin + localHipY * torsoCos;
      const ankleX = -leg.side * (6 - leg.lift * 2) * s;
      const ankleY = -(gripping ? 7 : 9 - leg.lift * 3) * s;
      leg.ankle.x = leg.foot.x + ankleX * torsoCos - ankleY * torsoSin;
      leg.ankle.y = leg.foot.y + ankleX * torsoSin + ankleY * torsoCos;
      const dx = leg.ankle.x - leg.hip.x;
      const dy = leg.ankle.y - leg.hip.y;
      const actual = Math.max(0.01, Math.hypot(dx, dy));
      // Extend long reaches without snapping or changing the planted contact.
      const fold = 1 - this.crouch * 0.055 + leg.lift * 0.035;
      const upper = Math.max((profile.upper + (leg.row % 2) * 5) * fold * s, actual * 0.53);
      const lower = Math.max((profile.lower - leg.row * 2) * s, actual * 0.58);
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
    // A short faceted chassis leaves the angular wire limbs in charge of the silhouette.
    const torso = profile.torso;
    const abdomen = 8.5 + (this.options.personality === 'feral' ? 1 : 0);
    ctx.fillStyle = 'rgba(5, 13, 24, 0.96)';
    ctx.strokeStyle = '#79f5df';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(-5, -6 * torso);
    ctx.lineTo(6, -7 * torso);
    ctx.lineTo(abdomen, 5 * torso);
    ctx.lineTo(5, 19 * torso);
    ctx.lineTo(-4, 22 * torso);
    ctx.lineTo(-abdomen, 9 * torso);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ee8dff';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(6, -7 * torso);
    ctx.lineTo(10, -3 * torso);
    ctx.lineTo(12, 8 * torso);
    ctx.lineTo(7, 21 * torso);
    ctx.lineTo(-4, 22 * torso);
    ctx.moveTo(abdomen, 5 * torso);
    ctx.lineTo(12, 8 * torso);
    ctx.moveTo(5, 19 * torso);
    ctx.lineTo(7, 21 * torso);
    ctx.stroke();
    ctx.strokeStyle = '#61b8c6';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(-5, -6 * torso);
    ctx.lineTo(2, 3 * torso);
    ctx.lineTo(-4, 22 * torso);
    ctx.moveTo(-abdomen, 9 * torso);
    ctx.lineTo(2, 3 * torso);
    ctx.lineTo(abdomen, 5 * torso);
    ctx.stroke();
    ctx.fillStyle = '#ec99ff';
    this.dot(2, 3 * torso, 1.3);
    ctx.fillStyle = '#c9ffaf';
    this.dot(-1, 15 * torso, 0.9);

    // The neck gimbal follows new attention before the planted body completes its pivot.
    ctx.save();
    ctx.translate(this.look.x * 0.46, -13 * torso + this.look.y * 0.22);
    ctx.rotate(this.headAngle);
    const headWidth = profile.headWidth;
    const headColor = this.options.selector?.color ?? '#8affec';
    ctx.fillStyle = '#070f20';
    ctx.strokeStyle = '#88f9e6';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-headWidth, -5);
    ctx.lineTo(-headWidth + 3, -10);
    ctx.lineTo(headWidth - 3, -10);
    ctx.lineTo(headWidth, -5);
    ctx.lineTo(headWidth - 1, 5);
    ctx.lineTo(0, 8);
    ctx.lineTo(-headWidth + 1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#bfff86';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(-headWidth, -5);
    ctx.lineTo(-headWidth - 2, 2);
    ctx.lineTo(-headWidth + 1, 5);
    ctx.moveTo(headWidth, -5);
    ctx.lineTo(headWidth + 2, 2);
    ctx.lineTo(headWidth - 1, 5);
    ctx.moveTo(-headWidth + 1, 5);
    ctx.lineTo(headWidth - 1, 5);
    ctx.stroke();

    // Two forward optical lenses and small lateral eyes give a watchful, compact face.
    for (const side of [-1, 1]) {
      const eyeX = side * (profile.eyeSize + 1.15);
      ctx.fillStyle = '#071324';
      this.dot(eyeX, -3.1, profile.eyeSize + 1.05);
      ctx.fillStyle = '#d9ffff';
      this.dot(eyeX, -3.1, profile.eyeSize);
      ctx.fillStyle = '#0a3c48';
      this.dot(eyeX + this.look.x * 0.16, -3.6 + this.look.y * 0.08, profile.eyeSize * 0.5);
      ctx.fillStyle = '#ffffff';
      this.dot(eyeX - 0.5, -4.2, profile.eyeSize * 0.24);
      ctx.fillStyle = '#87f9d6';
      this.dot(side * (headWidth - 0.5), 0.8, this.options.personality === 'feral' ? 1.35 : 1);
    }
    // Jointed palps move with attention and scuttle compression, without moving contacts.
    for (const side of [-1, 1]) {
      const lively = this.options.personality === 'feral';
      const rhythm = this.options.reducedMotion
        ? 0
        : Math.sin(
            this.clock * (lively ? 8.5 : this.options.personality === 'dreamy' ? 1.5 : 3.5) +
              side * 1.7,
          );
      const pinch = rhythm * (lively ? 2.2 : 1.3) + this.alert * 1.5;
      const start = { x: side * (headWidth - 2), y: -5 };
      const elbow = { x: side * (headWidth + 5 - this.crouch * 2), y: -13 + pinch };
      const tip = { x: side * (headWidth - 1 + pinch), y: -19 + this.crouch * 4 };
      ctx.strokeStyle = '#05101d';
      ctx.lineWidth = 3.1;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.strokeStyle = side < 0 ? '#90ffcd' : '#e59fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#edffff';
      this.dot(elbow.x, elbow.y, 0.9);
      this.dot(tip.x, tip.y, 0.75);
    }
    ctx.fillStyle = headColor;
    ctx.shadowColor = headColor;
    ctx.shadowBlur = this.options.selector && !this.options.reducedMotion ? 4 : 0;
    this.dot(0, -7, this.options.selector ? 1.55 : 1.1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f7ffff';
    this.dot(0, -7, 0.55);
    ctx.restore();
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
    const dreamy = this.options.personality === 'dreamy';
    const feral = this.options.personality === 'feral';
    const breath = Math.sin(this.clock * (dreamy ? 1.6 : 2.5)) * (dreamy ? 1.2 : 0.35);
    // Springy scuttle elevation is small; support feet remain planted throughout.
    return (breath + this.crouch * (feral ? 3.6 : 1.8) - this.suspension) * this.scale;
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
