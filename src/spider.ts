/** Original procedural, planted-foot spider. All positions are viewport CSS pixels. */
export interface Point {
  x: number;
  y: number;
}
/** Cached viewport geometry only; the rig never holds DOM nodes or reads layout. */
export interface PageSurface {
  id: string;
  kind: 'text' | 'card' | 'image' | 'button';
  a: Point;
  b: Point;
  min: number;
  max: number;
  blocked?: readonly number[];
}
interface Contact {
  id: string;
  fraction: number;
}
export interface SpiderOptions {
  intensity: number;
  personality: 'curious' | 'feral' | 'dreamy';
  reducedMotion: boolean;
  /** Decorative budget only; never changes the skeleton, input or targeting. */
  quality?: number;
  grip?: { point: Point; progress: number; color: string };
  selector?: {
    rect: { x: number; y: number; width: number; height: number };
    progress: number;
    phase: 'scan' | 'lock' | 'prepare' | 'strike' | 'settle';
    aim?: Point;
    color: string;
  };
  surface?: 'light' | 'dark';
  descending?: boolean;
  pointer?: Point;
  /** Immediate hover attention can change while a captured strike finishes. */
  attention?: Point;
  pursuing?: boolean;
  /** Filtered real input speed in CSS px/s; never raises temperament limits. */
  pursuitSpeed?: number;
  /** Page movement in viewport pixels; consume each scroll delta exactly once. */
  surfaceDelta?: Point;
  /** Includes native/nested motion even while all page contacts are detached. */
  pageMoving?: boolean;
  surfaces?: readonly PageSurface[];
  /** The engine grants idle time only between hunts and real input. */
  idle?: boolean;
}

type IdleAction = 'probe' | 'groom' | 'orient' | 'crouch' | 'reposition' | 'sway' | 'tend';
const IDLE_ACTIONS: Record<SpiderOptions['personality'], readonly [IdleAction, number, number][]> =
  {
    curious: [
      ['probe', 5, 2.8],
      ['groom', 2, 2.4],
    ],
    feral: [
      ['orient', 5, 0.85],
      ['crouch', 3, 0.7],
      ['reposition', 2, 1.05],
    ],
    dreamy: [
      ['sway', 4, 3.6],
      ['reposition', 3, 2.8],
      ['tend', 3, 3.4],
    ],
  };

/** One logical clock, one weighted action, bounded cooldowns; no timers. */
export class IdleScheduler {
  private randomState: number;
  private now = 0;
  private wait = 0;
  private cooldowns = new Map<IdleAction, number>();
  private previous: IdleAction | null = null;
  action: { kind: IdleAction; elapsed: number; duration: number } | null = null;

  constructor(private readonly seed = Math.floor(Math.random() * 0xffffffff)) {
    this.randomState = seed >>> 0;
    this.reset();
  }
  private random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  reset() {
    this.randomState = this.seed >>> 0;
    this.now = 0;
    this.cooldowns.clear();
    this.previous = null;
    this.action = null;
    this.wait = 3.5 + this.random() * 1.5;
  }
  interrupt() {
    this.action = null;
    this.wait = Math.max(this.wait, 3.5);
  }
  update(dt: number, personality: SpiderOptions['personality'], ready: boolean) {
    if (dt <= 0) return this.action;
    this.now += dt;
    if (!ready) {
      this.interrupt();
      return null;
    }
    if (this.action) {
      this.action.elapsed = Math.min(this.action.duration, this.action.elapsed + dt);
      if (this.action.elapsed < this.action.duration) return this.action;
      this.action = null;
      this.wait = 3.5 + this.random() * 2.9;
      return null;
    }
    this.wait = Math.max(0, this.wait - dt);
    if (this.wait > 0) return null;
    const choices = IDLE_ACTIONS[personality].filter(
      ([kind]) => (this.cooldowns.get(kind) ?? 0) <= this.now && kind !== this.previous,
    );
    if (!choices.length) {
      this.wait = 1;
      return null;
    }
    let pick = this.random() * choices.reduce((sum, [, weight]) => sum + weight, 0);
    const [kind, , duration] = choices.find(([, weight]) => (pick -= weight) < 0) ?? choices[0]!;
    this.previous = kind;
    this.cooldowns.set(kind, this.now + (kind === 'groom' || kind === 'tend' ? 18 : 8));
    return (this.action = { kind, duration, elapsed: 0 });
  }
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
  contact?: Contact;
  landing?: Contact;
  released?: boolean;
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
    stanceX: [70, 101, 97, 69],
    stanceY: [-74, -24, 45, 84],
    upper: 79,
    lower: 92,
    torso: 1.14,
    headWidth: 9,
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
    stanceX: [38, 60, 58, 39],
    stanceY: [-52, -17, 29, 59],
    upper: 47,
    lower: 59,
    torso: 0.82,
    headWidth: 12.5,
    eyeSize: 4.2,
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
  private readonly idleScheduler: IdleScheduler;
  private idleGesture: {
    kind: IdleAction;
    leg: number;
    from: Point;
    to: Point;
    home?: Contact;
    edge?: Contact;
    angle: number;
    turn: number;
  } | null = null;
  private idleSway = 0;
  private idlePalps = 0;
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
  private weightShift: Point = { x: 0, y: 0 };
  private lean: Point = { x: 0, y: 0 };
  private gaitStep = 0;
  private stepCooldown = 0;
  private headAngle = 0;
  private recovery: {
    reason: 'scroll' | 'hunt';
    elapsed: number;
    from: Point;
    to: Point;
    feet: Point[];
    goal: Point;
    edge?: Point;
    angle: number;
    anticipation: number;
    flight: number;
    landing: number;
    support?: { leg: number; contact: Contact; point?: Point; released?: boolean };
  } | null = null;
  private hopHeight = 0;
  private hopCooldown = 0;
  private recoveries = 0;
  private scrollRecoveryArmed = true;
  private scrollQuiet = 0;
  private releasedContacts = 0;
  private silkAnchor = 0;
  private silkAmount = 1;
  private silkOrigin: Point | null = null;
  private surfaceIndex = new Map<string, PageSurface>();
  private surfaceSnapshot: readonly PageSurface[] | undefined;
  private surfaceReleases = 0;
  private pageMovement = 'fallback';
  private options: SpiderOptions = { intensity: 0.6, personality: 'curious', reducedMotion: false };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    idleSeed?: number,
  ) {
    this.idleScheduler = new IdleScheduler(idleSeed);
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
    if (this.initialized) this.interruptIdle();
    const previousScale = this.scale;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = clamp(dpr, 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.scale = clamp(Math.min(this.width, this.height) / 700, 0.57, 1.12);
    if (this.initialized && previousScale !== this.scale) {
      // Viewport rescaling changes the rig's physical size, including every contact endpoint.
      const ratio = this.scale / previousScale;
      for (const l of this.legs)
        for (const p of [l.foot, l.from, l.to]) {
          p.x = this.body.x + (p.x - this.body.x) * ratio;
          p.y = this.body.y + (p.y - this.body.y) * ratio;
        }
      if (this.recovery) {
        if (this.recovery.reason === 'hunt') this.recover(this.body, true);
        else {
          this.recovery.feet = this.recovery.feet.map((p) => ({ x: p.x * ratio, y: p.y * ratio }));
          this.recovery.to = this.safeLanding(this.recovery.to);
          this.recovery.goal = this.safeLanding(this.recovery.goal);
        }
      }
      if (this.legs.some((l) => !this.withinReach(l.foot))) this.resetStance();
    }
  }

  get position(): Point {
    return { ...this.body };
  }
  get feet(): Point[] {
    return this.legs.map((leg) => ({ ...leg.foot }));
  }
  get contactIds(): string[] {
    const ids = this.legs.flatMap((l) =>
      [l.contact?.id, l.landing?.id].filter((id): id is string => !!id),
    );
    for (const c of [this.idleGesture?.home, this.idleGesture?.edge]) if (c) ids.push(c.id);
    return ids;
  }
  get surfaceContacts(): Contact[] {
    return [
      ...this.legs.flatMap((l) => [l.contact, l.landing].filter((c): c is Contact => !!c)),
      ...[this.idleGesture?.home, this.idleGesture?.edge].filter((c): c is Contact => !!c),
    ];
  }
  get recovering(): boolean {
    return !!this.recovery;
  }
  get recoveryLanding(): Point | null {
    return this.recovery ? { ...this.recovery.goal } : null;
  }
  /** Retarget a detached entrance without changing its clock or route origin. */
  retargetRecovery(anchor: Point): void {
    const r = this.recovery;
    if (!r || r.reason !== 'scroll' || r.elapsed > r.anticipation + r.flight) return;
    r.goal = this.safeLanding(anchor);
  }
  get recoveryMargin(): number {
    return Math.min(this.reachLimit + 12, this.width * 0.25, this.height * 0.25);
  }
  private safeLanding(anchor: Point): Point {
    const margin = this.recoveryMargin;
    return {
      x: clamp(anchor.x, margin, this.width - margin),
      y: clamp(anchor.y, margin, Math.max(margin, this.height - margin - 45)),
    };
  }
  get recoveryReason(): 'scroll' | 'hunt' | '' {
    return this.recovery?.reason ?? '';
  }
  get recoveryPhase(): 'none' | 'anticipate' | 'flight' | 'land' {
    const r = this.recovery;
    return !r
      ? 'none'
      : r.elapsed < r.anticipation
        ? 'anticipate'
        : r.elapsed < r.anticipation + r.flight
          ? 'flight'
          : 'land';
  }
  /** Public geometry evidence; no page text or identifiers. */
  get diagnostics() {
    return {
      type:
        this.options.personality === 'feral'
          ? 'jumping spider'
          : this.options.personality === 'dreamy'
            ? 'orb-weaver'
            : 'widow',
      recovery: this.recoveryPhase,
      reason: this.recoveryReason,
      recoveries: this.recoveries,
      entrance: this.recovery?.reason === 'scroll' ? this.options.personality : null,
      recoveryElapsed: this.recovery?.elapsed ?? 0,
      recoveryDuration: this.recovery
        ? this.recovery.anticipation + this.recovery.flight + this.recovery.landing
        : 0,
      recoveryLanding: this.recoveryLanding,
      recoveryArmed: this.scrollRecoveryArmed,
      thread: this.silkAmount,
      rotation: this.angle,
      releasedContacts: this.releasedContacts,
      surfaceReleases: this.surfaceReleases,
      pageMovement: this.pageMovement,
      idle: this.idleScheduler.action ? { ...this.idleScheduler.action } : null,
      maxReach: Math.max(...this.feet.map((p) => distance(p, this.body))),
      reachLimit: this.reachLimit,
      body: this.position,
      feet: this.feet,
      knees: this.legs.map((l) => ({ ...l.knee })),
      legs: this.legs.map((l, i) => ({
        phase: this.recovery
          ? this.recoveryPhase
          : i === this.gripLeg
            ? 'grip'
            : l.stepping
              ? 'swing'
              : 'stance',
        role: l.row === 0 ? 'reach' : l.row === 3 ? 'push' : 'support',
        lift: l.lift,
        contact: l.contact
          ? { ...l.contact, kind: this.surfaceIndex.get(l.contact.id)?.kind }
          : null,
        landing: l.landing ? { ...l.landing } : null,
      })),
      maxBoneLength: Math.max(
        ...this.legs.flatMap((l) => [distance(l.hip, l.knee), distance(l.knee, l.ankle)]),
      ),
      boneLimit: Math.max(this.profile.upper + 5, this.profile.lower) * 1.04 * this.scale,
      finite: [this.body, ...this.feet, ...this.legs.map((l) => l.knee)].every(
        (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
      ),
    };
  }
  /** Conservative contact radius leaves room for hips, ankle and body elevation. */
  private get reachLimit(): number {
    return (this.profile.upper + this.profile.lower - 28) * this.scale;
  }
  private withinReach(p: Point): boolean {
    return (
      Number.isFinite(p.x) && Number.isFinite(p.y) && distance(p, this.body) <= this.reachLimit
    );
  }
  private bounded(p: Point, radius = this.reachLimit): Point {
    const dx = p.x - this.body.x,
      dy = p.y - this.body.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length)) return { ...this.body };
    const t = length > radius ? radius / length : 1;
    return { x: this.body.x + dx * t, y: this.body.y + dy * t };
  }
  needsRecovery(delta: Point = { x: 0, y: 0 }, surfaces?: readonly PageSurface[]): boolean {
    if (!this.initialized || this.recovery || !this.scrollRecoveryArmed) return false;
    const outside =
      this.age > 1.5 &&
      (this.body.x < 25 ||
        this.body.x > this.width - 25 ||
        this.body.y < 30 ||
        this.body.y > this.height - 30);
    const moved = Math.hypot(delta.x, delta.y);
    const index =
      surfaces && surfaces !== this.surfaceSnapshot
        ? new Map(surfaces.map((s) => [s.id, s]))
        : this.surfaceIndex;
    let attached = 0;
    let invalid = 0;
    const threatened = this.legs.filter((l) => {
      const contact = l.contact ?? l.landing;
      const surface = contact && index.get(contact.id);
      if (contact && surface) {
        attached++;
        const unusable =
          surface.blocked?.some((f) => Math.abs(f - contact.fraction) < 0.001) ||
          contact.fraction < surface.min ||
          contact.fraction > surface.max ||
          distance(
            {
              x: mix(surface.a.x, surface.b.x, contact.fraction),
              y: mix(surface.a.y, surface.b.y, contact.fraction),
            },
            this.body,
          ) > this.reachLimit;
        if (unusable) invalid++;
        return unusable;
      }
      if (contact) invalid++;
      return (
        distance({ x: l.foot.x + delta.x, y: l.foot.y + delta.y }, this.body) > this.reachLimit
      );
    }).length;
    return (
      outside ||
      invalid >= 4 ||
      (moved > this.reachLimit * 0.42 && (attached < 4 || threatened >= 4)) ||
      (moved > this.reachLimit * 0.2 && threatened >= 4)
    );
  }
  /** Release contacts before any page delta can turn into an impossible reach. */
  recover(
    anchor: Point,
    calm = false,
    reason: 'scroll' | 'hunt' = 'scroll',
    support?: { leg: number; contact: Contact },
  ): void {
    if (this.recovery && !calm) return;
    this.interruptIdle();
    if (reason === 'scroll')
      this.options = { ...this.options, grip: undefined, selector: undefined };
    const to =
      reason === 'scroll'
        ? this.safeLanding(anchor)
        : {
            x: clamp(anchor.x, 65, Math.max(65, this.width - 65)),
            y: clamp(anchor.y, 95, Math.max(95, this.height - 115)),
          };
    this.gripLeg = -1;
    this.weightShift = { x: 0, y: 0 };
    this.lean = { x: 0, y: 0 };
    this.gripCaptured = false;
    this.velocity.x = this.velocity.y = 0;
    this.holding = false;
    this.silkAmount = 0;
    this.silkOrigin = null;
    this.releasedContacts += 8;
    if (calm) {
      this.recovery = null;
      this.hopHeight = this.crouch = this.suspension = 0;
      Object.assign(this.body, to);
      this.resetStance();
      return;
    }
    if (reason === 'scroll') {
      this.scrollRecoveryArmed = false;
      this.scrollQuiet = 0;
    }
    const feral = this.options.personality === 'feral';
    const dreamy = this.options.personality === 'dreamy';
    this.recoveries++;
    this.recovery = {
      reason,
      elapsed: 0,
      from: { ...this.body },
      to,
      goal: { ...to },
      angle: this.angle,
      edge: reason === 'scroll' && !feral ? this.returnEdge(to) : undefined,
      feet: this.feet.map((p) => {
        const b = this.bounded(p);
        return { x: b.x - this.body.x, y: b.y - this.body.y };
      }),
      anticipation: feral
        ? reason === 'scroll'
          ? 0.065
          : 0.055
        : reason === 'scroll'
          ? 0.16
          : dreamy
            ? 0.13
            : 0.09,
      flight: feral
        ? reason === 'scroll'
          ? 0.22
          : 0.16
        : reason === 'scroll'
          ? dreamy
            ? 0.42
            : 0.32
          : dreamy
            ? 0.34
            : 0.25,
      landing: feral
        ? reason === 'scroll'
          ? 0.1
          : 0.085
        : reason === 'scroll'
          ? dreamy
            ? 0.2
            : 0.16
          : dreamy
            ? 0.17
            : 0.12,
      support,
    };
    this.legs.forEach((l, i) => {
      if (reason === 'scroll' && (l.contact || l.landing)) this.surfaceReleases++;
      l.contact = l.landing = undefined;
      if (support?.leg === i) l.landing = support.contact;
      l.stepping = false;
      l.lift = 0;
    });
  }
  /** Exit through a nearby top/side edge; the return always descends from above. */
  private returnEdge(to: Point): Point {
    const b = this.body,
      outside = this.reachLimit + 30;
    if (b.y <= Math.min(b.x, this.width - b.x)) return { x: b.x, y: -outside };
    return {
      x: b.x < this.width / 2 ? -outside : this.width + outside,
      y: Math.min(b.y, to.y - 110),
    };
  }
  private resetStance(): void {
    this.legs.forEach((l) => {
      l.contact = l.landing = undefined;
      l.released = false;
      const p = this.bounded(this.idealFoot(l), this.reachLimit * 0.88);
      for (const q of [l.foot, l.from, l.to]) Object.assign(q, p);
      l.stepping = false;
      l.progress = 1;
      l.lift = 0;
      l.rested = l.row * 0.025;
    });
  }

  private contactPoint(contact: Contact, center: Point = this.body): Point | null {
    const surface = this.surfaceIndex.get(contact.id);
    if (
      !surface ||
      contact.fraction < surface.min ||
      contact.fraction > surface.max ||
      surface.blocked?.some((f) => Math.abs(f - contact.fraction) < 0.001)
    )
      return null;
    const p = {
      x: mix(surface.a.x, surface.b.x, contact.fraction),
      y: mix(surface.a.y, surface.b.y, contact.fraction),
    };
    return distance(p, center) <= this.reachLimit ? p : null;
  }

  private get contactSearch(): number {
    return Math.min(
      this.reachLimit * 0.3,
      (this.options.personality === 'dreamy'
        ? 43
        : this.options.personality === 'feral'
          ? 22
          : 36) * this.scale,
    );
  }

  private placement(point: Point, leg: Leg): { point: Point; contact?: Contact } {
    let best = this.contactSearch;
    let result: { point: Point; contact?: Contact } = { point };
    for (const surface of this.surfaceIndex.values()) {
      const dx = surface.b.x - surface.a.x,
        dy = surface.b.y - surface.a.y;
      const square = dx * dx + dy * dy;
      if (square < 1) continue;
      const fraction = clamp(
        ((point.x - surface.a.x) * dx + (point.y - surface.a.y) * dy) / square,
        surface.min,
        surface.max,
      );
      const p = { x: surface.a.x + dx * fraction, y: surface.a.y + dy * fraction };
      const gap = distance(point, p);
      if (gap >= best || distance(p, this.body) > this.reachLimit * 0.89) continue;
      if (surface.blocked?.some((f) => Math.abs(f - fraction) * Math.sqrt(square) < 8 * this.scale))
        continue;
      // Keep opposite limbs distinct, and don't keep replanting at an exhausted edge.
      if (
        this.legs.some(
          (other) =>
            other !== leg && distance(other.stepping ? other.to : other.foot, p) < 11 * this.scale,
        )
      )
        continue;
      if (distance(leg.foot, point) > this.contactSearch && distance(leg.foot, p) < 5 * this.scale)
        continue;
      best = gap;
      result = { point: p, contact: { id: surface.id, fraction } };
    }
    return result;
  }

  /** Only committed contacts follow their individual surfaces. Invalid geometry
   * starts a lift from the last valid point, never an impossible attachment. */
  private followSurfaces() {
    for (const leg of this.legs) {
      if (leg.contact) {
        const p = this.contactPoint(leg.contact);
        if (p) Object.assign(leg.foot, p);
        else {
          leg.contact = undefined;
          leg.released = true;
          this.surfaceReleases++;
        }
      }
      if (leg.landing) {
        const p = this.contactPoint(leg.landing);
        if (p) Object.assign(leg.to, p);
        else {
          leg.landing = undefined;
          Object.assign(leg.from, leg.foot);
          Object.assign(leg.to, this.bounded(this.idealFoot(leg), this.reachLimit * 0.86));
          leg.progress = 0;
          leg.duration = Math.max(0.06, this.profile.stepTime * 0.7);
          this.surfaceReleases++;
        }
      }
    }
  }

  /** Release an owned idle foot into the existing gait, without delaying input. */
  interruptIdle() {
    const gesture = this.idleGesture;
    if (gesture && gesture.leg >= 0) {
      const leg = this.legs[gesture.leg]!;
      if (leg.stepping) {
        const home = gesture.home && this.contactPoint(gesture.home);
        const landing = home
          ? { point: home, contact: gesture.home }
          : this.placement(this.bounded(this.idealFoot(leg), this.reachLimit * 0.86), leg);
        Object.assign(leg.from, leg.foot);
        Object.assign(leg.to, landing.point);
        leg.landing = landing.contact;
        leg.contact = undefined;
        leg.duration = 0.09;
        leg.progress = 0;
      }
    }
    this.idleGesture = null;
    this.idleSway = this.idlePalps = 0;
    this.idleScheduler.interrupt();
  }

  private advanceIdle(dt: number, ready: boolean) {
    const action = this.idleScheduler.update(dt, this.options.personality, ready);
    if (!action) {
      if (this.idleGesture) this.interruptIdle();
      return;
    }
    if (!this.idleGesture) {
      // Use only the engine's bounded, visible, safe contact snapshot. No DOM reads.
      let nearest: Point | null = null;
      let gap = this.reachLimit * 1.2;
      for (const surface of this.surfaceIndex.values()) {
        const dx = surface.b.x - surface.a.x,
          dy = surface.b.y - surface.a.y;
        const fraction = clamp(
          ((this.body.x - surface.a.x) * dx + (this.body.y - surface.a.y) * dy) /
            Math.max(1, dx * dx + dy * dy) +
            (24 * this.scale) / Math.max(1, Math.hypot(dx, dy)),
          surface.min,
          surface.max,
        );
        if (surface.blocked?.some((f) => Math.abs(f - fraction) < 0.02)) continue;
        const point = { x: surface.a.x + dx * fraction, y: surface.a.y + dy * fraction };
        const d = distance(point, this.body);
        if (d > 12 * this.scale && d < gap) {
          nearest = point;
          gap = d;
        }
      }
      const turn = nearest
        ? clamp(
            angleDelta(Math.atan2(nearest.x - this.body.x, this.body.y - nearest.y), this.angle),
            -0.28,
            0.28,
          )
        : 0;
      const usesFoot = ['probe', 'groom', 'reposition', 'tend'].includes(action.kind);
      const index = usesFoot ? (turn < 0 ? 0 : 4) : -1;
      const leg = this.legs[Math.max(0, index)]!;
      const from = { ...leg.foot };
      const edge = this.placement(this.bounded(this.idealFoot(leg), this.reachLimit * 0.86), leg);
      let to = edge.point;
      let edgeContact = edge.contact;
      if (action.kind === 'groom') {
        to = this.toWorld({ x: leg.side * 15, y: -29 });
        edgeContact = undefined;
      } else if (action.kind === 'reposition') {
        const landing = this.placement(
          this.bounded(
            { x: from.x + leg.side * 7 * this.scale, y: from.y - 5 * this.scale },
            this.reachLimit * 0.86,
          ),
          leg,
        );
        to = landing.point;
        edgeContact = landing.contact;
      }
      this.idleGesture = {
        kind: action.kind,
        leg: index,
        from,
        to: { ...to },
        home: leg.contact && { ...leg.contact },
        edge: edgeContact && { ...edgeContact },
        angle: this.angle,
        turn,
      };
      if ((action.kind === 'probe' || action.kind === 'tend') && !edgeContact) {
        this.interruptIdle();
        return;
      }
      if (usesFoot) {
        leg.contact = leg.landing = undefined;
        leg.stepping = true;
        leg.lift = 0;
      }
    }
    const gesture = this.idleGesture;
    if (
      (gesture.home && !this.contactPoint(gesture.home)) ||
      (gesture.edge && !this.contactPoint(gesture.edge))
    ) {
      this.interruptIdle();
      return;
    }
    const p = action.elapsed / action.duration;
    const envelope = Math.sin(p * Math.PI) ** 2;
    this.idleSway = action.kind === 'sway' ? Math.sin(p * Math.PI * 2) * envelope * 0.045 : 0;
    this.idlePalps =
      this.options.personality === 'feral'
        ? Math.sin(p * Math.PI * 8) * Math.sin(clamp((p - 0.15) / 0.45, 0, 1) * Math.PI) ** 2 * 1.8
        : action.kind === 'groom'
          ? Math.sin(p * Math.PI * 4) * envelope * 0.8
          : 0;
    if (gesture.leg < 0) return;
    const leg = this.legs[gesture.leg]!;
    const home = (gesture.home && this.contactPoint(gesture.home)) || gesture.from;
    const edge = (gesture.edge && this.contactPoint(gesture.edge)) || gesture.to;
    const reach = smooth(clamp(p / 0.32, 0, 1)) * (1 - smooth(clamp((p - 0.52) / 0.34, 0, 1)));
    const endpoint = action.kind === 'groom' ? gesture.to : edge;
    const reposition = action.kind === 'reposition';
    const t = reposition ? smooth(clamp(p / 0.85, 0, 1)) : reach;
    // A probe/tending toe briefly meets the safe edge, then lifts to withdraw.
    // Keep its other seven supports; the tested toe never carries the body load.
    const lift = reposition
      ? Math.sin(t * Math.PI) ** 2
      : action.kind === 'probe' || action.kind === 'tend'
        ? Math.sin(clamp(p / 0.32, 0, 1) * Math.PI) ** 2 +
          Math.sin(clamp((p - 0.52) / 0.34, 0, 1) * Math.PI) ** 2
        : reach;
    Object.assign(
      leg.foot,
      this.bounded(
        {
          x: mix(home.x, endpoint.x, t),
          y: mix(home.y, endpoint.y, t) - lift * 5 * this.scale,
        },
        this.reachLimit * 0.97,
      ),
    );
    leg.lift = lift * 0.7;
    if (p >= 0.86) {
      Object.assign(leg.foot, reposition ? endpoint : home);
      leg.contact = reposition ? gesture.edge : gesture.home;
      leg.stepping = false;
      leg.lift = 0;
      leg.rested = 0;
    }
  }

  /** A small tangent bias helps traverse a line without delaying a new pointer
   * destination. Leaving a boundary immediately restores free-plane steering. */
  private surfaceDirection(dx: number, dy: number): Point {
    const remaining = Math.hypot(dx, dy);
    const contacts = this.legs.filter((l) => l.contact);
    this.pageMovement =
      contacts.length >= 2 && remaining < 12 ? 'perch' : contacts.length ? 'traverse' : 'fallback';
    if (remaining < 30 || !contacts.length || this.options.grip) return { x: dx, y: dy };
    const direction = { x: dx / remaining, y: dy / remaining };
    for (const leg of contacts) {
      const s = this.surfaceIndex.get(leg.contact!.id);
      if (!s) continue;
      const length = distance(s.a, s.b);
      const tx = (s.b.x - s.a.x) / length,
        ty = (s.b.y - s.a.y) / length;
      const alignment = direction.x * tx + direction.y * ty;
      if (Math.abs(alignment) < 0.9) continue;
      const end = alignment > 0 ? s.max : s.min;
      const room = Math.abs(end - leg.contact!.fraction) * length;
      if (room < 12) continue; // An edge never becomes a wall that traps the body.
      const bias = this.options.personality === 'dreamy' ? 0.18 : 0.1;
      return {
        x: mix(dx, tx * Math.sign(alignment) * remaining, bias),
        y: mix(dy, ty * Math.sign(alignment) * remaining, bias),
      };
    }
    return { x: dx, y: dy };
  }

  private surfaceHop(dx: number, dy: number): { to: Point; leg: number; contact: Contact } | null {
    const remaining = Math.hypot(dx, dy);
    if (remaining < 70) return null;
    const vx = dx / remaining,
      vy = dy / remaining;
    for (const leg of this.legs) {
      if (!leg.contact) continue;
      const s = this.surfaceIndex.get(leg.contact.id);
      if (!s) continue;
      const length = distance(s.a, s.b);
      const alignment = ((s.b.x - s.a.x) * vx + (s.b.y - s.a.y) * vy) / length;
      if (Math.abs(alignment) < 0.85) continue;
      const end = alignment > 0 ? s.max : s.min;
      if (Math.abs(end - leg.contact.fraction) * length > 60 * this.scale) continue;
      const edge = { x: mix(s.a.x, s.b.x, end), y: mix(s.a.y, s.b.y, end) };
      for (const next of this.surfaceIndex.values()) {
        if (next.id === s.id || next.kind !== s.kind) continue;
        const square = (next.b.x - next.a.x) ** 2 + (next.b.y - next.a.y) ** 2;
        const length = Math.sqrt(square);
        if (length < 1) continue;
        const tx = (next.b.x - next.a.x) / length,
          ty = (next.b.y - next.a.y) / length;
        const alignment = tx * vx + ty * vy;
        if (Math.abs(alignment) < 0.85) continue;
        const t = clamp(
          ((edge.x - next.a.x) * (next.b.x - next.a.x) +
            (edge.y - next.a.y) * (next.b.y - next.a.y)) /
            Math.max(1, square),
          next.min,
          next.max,
        );
        const p = { x: mix(next.a.x, next.b.x, t), y: mix(next.a.y, next.b.y, t) };
        const gap = distance(edge, p),
          forward = (p.x - edge.x) * vx + (p.y - edge.y) * vy;
        if (gap < 14 || gap > 65 * this.scale || forward < gap * 0.85) continue;
        // Land over the visible destination, preserving the body's offset from
        // the line. A direction-only distance can stop in the gap or overshoot
        // a narrow/clipped edge. Wait until this actual landing fits the budget.
        const inset = Math.min(6 * this.scale, ((next.max - next.min) * length) / 2);
        const fraction = clamp(t + (Math.sign(alignment) * inset) / length, next.min, next.max);
        const offset = (this.body.x - edge.x) * -ty + (this.body.y - edge.y) * tx;
        const to = {
          x: mix(next.a.x, next.b.x, fraction) - ty * offset,
          y: mix(next.a.y, next.b.y, fraction) + tx * offset,
        };
        const travel = distance(this.body, to);
        if (
          travel > 95 * this.scale ||
          travel < 12 ||
          distance(to, this.destination) >= remaining ||
          to.x < 65 ||
          to.x > this.width - 65 ||
          to.y < 95 ||
          to.y > this.height - 115
        )
          continue;
        let support: { to: Point; leg: number; contact: Contact } | null = null;
        let best = this.contactSearch * 1.6;
        for (const [index, candidate] of this.legs.entries()) {
          const ideal = this.idealFoot(candidate);
          const future = { x: ideal.x + to.x - this.body.x, y: ideal.y + to.y - this.body.y };
          const normalDrift = (future.x - next.a.x) * -ty + (future.y - next.a.y) * tx;
          if (Math.abs(normalDrift) > this.contactSearch * 1.5) continue;
          const supportedTo = { x: to.x + ty * normalDrift, y: to.y - tx * normalDrift };
          if (
            distance(this.body, supportedTo) > 95 * this.scale ||
            distance(supportedTo, this.destination) >= remaining ||
            supportedTo.x < 65 ||
            supportedTo.x > this.width - 65 ||
            supportedTo.y < 95 ||
            supportedTo.y > this.height - 115
          )
            continue;
          future.x += supportedTo.x - to.x;
          future.y += supportedTo.y - to.y;
          const f = clamp(
            ((future.x - next.a.x) * tx + (future.y - next.a.y) * ty) / length,
            next.min,
            next.max,
          );
          const contact = { id: next.id, fraction: f };
          const point = this.contactPoint(contact, supportedTo);
          if (!point || distance(point, supportedTo) > this.reachLimit * 0.89) continue;
          const drift = distance(future, point) + Math.abs(normalDrift);
          if (drift < best) {
            best = drift;
            support = { to: supportedTo, leg: index, contact };
          }
        }
        if (!support) continue;
        this.pageMovement = 'cross';
        return support;
      }
    }
    return null;
  }
  private advanceRecovery(dt: number): void {
    const r = this.recovery!;
    if (r.reason === 'scroll') {
      this.advanceScrollRecovery(dt);
      return;
    }
    r.elapsed += dt;
    const flight = clamp((r.elapsed - r.anticipation) / r.flight, 0, 1);
    const land = clamp((r.elapsed - r.anticipation - r.flight) / r.landing, 0, 1);
    const prepare = smooth(clamp(r.elapsed / r.anticipation, 0, 1));
    this.body.x = mix(r.from.x, r.to.x, smooth(flight));
    this.body.y = mix(r.from.y, r.to.y, smooth(flight));
    this.crouch =
      r.elapsed < r.anticipation ? prepare : flight < 1 ? 1 - flight * 0.55 : (1 - land) * 0.6;
    const height =
      this.options.personality === 'feral' ? 27 : this.options.personality === 'dreamy' ? 17 : 22;
    this.hopHeight = Math.sin(flight * Math.PI) * height * this.scale;
    if (r.support && !r.support.released) {
      const point = this.contactPoint(r.support.contact, r.to);
      if (point) r.support.point = point;
      else {
        this.legs[r.support.leg]!.landing = undefined;
        r.support.released = true;
        this.surfaceReleases++;
      }
    }
    const support = r.support?.point;
    this.legs.forEach((l, i) => {
      const pose = this.idealFoot(l);
      const ideal = r.support?.leg === i && support ? support : pose;
      const tucked = { x: (pose.x - this.body.x) * 0.48, y: (pose.y - this.body.y) * 0.48 };
      const fold = flight > 0 ? 1 : prepare;
      const local = { x: mix(r.feet[i]!.x, tucked.x, fold), y: mix(r.feet[i]!.y, tucked.y, fold) };
      const touchdown = smooth(clamp(land * 1.25 - l.row * 0.07, 0, 1));
      const p = this.bounded({
        x: mix(this.body.x + local.x, ideal.x, touchdown),
        y: mix(this.body.y + local.y - this.hopHeight, ideal.y, touchdown),
      });
      Object.assign(l.foot, p);
      Object.assign(l.from, p);
      Object.assign(l.to, p);
      l.lift = flight > 0 && flight < 1 ? 1 : 0;
    });
    if (land === 1) {
      this.recovery = null;
      this.hopHeight = this.crouch = 0;
      this.hopCooldown = 0.2;
      this.resetStance();
      if (r.support && support) {
        const leg = this.legs[r.support.leg]!;
        for (const p of [leg.foot, leg.from, leg.to]) Object.assign(p, support);
        leg.contact = r.support.released ? undefined : r.support.contact;
        leg.released = !!r.support.released;
      }
    }
  }
  private advanceScrollRecovery(dt: number): void {
    const r = this.recovery!;
    r.elapsed += dt;
    const feral = this.options.personality === 'feral';
    const dreamy = this.options.personality === 'dreamy';
    const prepare = smooth(clamp(r.elapsed / r.anticipation, 0, 1));
    const flight = clamp((r.elapsed - r.anticipation) / r.flight, 0, 1);
    const land = clamp((r.elapsed - r.anticipation - r.flight) / r.landing, 0, 1);
    // The landing follows motion at a bounded speed until contact begins, then holds.
    if (flight < 1) {
      const separation = distance(r.to, r.goal);
      const amount = separation ? Math.min(1 - Math.exp(-dt * 12), (dt * 220) / separation) : 1;
      r.to.x = mix(r.to.x, r.goal.x, amount);
      r.to.y = mix(r.to.y, r.goal.y, amount);
    }
    this.hopHeight = 0;
    this.suspension = 0;
    if (feral) {
      const arc = Math.sin(flight * Math.PI) * Math.min(58 * this.scale, r.from.y - 35);
      this.body.x = mix(r.from.x, r.to.x, smooth(flight));
      this.body.y = mix(r.from.y, r.to.y, smooth(flight)) - arc;
      this.crouch = flight === 0 ? prepare : flight < 1 ? 1 - flight * 0.7 : (1 - land) * 0.8;
      this.silkAmount = 0;
    } else {
      const edge = r.edge!;
      // A short offscreen hold is part of this single clock, never another entrance.
      const descent = smooth(clamp((flight - 0.09) / 0.91, 0, 1));
      const sway =
        Math.sin(descent * Math.PI * (dreamy ? 2 : 1)) *
        Math.sin(descent * Math.PI) *
        (dreamy ? 18 : 5) *
        this.scale;
      this.body.x =
        flight === 0 ? mix(r.from.x, edge.x, prepare) : mix(edge.x, r.to.x, descent) + sway;
      this.body.y = flight === 0 ? mix(r.from.y, edge.y, prepare) : mix(edge.y, r.to.y, descent);
      this.angle = r.angle + (dreamy ? Math.sin(descent * Math.PI * 2) * 0.16 * (1 - descent) : 0);
      this.crouch = flight === 0 ? prepare * 0.65 : (1 - land) * (dreamy ? 0.8 : 0.45);
      this.silkOrigin = { x: clamp(edge.x, 0, this.width), y: Math.max(0, edge.y) };
      this.silkAmount = flight > 0 ? 1 - smooth(clamp((land - 0.65) / 0.35, 0, 1)) : 0;
    }
    this.legs.forEach((l, i) => {
      const pose = this.idealFoot(l);
      const tuck = feral ? 0.38 : dreamy ? 0.46 : 0.55;
      const fold = flight > 0 ? 1 : prepare;
      // Feral opens before touchdown; Widow searches in front while rear support lands.
      const spread = feral
        ? smooth(clamp((flight - 0.72) / 0.28, 0, 1))
        : dreamy
          ? smooth(clamp((land - 0.3) / 0.7, 0, 1))
          : smooth(clamp((flight - 0.78) / 0.22 + land * 0.65 - (3 - l.row) * 0.12, 0, 1));
      const local = {
        x: mix(r.feet[i]!.x, (pose.x - this.body.x) * tuck, fold),
        y: mix(r.feet[i]!.y, (pose.y - this.body.y) * tuck, fold),
      };
      let endpoint = {
        x: mix(this.body.x + local.x, pose.x, spread),
        y: mix(this.body.y + local.y, pose.y, spread),
      };
      if (!feral && !dreamy && l.row === 0 && flight > 0.6 && land < 0.55)
        endpoint.y -= Math.sin((flight - 0.6) * Math.PI * 5) * 7 * this.scale * (1 - land);
      const placement =
        land > (dreamy ? 0.7 : feral ? 0.2 : l.row >= 2 ? 0.15 : 0.6)
          ? this.placement(this.bounded(pose), l)
          : null;
      if (l.contact) {
        const contact = this.contactPoint(l.contact);
        if (contact) endpoint = contact;
        else {
          l.contact = undefined;
          this.surfaceReleases++;
        }
      } else if (placement) {
        endpoint = placement.point;
        l.contact = placement.contact;
      }
      const p = this.bounded(endpoint);
      for (const q of [l.foot, l.from, l.to]) Object.assign(q, p);
      l.lift = 1 - spread;
      l.progress = 1;
    });
    if (land === 1) {
      this.recovery = null;
      this.hopHeight = this.crouch = this.silkAmount = 0;
      this.silkOrigin = null;
      this.angle = r.angle;
      this.hopCooldown = 0.25;
      this.legs.forEach((l) => {
        l.lift = 0;
        l.rested = 0;
      });
    }
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
      x:
        this.body.x +
        this.weightShift.x +
        this.lean.x +
        x * Math.cos(this.angle) -
        y * Math.sin(this.angle),
      y:
        this.body.y +
        this.weightShift.y +
        this.lean.y +
        this.bodyOffset() +
        x * Math.sin(this.angle) +
        y * Math.cos(this.angle),
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

  update(dt: number, _time: number, target: Point, opts: SpiderOptions): void {
    // A suspended tab must never turn integration into an enormous leap.
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.04);
    const wasInitialized = this.initialized;
    const wasQuiet = this.options.reducedMotion;
    const changedType = wasInitialized && this.options.personality !== opts.personality;
    this.options = opts;
    const delta = opts.surfaceDelta ?? { x: 0, y: 0 };
    const ids = opts.surfaces !== this.surfaceSnapshot ? this.contactIds : [];
    const movingContact =
      ids.length &&
      opts.surfaces?.some((s) => {
        const old = this.surfaceIndex.get(s.id);
        return (
          old && ids.includes(s.id) && (distance(old.a, s.a) > 0.5 || distance(old.b, s.b) > 0.5)
        );
      });
    if (dt > 0) {
      this.scrollQuiet =
        Math.hypot(delta.x, delta.y) > 0.5 || opts.pageMoving || movingContact
          ? 0
          : this.scrollQuiet + dt;
      if (!this.recovery && this.scrollQuiet >= 0.24) this.scrollRecoveryArmed = true;
    }
    if (opts.surfaces !== this.surfaceSnapshot) {
      this.surfaceSnapshot = opts.surfaces;
      this.surfaceIndex = new Map((opts.surfaces ?? []).map((s) => [s.id, s]));
    }
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
    let surfaceVX = 0,
      surfaceVY = 0;
    if (changedType) {
      this.interruptIdle();
      this.idleScheduler.reset();
      this.gripLeg = -1;
      this.gripCaptured = false;
      this.recovery = null;
      this.hopHeight = this.crouch = this.silkAmount = 0;
      this.silkOrigin = null;
      Object.assign(this.body, this.safeLanding(this.body));
      this.resetStance();
    }
    if (
      delta.x ||
      delta.y ||
      !opts.idle ||
      opts.grip ||
      opts.selector ||
      opts.pointer ||
      opts.attention
    )
      this.interruptIdle();
    if (wasInitialized && this.needsRecovery(delta, opts.surfaces)) {
      this.recover(
        { x: this.body.x, y: clamp(this.body.y + Math.sign(delta.y) * 90, 120, this.height - 150) },
        dt === 0 || opts.reducedMotion,
      );
      // Release at the last valid pose; integration begins on the next frame.
      if (this.recovery) return;
    }
    // The rig is detached during a hop. Scrolling cannot drag its loose feet.
    if (wasInitialized && !this.recovery) {
      const dx = Number.isFinite(delta.x) ? delta.x : 0;
      const dy = Number.isFinite(delta.y) ? delta.y : 0;
      if (dt > 0) {
        surfaceVX = clamp(dx / dt, -profile.speed, profile.speed);
        surfaceVY = clamp(dy / dt, -profile.speed, profile.speed);
      }
      for (const leg of this.legs)
        for (const p of [leg.foot, leg.from, leg.to]) {
          if (
            (p === leg.foot && (leg.contact || leg.landing)) ||
            (p === leg.from && leg.landing) ||
            (p === leg.to && leg.landing)
          )
            continue;
          p.x += dx;
          p.y += dy;
        }
      this.gripFrom.x += dx;
      this.gripFrom.y += dy;
    }
    if (!this.recovery) this.followSurfaces();
    if (
      this.idleGesture &&
      ((this.idleGesture.home && !this.contactPoint(this.idleGesture.home)) ||
        (this.idleGesture.edge && !this.contactPoint(this.idleGesture.edge)))
    )
      this.interruptIdle();
    if (opts.grip && !this.withinReach(opts.grip.point)) {
      // A page may move a committed fragment offscreen. Release; never scale bones to it.
      this.options = { ...opts, grip: undefined };
      opts = this.options;
      this.gripLeg = -1;
      this.gripCaptured = false;
    }
    // A captured point is already in current viewport coordinates, including any scroll.
    if (!opts.grip && this.gripLeg >= 0) {
      // Cancellation and zero-dt geometry refresh can release a prepared claw.
      this.legs[this.gripLeg]!.rested = 4;
      this.gripLeg = -1;
      this.gripCaptured = false;
      this.gripReach = 0;
    }
    if (this.gripCaptured && this.gripLeg >= 0 && opts.grip) {
      Object.assign(this.legs[this.gripLeg]!.foot, opts.grip.point);
    }
    this.age += dt;
    if (opts.reducedMotion) {
      this.interruptIdle();
      // Quiet geometry can follow the surface, but has no integration or contact animation.
      const quietDX = this.destination.x - this.body.x;
      const quietDY = this.destination.y - this.body.y;
      Object.assign(this.body, this.destination);
      this.velocity.x = this.velocity.y = this.angle = this.headAngle = 0;
      this.suspension = this.crouch = this.alert = this.silkAmount = 0;
      this.recovery = null;
      this.silkOrigin = null;
      this.look.x = this.look.y = 0;
      this.gripLeg = -1;
      this.weightShift = { x: 0, y: 0 };
      this.lean = { x: 0, y: 0 };
      this.gripCaptured = false;
      this.holding = false;
      this.burstAge = 0;
      for (const leg of this.legs) {
        leg.contact = leg.landing = undefined;
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
      if (this.legs.some((l) => !this.withinReach(l.foot))) this.resetStance();
      return;
    }
    // Paused geometry refreshes must not schedule a step or advance any pose state.
    if (dt === 0) {
      if (!this.recovery && this.legs.some((l) => !this.withinReach(l.foot)))
        this.recover(this.body, true);
      return;
    }
    this.hopCooldown = Math.max(0, this.hopCooldown - dt);
    if (this.recovery) {
      Object.assign(this.attention, lookAt);
      const dx = lookAt.x - this.body.x,
        dy = lookAt.y - this.body.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const localX = (dx * Math.cos(this.angle) + dy * Math.sin(this.angle)) / length;
      const eyeMix = 1 - Math.exp(-dt * profile.eyeResponse);
      this.look.x = mix(this.look.x, localX * 5, eyeMix);
      this.headAngle = mix(this.headAngle, clamp(localX * 0.58, -0.58, 0.58), eyeMix);
      this.advanceRecovery(dt);
      return;
    }

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

    const crossing =
      feral && !entering && !opts.grip && this.hopCooldown === 0 ? this.surfaceHop(dx, dy) : null;
    if (
      crossing ||
      (feral &&
        !opts.surfaces?.length &&
        !entering &&
        !opts.grip &&
        remaining > 175 &&
        this.hopCooldown === 0)
    ) {
      const travel = Math.min(155 * this.scale, remaining - 60);
      this.recover(
        crossing?.to ?? {
          x: this.body.x + (dx / remaining) * travel,
          y: this.body.y + (dy / remaining) * travel,
        },
        false,
        'hunt',
        crossing ?? undefined,
      );
      this.advanceRecovery(dt);
      return;
    }
    const investigating = opts.selector?.phase === 'scan';
    const preparing = opts.selector?.phase === 'prepare';
    const settling = opts.selector?.phase === 'settle';
    const attackProgress = opts.selector?.progress ?? 0;
    const urgency = opts.pursuing
      ? 0.5 + clamp((opts.pursuitSpeed ?? 900) / 900, 0, 1) * 0.62
      : investigating
        ? 0.72
        : 1;
    const maxSpeed = profile.speed * (0.84 + intensity * 0.24) * urgency;
    const approach = dreamy ? 5 : feral ? 17 : 10;
    let wantedSpeed = Math.min(
      maxSpeed,
      Math.sqrt(2 * profile.braking * remaining),
      remaining * approach,
    );
    if (this.holding) wantedSpeed = 0;
    if (entering) wantedSpeed = Math.min(wantedSpeed, 700);
    const route = this.surfaceDirection(dx, dy);
    const routeLength = Math.max(0.05, Math.hypot(route.x, route.y));
    const desiredVX = remaining > 0.05 ? (route.x / routeLength) * wantedSpeed : 0;
    const desiredVY = remaining > 0.05 ? (route.y / routeLength) * wantedSpeed : 0;
    const deltaX = desiredVX - this.velocity.x;
    const deltaY = desiredVY - this.velocity.y;
    const deltaSpeed = Math.hypot(deltaX, deltaY);
    const braking = this.velocity.x * deltaX + this.velocity.y * deltaY < 0;
    const acceleration =
      (braking ? profile.braking * (this.holding ? 3.2 : 1) : profile.acceleration) * urgency;
    const velocityMix = deltaSpeed > 0 ? Math.min(1, (acceleration * dt) / deltaSpeed) : 1;
    const previousVelocity = { ...this.velocity };
    this.velocity.x += deltaX * velocityMix;
    this.velocity.y += deltaY * velocityMix;
    if (remaining < 1) this.velocity.x = this.velocity.y = 0;
    // Contacts constrain travel, rather than being dragged inward when the body outruns them.
    let travel = 1;
    const moveX = this.velocity.x * dt,
      moveY = this.velocity.y * dt;
    const moveSquared = moveX * moveX + moveY * moveY;
    // Brake at the destination plane. Momentum may turn smoothly on reversal,
    // but cannot carry the body beyond its resting target and start an orbit.
    const forward = moveX * dx + moveY * dy;
    if (forward > 0) travel = Math.min(travel, (remaining * remaining) / forward);
    if (!entering && !opts.descending && moveSquared > 0) {
      for (const leg of this.legs) {
        // A committed landing must still be reachable after a reversal mid-swing.
        const contact = leg.stepping ? leg.to : leg.foot;
        const x = this.body.x - contact.x,
          y = this.body.y - contact.y;
        const dot = x * moveX + y * moveY;
        const room = (this.reachLimit * 0.97) ** 2 - x * x - y * y;
        travel = Math.min(
          travel,
          clamp(
            (-dot + Math.sqrt(Math.max(0, dot * dot + moveSquared * room))) / moveSquared,
            0,
            1,
          ),
        );
      }
    }
    this.body.x += moveX * travel;
    this.body.y += moveY * travel;
    const poseMix = 1 - Math.exp(-dt * 10);
    this.lean.x = mix(
      this.lean.x,
      clamp((this.velocity.x - previousVelocity.x) / dt / profile.acceleration, -1, 1) *
        3 *
        this.scale,
      poseMix,
    );
    this.lean.y = mix(
      this.lean.y,
      clamp((this.velocity.y - previousVelocity.y) / dt / profile.acceleration, -1, 1) *
        3 *
        this.scale,
      poseMix,
    );
    const walkingVX = this.velocity.x - surfaceVX;
    const walkingVY = this.velocity.y - surfaceVY;
    const speed = Math.hypot(walkingVX, walkingVY);

    this.advanceIdle(
      dt,
      !!opts.idle &&
        !entering &&
        !opts.descending &&
        !opts.grip &&
        !opts.selector &&
        !opts.pointer &&
        !opts.attention &&
        remaining < 1 &&
        speed < 1 &&
        (!!this.idleGesture || this.legs.every((leg) => !leg.stepping && !leg.released)),
    );
    const idle = this.idleScheduler.action;
    const idleProgress = idle ? idle.elapsed / idle.duration : 0;
    const idleEnvelope = Math.sin(idleProgress * Math.PI) ** 2;
    const idleHeading = this.idleGesture
      ? this.idleGesture.angle +
        this.idleGesture.turn *
          (feral
            ? smooth(clamp(idleProgress / 0.12, 0, 1)) *
              (1 - smooth(clamp((idleProgress - 0.62) / 0.38, 0, 1)))
            : idleEnvelope)
      : null;

    const lookDX = lookAt.x - this.body.x;
    const lookDY = lookAt.y - this.body.y;
    const lookDistance = Math.max(1, Math.hypot(lookDX, lookDY));
    const heading = idleHeading ?? (lookDistance > 12 ? Math.atan2(lookDX, -lookDY) : this.angle);
    const travelHeading =
      speed > 25
        ? Math.atan2(walkingVX, -walkingVY)
        : idle && feral && this.idleGesture
          ? this.idleGesture.angle +
            this.idleGesture.turn *
              smooth(clamp((idleProgress - 0.08) / 0.18, 0, 1)) *
              (1 - smooth(clamp((idleProgress - 0.62) / 0.38, 0, 1)))
          : heading;
    const turn = angleDelta(travelHeading, this.angle);
    const turnStep = clamp(
      turn *
        (1 -
          Math.exp(
            -dt * (idle ? (feral ? 25 : 2) : profile.turnResponse) * (investigating ? 0.45 : 1),
          )),
      -(idle && !feral ? 0.25 : profile.turnRate) * dt,
      (idle && !feral ? 0.25 : profile.turnRate) * dt,
    );
    this.angle = angleDelta(this.angle + turnStep, 0);
    const localLookX =
      (lookDX * Math.cos(this.angle) + lookDY * Math.sin(this.angle)) / lookDistance;
    const localLookY =
      (-lookDX * Math.sin(this.angle) + lookDY * Math.cos(this.angle)) / lookDistance;
    const eyeMix = 1 - Math.exp(-dt * profile.eyeResponse);
    this.look.x = mix(
      this.look.x,
      idle ? Math.sin(angleDelta(heading, this.angle)) * 4 : localLookX * 4,
      eyeMix,
    );
    this.look.y = mix(this.look.y, idle ? -idleEnvelope * 2 : localLookY * 4, eyeMix);
    this.headAngle = mix(
      this.headAngle,
      clamp(angleDelta(heading, this.angle), -0.48, 0.48),
      eyeMix,
    );
    const compression = idle
      ? (idle.kind === 'crouch' ? 0.65 : idle.kind === 'probe' ? 0.18 : 0) * idleEnvelope
      : preparing
        ? (feral ? 1.15 : dreamy ? 0.45 : 0.6) * smooth(attackProgress)
        : settling
          ? -Math.sin(attackProgress * Math.PI) * (feral ? 0.5 : 0.25)
          : feral
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
    let nextGrip = opts.grip ? (this.gripLeg >= 0 ? this.gripLeg : contactLocalX < 0 ? 0 : 4) : -1;
    if (nextGrip >= 0 && nextGrip !== this.gripLeg) {
      const supports = this.legs.filter((leg, i) => i !== nextGrip && !leg.stepping);
      if (
        supports.length < 4 ||
        supports.filter((leg) => leg.side === this.legs[nextGrip]!.side).length < 2
      )
        nextGrip = -1;
    }
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
      if (i === this.idleGesture?.leg) continue;
      if (i === this.gripLeg && opts.grip) {
        leg.contact = leg.landing = undefined;
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
        leg.contact = leg.landing = undefined;
        const hanging = opts.descending ? 0.8 : 1 - smooth(clamp((this.age - 0.55) / 0.8, 0, 1));
        ideal.x = mix(ideal.x, this.body.x + leg.side * (21 + leg.row * 10) * this.scale, hanging);
        ideal.y = mix(ideal.y, this.body.y + (61 + leg.row * 17) * this.scale, hanging);
        Object.assign(ideal, this.bounded(ideal, this.reachLimit * 0.82));
        leg.foot.x = mix(leg.foot.x, ideal.x, 1 - Math.exp(-dt * 12));
        leg.foot.y = mix(leg.foot.y, ideal.y, 1 - Math.exp(-dt * 12));
        leg.stepping = false;
        leg.lift = 0;
        continue;
      }
      if (leg.stepping) {
        leg.progress = Math.min(1, leg.progress + dt / leg.duration);
        const p = leg.progress;
        const t = p * p * p * (p * (p * 6 - 15) + 10);
        const lift = Math.sin(Math.PI * p) ** 2;
        leg.lift = lift;
        // Page-space endpoints never chase the body. Elevation reads as lift, not a sideways wave.
        Object.assign(
          leg.foot,
          this.bounded(
            {
              x: mix(leg.from.x, leg.to.x, t),
              y: mix(leg.from.y, leg.to.y, t) - lift * profile.stepLift * this.scale * 0.35,
            },
            this.reachLimit * 0.97,
          ),
        );
        if (leg.progress >= 1) {
          // Exact contact assignment, never velocity-driven dragging of a planted foot.
          Object.assign(leg.foot, leg.to);
          leg.contact = leg.landing;
          leg.landing = undefined;
          leg.released = false;
          leg.stepping = false;
          leg.rested = 0;
          leg.lift = 0;
          movingFeet--;
        }
      }
    }

    if (!entering && !opts.descending) {
      const idleRest = !!opts.idle && speed < 1 && remaining < 1;
      const budget = this.gripLeg >= 0 ? 3 : idleRest ? 1 : 4;
      const pace = clamp(speed / profile.speed, 0, 1);
      const stride = profile.stepDrift * this.scale * mix(0.55, 1, pace);
      const stepTime = clamp((stride * 1.4) / Math.max(1, speed), 0.055, profile.stepTime);
      const turning = turnStep / dt;
      this.stepCooldown = Math.max(0, this.stepCooldown - dt);
      while (movingFeet < budget && this.stepCooldown === 0) {
        let next = -1;
        let best = -Infinity;
        for (let i = 0; i < this.legs.length; i++) {
          const leg = this.legs[i]!;
          if (
            i === this.gripLeg ||
            leg.stepping ||
            this.idleGesture ||
            leg.rested <= profile.stepRest
          )
            continue;
          // Compare against the same reachable pose used for landing, or short rigs
          // can endlessly re-step toward a rest position just beyond that limit.
          const rest = this.bounded(leg.ideal, this.reachLimit * 0.86);
          const drift = distance(leg.foot, rest);
          const trail =
            ((rest.x - leg.foot.x) * walkingVX + (rest.y - leg.foot.y) * walkingVY) /
            Math.max(1, speed);
          const reach = distance(leg.foot, this.body) / this.reachLimit;
          const lateral =
            Math.abs((rest.x - leg.foot.x) * walkingVY - (rest.y - leg.foot.y) * walkingVX) /
            Math.max(1, speed);
          const exhaustingReach =
            reach > 0.88 &&
            (this.body.x - leg.foot.x) * walkingVX + (this.body.y - leg.foot.y) * walkingVY > 0;
          const needsStep =
            trail > stride ||
            lateral > stride * 1.5 ||
            (reach > 0.88 && trail > 0) ||
            exhaustingReach;
          const contactComfort = leg.contact ? this.contactSearch + 6 * this.scale : 5 * this.scale;
          const placement =
            !leg.contact && !leg.released && speed < 12
              ? this.placement(this.bounded(leg.ideal, this.reachLimit * 0.86), leg)
              : null;
          const adjustment =
            speed < 12 && leg.rested > 0.15 && (drift > contactComfort || !!placement?.contact);
          if (!needsStep && !adjustment && !leg.released) continue;
          // Adjacent ipsilateral feet never swing together; each side retains two supports.
          const unavailable = this.legs.filter(
            (other, index) => other.side === leg.side && (other.stepping || index === this.gripLeg),
          );
          if (
            unavailable.length >= 2 ||
            unavailable.some((other) => other.stepping && Math.abs(other.row - leg.row) === 1)
          )
            continue;
          const opposite = this.lastStep >= 0 && this.legs[this.lastStep]!.side !== leg.side;
          // Alternating diagonal contacts supply rhythm without locking every limb in phase.
          const diagonal = (leg.row + (leg.side > 0 ? 1 : 0)) % 2 === this.gaitStep % 2;
          const score =
            Math.max(trail, drift * 0.7) +
            Math.max(0, reach - 0.82) * 500 +
            Math.min(leg.rested, 3) * 2 +
            (opposite ? 9 : 0) +
            (diagonal ? 6 : 0);
          if (score > best) {
            next = i;
            best = score;
          }
        }
        if (next < 0) break;
        const leg = this.legs[next]!;
        Object.assign(leg.from, leg.foot);
        // Front feet catch the path, middle feet redirect, rear feet keep a longer push-off.
        const lead = stepTime * (1.5 - leg.row * 0.15);
        const rotation = clamp(turning * lead, -0.35, 0.35);
        const localX = leg.ideal.x - this.body.x,
          localY = leg.ideal.y - this.body.y;
        const outside = clamp(1 - leg.side * turning * 0.09, 0.55, 1.45);
        leg.to.x =
          this.body.x +
          localX * Math.cos(rotation) -
          localY * Math.sin(rotation) +
          walkingVX * lead * outside;
        leg.to.y =
          this.body.y +
          localX * Math.sin(rotation) +
          localY * Math.cos(rotation) +
          walkingVY * lead * outside;
        Object.assign(leg.to, this.bounded(leg.to, this.reachLimit * 0.86));
        const landing = this.placement(leg.to, leg);
        Object.assign(leg.to, landing.point);
        leg.landing = landing.contact;
        leg.contact = undefined;
        leg.released = false;
        leg.duration = stepTime;
        if (landing.contact && pace < 0.4) {
          // Deliberate reaches/probes are still scheduled by the support gait.
          leg.duration *= dreamy ? 1.2 : feral ? 1 : 1.12;
          if (leg.row === 0) this.pageMovement = dreamy ? 'reach' : feral ? 'traverse' : 'probe';
        }
        leg.progress = 0;
        leg.stepping = true;
        this.lastStep = next;
        this.gaitStep++;
        this.stepCooldown = leg.duration / 8;
        movingFeet++;
      }
    }
    for (const leg of this.legs) {
      if (!this.withinReach(leg.foot)) {
        // Surface displacement or silk arrival can invalidate a contact independently
        // of walking. Release into a short lift; normal travel is constrained above.
        this.releasedContacts++;
        leg.contact = leg.landing = undefined;
        Object.assign(leg.foot, this.bounded(leg.foot, this.reachLimit * 0.995));
        Object.assign(leg.from, leg.foot);
        Object.assign(leg.to, this.bounded(this.idealFoot(leg), this.reachLimit * 0.86));
        leg.stepping = true;
        leg.progress = 0;
        leg.duration = Math.max(0.045, profile.stepTime * 0.55);
        leg.lift = 0.1;
        leg.rested = 0;
      }
    }
    let liftLoad = 0;
    const support = { x: 0, y: 0 };
    let contacts = 0;
    for (const [i, leg] of this.legs.entries()) {
      liftLoad += leg.lift;
      if (!leg.stepping && i !== this.gripLeg) {
        support.x += leg.foot.x - this.body.x;
        support.y += leg.foot.y - this.body.y;
        contacts++;
      }
    }
    this.weightShift.x = mix(
      this.weightShift.x,
      clamp((support.x / Math.max(1, contacts)) * 0.08, -3 * this.scale, 3 * this.scale),
      poseMix,
    );
    this.weightShift.y = mix(
      this.weightShift.y,
      clamp((support.y / Math.max(1, contacts)) * 0.08, -3 * this.scale, 3 * this.scale),
      poseMix,
    );
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
      const origin = this.silkOrigin ?? { x: this.silkAnchor, y: 0 };
      ctx.moveTo(origin.x, origin.y);
      ctx.bezierCurveTo(
        origin.x,
        mix(origin.y, this.body.y, 0.3),
        this.body.x - 7,
        this.body.y * 0.65,
        this.body.x,
        this.body.y - 23 * s,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.renderSelector();
    const idle = this.idleScheduler.action;
    if (idle?.kind === 'tend' && this.idleGesture?.edge) {
      const anchor = this.contactPoint(this.idleGesture.edge);
      if (anchor) {
        const spinneret = this.toWorld({ x: 0, y: 34 });
        ctx.globalAlpha = Math.sin((idle.elapsed / idle.duration) * Math.PI) ** 2 * 0.6;
        ctx.strokeStyle = this.options.surface === 'light' ? '#637c88' : '#c5dfef';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(spinneret.x, spinneret.y);
        ctx.quadraticCurveTo(
          (spinneret.x + anchor.x) / 2,
          (spinneret.y + anchor.y) / 2 + 4 * s,
          anchor.x,
          anchor.y,
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    const offset = this.bodyOffset();
    const torsoCos = Math.cos(this.angle);
    const torsoSin = Math.sin(this.angle);
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]!;
      const gripping = i === this.gripLeg;
      const localHipX = leg.side * (leg.row === 0 ? 7 : 5) * s;
      const localHipY = (-10 + leg.row * 7) * profile.torso * s;
      leg.hip.x =
        this.body.x +
        this.weightShift.x +
        this.lean.x +
        localHipX * torsoCos -
        localHipY * torsoSin;
      leg.hip.y =
        this.body.y +
        this.weightShift.y +
        this.lean.y +
        offset +
        localHipX * torsoSin +
        localHipY * torsoCos;
      // The distal joint tucks toward the body during swing; the toe remains
      // the contact endpoint rather than dragging the entire rigid leg around.
      const tuck = gripping ? 0 : leg.lift;
      const ankleX = -leg.side * (6 + tuck * 15) * s;
      const ankleY = (-(gripping ? 7 : 9) + tuck * (leg.row - 1.5) * 7) * s;
      leg.ankle.x = leg.foot.x + ankleX * torsoCos - ankleY * torsoSin;
      leg.ankle.y = leg.foot.y + ankleX * torsoSin + ankleY * torsoCos;
      const dx = leg.ankle.x - leg.hip.x;
      const dy = leg.ankle.y - leg.hip.y;
      const actual = Math.max(0.01, Math.hypot(dx, dy));
      // Solve in a raised bend plane, then project onto the page. A flat IK
      // elbow can only scissor sideways; elevation lets the knee fold upward
      // at mid-swing without stretching bones or changing planted contacts.
      const upper = (profile.upper + (leg.row % 2) * 5) * s;
      const lower = (profile.lower - leg.row * 2) * s;
      const height = (tuck * profile.stepLift - 16 * (1 - this.crouch * 0.3)) * s;
      const chord = Math.hypot(actual, height);
      const length = clamp(chord, Math.abs(upper - lower) + 0.01, upper + lower - 0.01);
      const along = (upper * upper - lower * lower + length * length) / (2 * length);
      const perpendicular = Math.sqrt(Math.max(0, upper * upper - along * along));
      const bend = leg.side * (leg.row < 2 ? 1 : -1);
      const elevation = 0.45 + tuck * 0.85;
      const lateral = Math.cos(elevation) * perpendicular * bend;
      const raised = Math.sin(elevation) * perpendicular;
      const radial = (actual / chord) * along - (height / chord) * raised;
      leg.knee.x = leg.hip.x + (dx / actual) * radial - (dy / actual) * lateral;
      leg.knee.y = leg.hip.y + (dy / actual) * radial + (dx / actual) * lateral;
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
    ctx.translate(
      this.body.x + this.weightShift.x + this.lean.x,
      this.body.y + this.weightShift.y + this.lean.y + offset,
    );
    ctx.rotate(this.angle);
    ctx.scale(s, s);
    const torso = profile.torso;
    const kind = this.options.personality;
    ctx.fillStyle = 'rgba(5, 13, 24, 0.97)';
    ctx.strokeStyle = '#79f5df';
    ctx.lineWidth = 1.15;
    if (kind === 'curious') {
      // Widow: globular abdomen, a narrow waist, small purposeful head.
      ctx.beginPath();
      ctx.ellipse(0, 18, 15, 18, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#e78fff';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(3, 18, 8, 16, -0.12, -0.8, 1.6);
      ctx.stroke();
      ctx.strokeStyle = '#79f5df';
      ctx.beginPath();
      ctx.ellipse(0, -4, 7, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ed97ff';
      ctx.beginPath();
      ctx.moveTo(-4, 13);
      ctx.lineTo(4, 13);
      ctx.lineTo(-4, 25);
      ctx.lineTo(4, 25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#caffdf';
      this.dot(-5, 7, 0.9);
      this.dot(5, 7, 0.9);
    } else if (kind === 'dreamy') {
      // Orb-weaver: broad rounded abdomen and soft radial fibers.
      ctx.save();
      ctx.translate(0, 15);
      ctx.rotate(this.idleSway);
      ctx.translate(0, -15);
      ctx.beginPath();
      ctx.ellipse(0, 15, 21, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ae9fff';
      ctx.lineWidth = 0.75;
      const fibers = (this.options.quality ?? 0) >= 2 ? 14 : 28;
      for (let i = 0; i < fibers; i++) {
        const a = (i * Math.PI * 2) / fibers,
          ripple = 3 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 20, 15 + Math.sin(a) * 23);
        ctx.lineTo(Math.cos(a) * (21 + ripple), 15 + Math.sin(a) * (24 + ripple));
        ctx.stroke();
      }
      ctx.strokeStyle = '#9affd5';
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * 9, 2);
        ctx.quadraticCurveTo(i * 13, 15, i * 8, 30);
      }
      ctx.stroke();
      ctx.fillStyle = '#ccadff';
      this.dot(0, 10, 2);
      this.dot(0, 21, 1.5);
      ctx.restore();
      ctx.fillStyle = '#071323';
      ctx.strokeStyle = '#9affdf';
      ctx.beginPath();
      ctx.ellipse(0, -7, 9, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Jumping spider: short segmented abdomen and a broad binocular face.
      ctx.beginPath();
      ctx.roundRect(-8, 3, 16, 19, 7);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#baff88';
      ctx.lineWidth = 0.8;
      for (const y of [9, 14, 19]) {
        ctx.beginPath();
        ctx.moveTo(-5, y);
        ctx.lineTo(5, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#071323';
      ctx.strokeStyle = '#79f5df';
      ctx.beginPath();
      ctx.roundRect(-11, -12, 22, 19, 6);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#de92ff';
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.lineTo(-10, 13);
      ctx.moveTo(7, 4);
      ctx.lineTo(10, 13);
      ctx.stroke();
    }

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
      const eyeX = side * (profile.eyeSize + (this.options.personality === 'curious' ? 1.9 : 1.15));
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
      if (this.options.personality === 'curious') {
        this.dot(side * 2, 3.5, 0.85);
        this.dot(side * 6, 4, 0.7);
      }
      if (this.options.personality === 'dreamy') {
        ctx.strokeStyle = '#081521';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(eyeX - profile.eyeSize, -4.1);
        ctx.lineTo(eyeX + profile.eyeSize, -4.1);
        ctx.stroke();
      }
    }
    // Jointed palps move with attention and scuttle compression, without moving contacts.
    for (const side of [-1, 1]) {
      const lively = this.options.personality === 'feral';
      const pinch =
        (this.options.reducedMotion ? 0 : this.idlePalps * side) +
        this.alert * (lively ? 1.5 : 0.8);
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
    ctx.shadowBlur =
      this.options.selector && !this.options.reducedMotion && !this.options.quality ? 4 : 0;
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
    this.canvas.dataset.rig = JSON.stringify(this.diagnostics);
  }

  private bodyOffset(): number {
    if (this.options.reducedMotion) return 0;
    const feral = this.options.personality === 'feral';
    // Springy scuttle elevation is small; support feet remain planted throughout.
    return (this.crouch * (feral ? 3.6 : 1.8) - this.suspension) * this.scale - this.hopHeight;
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
    ctx.shadowBlur = active && !this.options.quality ? 4.5 : 0;
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
    const settling = phase === 'settle';
    if (settling && (quiet || p >= 0.65)) return;
    const fade = settling ? 1 - smooth(p / 0.65) : 1;
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
    ctx.globalAlpha = (this.options.surface === 'light' ? 0.65 : 0.45) * fade;
    ctx.strokeStyle = '#070d1a';
    ctx.lineWidth = 3.5;
    this.brackets(left, top, right, bottom, arm);
    ctx.stroke();
    ctx.globalAlpha = (scan ? 0.72 : 0.92) * fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = strike ? 1.55 : 1.25;
    ctx.stroke();
    ctx.globalAlpha = (quiet ? 0.32 : scan ? 0.28 : 0.44) * fade;
    ctx.lineWidth = 0.65;
    ctx.setLineDash(scan ? [2, 5] : []);
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.setLineDash([]);
    // Fine external ticks make the lock read as a measured area, without covering the text.
    ctx.globalAlpha = 0.75 * fade;
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
      ctx.globalAlpha = 0.88 * fade;
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
    if (!quiet && !settling) {
      const sweep = mix(
        0.5 - 0.5 * Math.cos(p * Math.PI * 4),
        0.5,
        smooth(clamp((p - 0.72) / 0.28, 0, 1)),
      );
      const aim = selector.aim ?? {
        x: scan ? mix(rect.x, rect.x + rect.width, sweep) : cx,
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
      ctx.lineWidth = strike ? 1.15 : scan ? 0.8 : 0.55;
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
