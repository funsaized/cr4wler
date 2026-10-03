import { Spider, type Point, type SpiderOptions } from './spider';
import {
  scanTargets,
  targetAtPoint,
  targetIdentity,
  eligible,
  fresh,
  valid,
  focusText,
  targetRect,
  materialEligible,
  type Target,
} from './targets';
import { huntProfiles } from './hunt-profiles';
import { RuntimeQuality } from './runtime-quality';
import { PageSurfaces } from './surfaces';
import { BITMAP_PIXEL_LIMIT, readMaterial } from './materials';
import { materialGeometry, materialExtent } from './paint-geometry';
import { defaults, settingsFrom, type Settings, type Status } from './types';
import {
  layoutShards,
  mount,
  rebuild,
  place,
  paint,
  draw,
  gripPosition,
  type Projection,
  type Clip,
} from './effects';

const RECORD_LIMIT = 512;
const DOM_LIMIT = 72;
const MARGIN = 150;
const darkColors = ['#66eaff', '#ff8ccc', '#bd9bff', '#ffb273', '#8effd1'];
const lightColors = ['#00768c', '#ad256a', '#6541b8', '#ae4a15', '#117153'];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
type Mode =
  | 'arrive'
  | 'scan'
  | 'notice'
  | 'investigate'
  | 'lock'
  | 'prepare'
  | 'strike'
  | 'settle'
  | 'aftermath'
  | 'recover';
interface Fragment extends Projection {
  sourceMasked?: boolean;
  documentX: number;
  documentY: number;
  sourceWidth: number;
  sourceHeight: number;
  intensity: number;
  clips: HTMLElement[];
  liveScroll: boolean;
  layoutDirty: boolean;
  strikeDuration: number;
  strikeElapsed: number;
  settleDuration: number;
}
const styles = `
:host{all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;contain:strict!important;color-scheme:dark!important;display:block!important;}
*{box-sizing:border-box}canvas,.pieces{position:absolute;inset:0;pointer-events:none}canvas{width:100%;height:100%}.piece{position:absolute;display:block;transform-origin:0 50%;pointer-events:none;user-select:none;white-space:pre}.shard{position:absolute;display:block;left:0;top:0;white-space:pre;transform-origin:0 50%;text-shadow:.65px .65px 0 #07102225;pointer-events:none}
.dock{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;background:#10101cf2;color:#d9d9e9;border:1px solid #45425e;border-radius:100px;padding:10px 12px 10px 18px;box-shadow:0 8px 40px #0005;font:12px/1.4 system-ui,sans-serif;pointer-events:auto;white-space:nowrap}
.dot{width:6px;height:6px;border-radius:50%;background:#bdffa3;box-shadow:0 0 9px #bdffa355}.wordmark{font-weight:700;letter-spacing:.5px}.activity{color:#b3afc9;min-width:145px}button{font:inherit;cursor:pointer;color:#eeeefa;border:1px solid #45425e;background:#232132;border-radius:100px;padding:7px 12px}button:hover{border-color:#b6a7ff;background:#383148}button:focus-visible{outline:2px solid #b6ff96;outline-offset:3px}.restore{color:#baff9a}.tip{position:absolute;bottom:87px;left:50%;transform:translateX(-50%);max-width:90vw;color:#bbb7d0;background:#11121df2;border:1px solid #393448;padding:10px 18px;border-radius:9px;font:12px/1.5 system-ui,sans-serif;text-align:center}.hide{display:none}@media(max-width:600px){.activity{font-size:10px;min-width:0;max-width:145px;white-space:normal}.dock{gap:7px;padding-left:12px;max-width:96vw}.tip{width:86vw}.wordmark{font-size:11px}}
`;
export class Cr4wler {
  constructor(private readonly idleSeed?: number) {}
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private pieces: HTMLDivElement | null = null;
  private overflow: HTMLCanvasElement | null = null;
  private spider: Spider | null = null;
  private settings: Settings = { ...defaults };
  private abort = new AbortController();
  private raf = 0;
  private resizeDirty = false;
  private quality = new RuntimeQuality();
  private pageSurfaces = new PageSurfaces();
  private boundsRevision = 0;
  private boundsCache = new WeakMap<Target, number>();
  private nextBoundsCheck = 0;
  private discovery = new AbortController();
  private previous = 0;
  private time = 0;
  private paused = false;
  private hidden = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private targets: Target[] = [];
  private scanning = false;
  private nextScan = 0;
  private nextChoice = 0;
  private fragments: Fragment[] = [];
  private current: Fragment | null = null;
  private settling: Fragment | null = null;
  private candidate: Target | null = null;
  private candidateIntent: Target | null = null;
  private lockedContact: Point | null = null;
  private lockedRect: DOMRect | null = null;
  private candidateAge = 0;
  private candidateSource: 'hover' | 'autonomous' | '' = '';
  private candidateAt = 0;
  private scanRevision = 0;
  private hover: { target: Target; at: number; anchor: Point } | null = null;
  private hoverCommittedAt = -100;
  private pointerActive = false;
  private pointerDirty = false;
  private pointerMoved = false;
  private pointerIntent: Point = { x: -1000, y: -1000 };
  private pointerInputAnchor: Point | null = null;
  private pointerAt = 0;
  private pointerSpeed = 0;
  private pointerSafe = false;
  private blurred = false;
  private manualUntil = 0;
  private idleInputUntil = 0;
  private manualAnchor: Point | null = null;
  private edgeDirection = 0;
  private edgeProximity = 0;
  private edgeSince = 0;
  private edgeStarted = 0;
  private edgeDistance = 0;
  private edgeVelocity = 0;
  private edgeExhausted = false;
  private edgeAnchor: Point | null = null;
  private edgeScroller: Element | null = null;
  private edgeBounds = { top: 0, bottom: innerHeight };
  private ownScroll: { target: Element; top: number; left: number } | null = null;
  private phaseChangedAt = 0;
  private reportedPhase = '';
  private mode: Mode = 'arrive';
  private phaseTime = 0;
  private nextId = 1;
  private visibleCount = 0;
  private limitReached = false;
  private geometryDirty = false;
  private layoutDirty = false;
  private movedScrollers = new Set<EventTarget>();
  private destination: Point = { x: innerWidth * 0.62, y: innerHeight * 0.38 };
  private pointer: Point = { x: -1000, y: -1000 };
  private pointerSurfaceOffset: Point = { x: scrollX, y: scrollY };
  private nextTelemetry = 0;
  private surfaceOffset: Point = { x: scrollX, y: scrollY };
  private lastSpiderOptions: SpiderOptions | null = null;
  private surface: 'light' | 'dark' = 'dark';
  private highlight: Highlight | null = null;
  private selection: Highlight | null = null;
  private highlightName = `cr4wler-${crypto.randomUUID()}`;
  private maskAttribute = `data-cr4wler-mask-${crypto.randomUUID()}`;
  private materialMaskStyle: CSSStyleDeclaration | null = null;
  private highlightStyle: HTMLStyleElement | null = null;
  private observer: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private activity: HTMLElement | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private tip: HTMLElement | null = null;

  status(): Status {
    return {
      ...this.settings,
      active: !!this.host,
      paused: this.paused,
      reducedMotion: this.reduced.matches,
      fragments: this.fragments.length,
      visibleFragments: this.visibleCount,
      recordLimitReached: this.limitReached,
      phase: this.paused
        ? 'paused'
        : this.reduced.matches
          ? 'quiet'
          : this.limitReached && !this.current
            ? 'limit'
            : this.mode,
    };
  }
  configure(value: Partial<Settings>) {
    const followed = this.settings.followMouse;
    const previousType = this.settings.personality;
    this.settings = settingsFrom({ ...this.settings, ...value });
    if (followed !== this.settings.followMouse || previousType !== this.settings.personality)
      this.clearFollowIntent();
    if (
      previousType !== this.settings.personality &&
      this.spider &&
      this.lastSpiderOptions &&
      (this.paused || this.reduced.matches)
    ) {
      this.lastSpiderOptions = {
        ...this.lastSpiderOptions,
        ...this.settings,
        // A cancelled hover must not remain painted by this static type change.
        // An already committed paused impact keeps its owned footprint.
        selector: this.current ? this.lastSpiderOptions.selector : undefined,
        grip: this.current ? this.lastSpiderOptions.grip : undefined,
        attention: undefined,
        pointer: undefined,
        pursuing: false,
        idle: false,
      };
      this.spider.update(0, this.time, this.spider.position, this.lastSpiderOptions);
      this.spider.render();
    }
    this.updateActivity();
    return this.status();
  }
  summon(value?: Partial<Settings>) {
    this.configure(value ?? {});
    if (this.host) return this.status();
    this.abort = new AbortController();
    this.discovery = new AbortController();
    this.quality = new RuntimeQuality();
    this.pageSurfaces = new PageSurfaces();
    this.boundsCache = new WeakMap();
    this.nextBoundsCheck = 0;
    this.paused = false;
    this.hidden = document.hidden;
    this.time = this.phaseTime = this.previous = 0;
    this.mode = 'arrive';
    this.nextScan = this.nextChoice = this.nextTelemetry = 0;
    this.nextId = 1;
    this.limitReached = false;
    this.blurred = false;
    this.clearFollowIntent();
    this.manualUntil = 0;
    this.idleInputUntil = 0;
    this.pointerInputAnchor = null;
    this.manualAnchor = null;
    this.host = document.createElement('div');
    this.host.dataset.cr4wlerIgnore = '';
    this.host.dataset.cr4wlerRoot = '';
    this.root = this.host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = styles;
    this.root.append(css);
    this.overflow = document.createElement('canvas');
    this.overflow.className = 'aftermath-overflow';
    this.overflow.setAttribute('aria-hidden', 'true');
    this.root.append(this.overflow);
    this.pieces = document.createElement('div');
    this.pieces.className = 'pieces';
    this.pieces.setAttribute('aria-hidden', 'true');
    this.root.append(this.pieces);
    const canvas = document.createElement('canvas');
    canvas.className = 'visitor';
    canvas.setAttribute('aria-hidden', 'true');
    this.root.append(canvas);
    const dock = document.createElement('div');
    dock.className = 'dock';
    dock.setAttribute('role', 'region');
    dock.setAttribute('aria-label', 'Cr4wler controls');
    // This is our own static control markup, never page HTML.
    dock.innerHTML =
      '<span class="dot"></span><span class="wordmark">cr4wler</span><span class="activity">coming down…</span><button class="pause" type="button">Pause</button><button class="restore" type="button">Reset <span aria-hidden="true">↗</span></button>';
    this.root.append(dock);
    this.activity = dock.querySelector('.activity');
    this.pauseButton = dock.querySelector('.pause');
    this.tip = document.createElement('div');
    this.tip.className = 'tip';
    this.tip.textContent = this.reduced.matches
      ? 'Reduced motion is on. A quiet visitor. Reset or Esc restores the page.'
      : 'Tiny acts of mischief. The aftermath stays as you scroll. Reset or Esc removes the effects.';
    this.root.append(this.tip);
    document.documentElement.append(this.host);
    this.spider = new Spider(canvas, this.idleSeed);
    this.surfaceOffset = { x: scrollX, y: scrollY };
    this.lastSpiderOptions = null;
    this.surface = this.detectSurface(document.body);
    this.resize();
    if ('highlights' in CSS && typeof Highlight !== 'undefined') {
      this.highlight = new Highlight();
      this.selection = new Highlight();
      // Mask wins over our chromatic selection if a strike starts in this frame.
      this.highlight.priority = 2;
      this.selection.priority = 1;
      CSS.highlights.set(this.highlightName, this.highlight);
      CSS.highlights.set(`${this.highlightName}-selection`, this.selection);
      this.highlightStyle = document.createElement('style');
      this.highlightStyle.dataset.cr4wlerIgnore = '';
      this.highlightStyle.textContent = `::highlight(${this.highlightName}){color:transparent;text-shadow:none}::highlight(${this.highlightName}-selection){color:${this.palette()[0]};background-color:${this.palette()[0]}1f;text-shadow:none}[${this.maskAttribute}="owned"]{filter:opacity(0)!important}`;
      document.documentElement.append(this.highlightStyle);
      const rule = this.highlightStyle.sheet?.cssRules[2];
      this.materialMaskStyle = rule instanceof CSSStyleRule ? rule.style : null;
    }
    const signal = this.abort.signal;
    this.pauseButton?.addEventListener('click', () => this.pause(), { signal });
    dock.querySelector('.restore')?.addEventListener('click', () => this.restore(), { signal });
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') this.restore();
        else if (
          [
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'PageUp',
            'PageDown',
            'Home',
            'End',
            ' ',
            'Tab',
          ].includes(e.key)
        )
          this.manualNavigation();
      },
      { capture: true, signal },
    );
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch') return;
        this.onPointer(e.clientX, e.clientY);
      },
      { passive: true, signal },
    );
    window.addEventListener('wheel', () => this.manualNavigation(), { passive: true, signal });
    window.addEventListener('touchstart', () => this.manualNavigation(), { passive: true, signal });
    window.addEventListener('touchmove', () => this.manualNavigation(), { passive: true, signal });
    window.addEventListener(
      'pointerdown',
      (e) => {
        // Page controls and scrollbar drags belong to the page. The dock keeps
        // its existing Pause freeze semantics; no event is cancelled.
        if (!e.composedPath().includes(this.host!)) this.manualNavigation(false);
      },
      { passive: true, capture: true, signal },
    );
    document.documentElement.addEventListener('pointerleave', () => this.clearFollowIntent(), {
      passive: true,
      signal,
    });
    window.addEventListener(
      'pointerout',
      (e) => {
        if (!e.relatedTarget) this.clearFollowIntent();
      },
      { passive: true, signal },
    );
    window.addEventListener(
      'blur',
      () => {
        this.blurred = true;
        this.clearFollowIntent();
      },
      { signal },
    );
    window.addEventListener(
      'focus',
      () => {
        this.blurred = false;
      },
      { signal },
    );
    window.addEventListener(
      'resize',
      () => {
        this.resizeDirty = true;
        this.scheduleGeometry(true);
        this.invalidateScan();
      },
      { passive: true, signal },
    );
    window.addEventListener(
      'scroll',
      (e) => {
        if (e.target instanceof Element && e.target !== document.scrollingElement && !this.paused) {
          const own = this.ownScroll;
          if (
            !own ||
            own.target !== e.target ||
            own.top !== e.target.scrollTop ||
            own.left !== e.target.scrollLeft
          )
            this.manualNavigation(false);
        }
        if (e.target) this.movedScrollers.add(e.target);
        this.scheduleGeometry();
        this.invalidateScan();
        if (this.pointerActive) this.pointerDirty = true;
      },
      { passive: true, capture: true, signal },
    );
    window.visualViewport?.addEventListener(
      'resize',
      () => {
        this.resizeDirty = true;
        this.scheduleGeometry(true);
        this.invalidateScan();
      },
      { passive: true, signal },
    );
    window.visualViewport?.addEventListener('scroll', () => this.scheduleGeometry(), {
      passive: true,
      signal,
    });
    window.addEventListener('pagehide', () => this.restore(), { signal });
    document.addEventListener(
      'load',
      (event) => {
        if (
          event.target instanceof HTMLImageElement &&
          this.fragments.some((record) => record.target.element === event.target)
        )
          this.scheduleGeometry(true);
      },
      { capture: true, signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.hidden = document.hidden;
        if (this.hidden) {
          if (!this.paused) this.spider?.interruptIdle();
          this.clearFollowIntent();
          cancelAnimationFrame(this.raf);
          this.raf = 0;
          this.cancelDiscovery();
        } else {
          this.scheduleGeometry(true);
          this.resumeFrames();
        }
      },
      { signal },
    );
    this.reduced.addEventListener(
      'change',
      () => {
        this.clearFollowIntent();
        // Committed aftermath stays; only an uncommitted lock is abandoned.
        this.cancelCandidate();
        if (this.current) {
          this.current.progress = 1;
          this.current.settleProgress = 1;
          paint(this.current);
          this.current = null;
        }
        this.finishSettling();
        this.mode = 'scan';
        this.phaseTime = 0;
        this.scheduleGeometry();
        this.updateActivity();
        this.resumeFrames();
      },
      { signal },
    );
    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'contenteditable',
        'hidden',
        'aria-hidden',
        'aria-live',
        'inert',
        'popover',
        'data-cr4wler-ignore',
        'autocomplete',
        'id',
        'class',
        'role',
        'style',
        'open',
        'dir',
        'src',
        'srcset',
        'sizes',
        'type',
        'form',
      ],
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleGeometry(true));
      this.resizeObserver.observe(document.documentElement);
      if (document.body) this.resizeObserver.observe(document.body);
    }
    document.fonts?.addEventListener(
      'loadingdone',
      () => {
        // A replacement font can change glyph advances without changing the line's bounds.
        for (const record of this.fragments) record.layoutDirty = true;
        this.scheduleGeometry(true);
      },
      { signal },
    );
    this.updateActivity();
    this.resumeFrames();
    return this.status();
  }
  pause() {
    if (!this.host) return this.status();
    this.paused = !this.paused;
    this.clearFollowIntent(true);
    if (this.pauseButton) this.pauseButton.textContent = this.paused ? 'Resume' : 'Pause';
    this.updateActivity();
    if (this.paused) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.cancelDiscovery();
      if (this.geometryDirty) this.requestFrame();
    } else this.resumeFrames();
    return this.status();
  }
  restore() {
    this.clearFollowIntent();
    this.scanRevision++;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cancelDiscovery();
    this.abort.abort();
    for (const record of this.fragments) this.unmaskMaterial(record);
    this.observer?.disconnect();
    this.observer = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.highlight?.clear();
    this.selection?.clear();
    if ('highlights' in CSS) {
      CSS.highlights.delete(this.highlightName);
      CSS.highlights.delete(`${this.highlightName}-selection`);
    }
    this.highlight = this.selection = null;
    this.highlightStyle?.remove();
    this.highlightStyle = null;
    this.materialMaskStyle = null;
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.pieces = null;
    this.overflow = null;
    this.spider = null;
    this.activity = this.pauseButton = this.tip = null;
    this.resizeDirty = false;
    this.boundsCache = new WeakMap();
    this.lastSpiderOptions = null;
    this.pageSurfaces.clear();
    this.targets = [];
    this.fragments = [];
    this.current = null;
    this.settling = null;
    this.candidate = null;
    this.candidateIntent = null;
    this.lockedContact = null;
    this.lockedRect = null;
    this.scanning = false;
    this.paused = false;
    this.visibleCount = 0;
    this.limitReached = false;
    this.geometryDirty = this.layoutDirty = false;
    this.movedScrollers.clear();
    this.mode = 'arrive';
    return this.status();
  }
  private palette() {
    return this.surface === 'light' ? lightColors : darkColors;
  }
  private detectSurface(element: HTMLElement | null): 'light' | 'dark' {
    for (let current = element; current; current = current.parentElement) {
      const color = getComputedStyle(current).backgroundColor;
      const values = color.match(/[\d.]+/g)?.map(Number);
      if (!values || values.length < 3 || (values.length === 4 && values[3] < 0.5)) continue;
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 135 ? 'light' : 'dark';
    }
    return 'light';
  }
  private resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.spider?.resize(innerWidth, innerHeight, dpr);
    if (this.overflow) {
      this.overflow.width = Math.round(innerWidth * dpr);
      this.overflow.height = Math.round(innerHeight * dpr);
    }
    this.destination.x = clamp(this.destination.x, 70, Math.max(70, innerWidth - 70));
    this.destination.y = clamp(this.destination.y, 110, Math.max(110, innerHeight - 150));
    this.spider?.render();
  }
  private requestFrame() {
    if (!this.raf && !this.hidden && this.host) this.raf = requestAnimationFrame(this.frame);
  }
  private resumeFrames() {
    this.previous = performance.now();
    if (!this.paused || this.reduced.matches || this.geometryDirty) this.requestFrame();
  }
  private cancelDiscovery() {
    this.discovery.abort();
    this.discovery = new AbortController();
    this.scanning = false;
  }
  private targetFresh(target: Target) {
    if (!valid(target)) return false;
    if (this.boundsCache.get(target) !== this.boundsRevision) {
      const supported =
        target.material && target.material !== 'text'
          ? this.readUnmaskedMaterials(() => fresh(target))
          : fresh(target);
      if (supported) this.boundsCache.set(target, this.boundsRevision);
      return supported;
    }
    const r = target.rect;
    return (
      r.width > 12 &&
      r.height > (target.material === 'rule' ? 0 : 5) &&
      r.top >= 6 &&
      r.bottom <= innerHeight - 6 &&
      r.left >= 0 &&
      r.right <= innerWidth
    );
  }
  private invalidateScan() {
    this.scanRevision++;
    this.targets = [];
    this.nextScan = Math.min(this.nextScan, this.time + 0.22);
  }
  private cancelCandidate() {
    this.selection?.clear();
    this.candidate = null;
    this.candidateIntent = null;
    this.lockedContact = null;
    this.lockedRect = null;
    this.candidateSource = '';
    this.candidateAge = 0;
    if (['notice', 'investigate', 'lock', 'prepare'].includes(this.mode)) {
      this.mode = 'scan';
      this.phaseTime = 0;
    }
  }
  private release(record: Fragment) {
    if (this.settling === record) {
      this.settling = null;
      if (this.mode === 'settle') this.mode = 'scan';
    }
    this.unmaskMaterial(record);
    this.highlight?.delete(record.target.range);
    record.el?.remove();
    record.el = null;
    this.fragments = this.fragments.filter((f) => f !== record);
    if (!this.fragments.some((f) => f.target.node === record.target.node))
      this.pageSurfaces.unmask(record.target.node);
    if (!this.fragments.some((f) => f.target.element === record.target.element))
      this.resizeObserver?.unobserve(record.target.element);
    if (this.current === record) {
      this.current = null;
      this.mode = 'scan';
      this.phaseTime = 0;
    }
  }
  private bitmapPixels(except?: Fragment): number {
    return this.fragments.reduce((sum, record) => {
      const bitmap = record === except ? undefined : record.materialPaint?.bitmap;
      return sum + (bitmap ? bitmap.width * bitmap.height : 0);
    }, 0);
  }
  private unmaskMaterial(record: Fragment) {
    if (record.sourceMasked && record.target.element.getAttribute(this.maskAttribute) === 'owned')
      record.target.element.removeAttribute(this.maskAttribute);
    if (record.sourceMasked) this.pageSurfaces.unmask(record.target.node);
    record.sourceMasked = false;
  }
  /** Inspect author paint without our overriding filter. Only that owned rule
   * changes; text highlights stay active and source attributes/styles stay intact. */
  private readUnmaskedMaterials<T>(read: () => T): T {
    const style = this.materialMaskStyle;
    const filter = style?.getPropertyValue('filter');
    if (!style || !filter || !this.fragments.some((record) => record.sourceMasked)) return read();
    const priority = style.getPropertyPriority('filter');
    style.removeProperty('filter');
    try {
      return read();
    } finally {
      style.setProperty('filter', filter, priority);
    }
  }
  private maskMaterial(record: Fragment) {
    if (!record.target.material || record.target.material === 'text') return;
    if (!record.materialPaint?.bitmap && record.target.material !== 'rule') {
      this.unmaskMaterial(record);
      return;
    }
    if (!record.sourceMasked) {
      record.target.element.setAttribute(this.maskAttribute, 'owned');
      record.sourceMasked = true;
      this.pageSurfaces.mask(record.target.node);
    }
  }
  private onMutations(records: MutationRecord[]) {
    if (!this.host?.isConnected) {
      this.restore();
      return;
    }
    const relevant = records.filter((r) => {
      if (r.target === this.highlightStyle || this.host?.contains(r.target)) return false;
      const element = r.target instanceof Element ? r.target : r.target.parentElement;
      if (!element?.closest('[data-cr4wler-ignore]')) return true;
      // Ignore opted-out control counters, but immediately notice an existing source
      // acquiring an ignore boundary or being removed from one.
      return (
        this.fragments.some((f) => !f.target.node.isConnected || element.contains(f.target.node)) ||
        !!(
          this.candidate &&
          (!this.candidate.node.isConnected || element.contains(this.candidate.node))
        )
      );
    });
    if (!relevant.length) return;
    for (const record of this.fragments) {
      const touched =
        !record.target.node.isConnected ||
        (!!record.target.material &&
          record.target.material !== 'text' &&
          relevant.some((r) => record.target.element.contains(r.target))) ||
        relevant.some((r) =>
          r.type === 'characterData'
            ? r.target === record.target.node
            : r.type === 'attributes'
              ? (r.target as Element).contains(record.target.element)
              : Array.from(r.removedNodes).some(
                  (node) => node === record.target.node || node.contains(record.target.node),
                ),
        );
      if (!touched) continue;
      if (!valid(record.target)) this.release(record);
      else record.layoutDirty = true;
    }
    if (
      this.candidate &&
      (!valid(this.candidate) ||
        relevant.some(
          (r) =>
            r.target === this.candidate!.node ||
            (r.target instanceof Element &&
              (r.target.contains(this.candidate!.element) ||
                this.candidate!.element.contains(r.target))),
        ))
    )
      this.cancelCandidate();
    if (this.hover && !valid(this.hover.target)) this.hover = null;
    if (this.pointerActive) this.pointerDirty = true;
    this.invalidateScan();
    this.scheduleGeometry(true);
  }
  private scheduleGeometry(reflow = false) {
    this.geometryDirty = true;
    this.layoutDirty ||= reflow;
    this.boundsRevision++;
    if (this.pointerActive) this.pointerDirty = true;
    // One event-driven frame also keeps paused damage attached to the document.
    this.requestFrame();
  }
  private anchorTraits(
    element: HTMLElement,
    object = false,
  ): { clips: HTMLElement[]; liveScroll: boolean } {
    const clips: HTMLElement[] = [];
    let liveScroll = false;
    for (
      let current: HTMLElement | null = element;
      current && current !== document.documentElement;
      current = current.parentElement
    ) {
      const style = getComputedStyle(current);
      liveScroll ||= style.position === 'fixed' || style.position === 'sticky';
      if (
        current !== document.body &&
        (!object || current !== element) &&
        /auto|scroll|hidden|clip/.test(`${style.overflowX} ${style.overflowY}`)
      )
        clips.push(current);
    }
    return { clips, liveScroll };
  }
  private clipFor(record: Fragment, cache: Map<Element, DOMRect>): Clip {
    const clip: Clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (const ancestor of record.clips) {
      let rect = cache.get(ancestor);
      if (!rect) {
        rect = ancestor.getBoundingClientRect();
        cache.set(ancestor, rect);
      }
      clip.left = Math.max(clip.left, rect.left + ancestor.clientLeft);
      clip.top = Math.max(clip.top, rect.top + ancestor.clientTop);
      clip.right = Math.min(clip.right, rect.left + ancestor.clientLeft + ancestor.clientWidth);
      clip.bottom = Math.min(clip.bottom, rect.top + ancestor.clientTop + ancestor.clientHeight);
    }
    return clip;
  }
  private refreshGeometry() {
    this.readUnmaskedMaterials(() => this.readGeometry());
  }
  private readGeometry() {
    if (!this.pieces || !this.overflow) return;
    const reflow = this.layoutDirty;
    this.layoutDirty = this.geometryDirty = false;
    const clipCache = new Map<Element, DOMRect>();
    const visible: Fragment[] = [];
    const rebuilds = new Set<Fragment>();
    const removed: Fragment[] = [];
    const unmount: Fragment[] = [];
    const scrollers = [...this.movedScrollers];
    for (const record of this.fragments) {
      if (
        !record.target.node.isConnected ||
        (record.target.material && record.target.material !== 'text' && !valid(record.target))
      ) {
        removed.push(record);
        continue;
      }
      let rect = new DOMRect(
        record.documentX - scrollX,
        record.documentY - scrollY,
        record.sourceWidth,
        record.sourceHeight,
      );
      const nearby =
        rect.bottom >= -MARGIN &&
        rect.top <= innerHeight + MARGIN &&
        rect.right >= -MARGIN &&
        rect.left <= innerWidth + MARGIN;
      const scrolled = scrollers.some(
        (node) => node instanceof Element && node.contains(record.target.element),
      );
      if (reflow || record.layoutDirty || record.liveScroll || nearby || scrolled) {
        if (
          record.target.material &&
          record.target.material !== 'text' &&
          !materialGeometry(record.target.element)
        ) {
          removed.push(record);
          continue;
        }
        rect = targetRect(record.target);
        if (
          record.target.material &&
          record.target.material !== 'text' &&
          !materialExtent(rect, record.target.material === 'rule')
        ) {
          removed.push(record);
          continue;
        }
        record.documentX = rect.x + scrollX;
        record.documentY = rect.y + scrollY;
      }
      record.target.rect = rect;
      this.boundsCache.set(record.target, this.boundsRevision);
      if (reflow || record.layoutDirty)
        Object.assign(
          record,
          this.anchorTraits(
            record.target.element,
            !!record.target.material && record.target.material !== 'text',
          ),
        );
      record.clip = this.clipFor(record, clipCache);
      // A scroller hiding the source must hide its projection too, even if the scar extends out.
      const shown =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > record.clip.top &&
        rect.top < record.clip.bottom &&
        rect.right > record.clip.left &&
        rect.left < record.clip.right;
      if (shown) {
        const resized =
          Math.abs(rect.width - record.sourceWidth) > 0.5 ||
          Math.abs(rect.height - record.sourceHeight) > 0.5;
        if (resized && record.impact) {
          record.impact.x *= rect.width / Math.max(1, record.sourceWidth);
          record.impact.y *= rect.height / Math.max(1, record.sourceHeight);
        }
        if (reflow || record.layoutDirty || resized || !record.shards.length) {
          const style = getComputedStyle(record.target.element);
          const typographyChanged =
            record.target.font !== style.font ||
            record.target.letterSpacing !== style.letterSpacing;
          record.target.font = style.font;
          record.target.letterSpacing = style.letterSpacing;
          if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') {
            unmount.push(record);
            continue;
          }
          if (record.layoutDirty || resized || typographyChanged || !record.shards.length) {
            if (
              record.target.material &&
              record.target.material !== 'text' &&
              !record.materialPaint?.fallback
            )
              record.materialPaint = readMaterial(
                record.target,
                BITMAP_PIXEL_LIMIT - this.bitmapPixels(record),
                record.impact,
              );
            record.shards = layoutShards(record, record.intensity);
            rebuilds.add(record);
          }
          record.layoutDirty = false;
        }
        visible.push(record);
      } else {
        record.layoutDirty ||= reflow;
        unmount.push(record);
      }
      record.sourceWidth = rect.width;
      record.sourceHeight = rect.height;
    }
    // Complete all source and clip reads before touching projection DOM.
    if (this.candidate) {
      if (!this.candidateFresh()) this.cancelCandidate();
      else this.targetDestination(this.candidate);
    }
    for (const record of removed) this.release(record);
    for (const record of unmount) {
      record.el?.remove();
      record.el = null;
    }
    for (const record of rebuilds) rebuild(record);
    for (const record of visible) this.maskMaterial(record);
    this.movedScrollers.clear();
    this.visibleCount = visible.length;
    // Active impact and settling retain DOM projections; excess *visible* settled effects
    // retain their exact geometry on the shared canvas instead of being discarded.
    if (this.settling && visible.includes(this.settling)) {
      visible.splice(visible.indexOf(this.settling), 1);
      visible.unshift(this.settling);
    }
    if (this.current && visible.includes(this.current)) {
      visible.splice(visible.indexOf(this.current), 1);
      visible.unshift(this.current);
    }
    const ctx = this.overflow.getContext('2d');
    if (ctx) {
      const dpr = Math.min(devicePixelRatio, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    visible.forEach((record, index) => {
      if (index < DOM_LIMIT) {
        if (!record.el) mount(record, this.pieces!);
        place(record);
      } else {
        record.el?.remove();
        record.el = null;
        if (ctx) draw(record, ctx);
      }
    });
    this.updateActivity();
    if (this.paused || this.reduced.matches) {
      this.syncRestingSurface();
      this.spider?.render();
    }
  }
  /** A source point moves by the inverse document scroll in viewport coordinates. */
  private takeSurfaceDelta(): Point {
    const next = { x: scrollX, y: scrollY };
    const delta = { x: this.surfaceOffset.x - next.x, y: this.surfaceOffset.y - next.y };
    this.surfaceOffset = next;
    return delta;
  }
  private strikeGrip(record: Fragment): SpiderOptions['grip'] {
    return {
      point: gripPosition(record),
      progress: record.progress,
      color: record.color,
    };
  }
  /** Bounded page contacts share one read clock throughout a frame. */
  private readSurfaces(time = this.time, destination = this.destination) {
    if (!this.spider || this.reduced.matches) return [];
    return this.pageSurfaces.update(
      time,
      this.boundsRevision,
      this.spider.position,
      destination,
      this.spider.feet,
      this.spider.contactIds,
      this.spider.surfaceContacts,
    );
  }
  /** Paused geometry follows the page without advancing any gait clock. */
  private syncRestingSurface() {
    if (!this.spider || !this.lastSpiderOptions) return;
    const surfaceDelta = this.takeSurfaceDelta();
    const surfaces = this.readSurfaces();
    const record = this.current;
    const target = record?.target ?? this.candidate;
    this.spider.update(0, this.time, this.spider.position, {
      ...this.lastSpiderOptions,
      reducedMotion: this.reduced.matches,
      surfaceDelta,
      surfaces,
      grip: record
        ? this.strikeGrip(record)
        : this.candidate && this.mode === 'prepare'
          ? this.lastSpiderOptions.grip
          : undefined,
      selector:
        target && this.targetFresh(target) && this.lastSpiderOptions.selector
          ? {
              ...this.lastSpiderOptions.selector,
              rect: target.rect,
              aim: record ? gripPosition(record) : (this.lockedContact ?? undefined),
            }
          : undefined,
      attention: undefined,
      pointer: undefined,
      pursuing: false,
    });
  }
  private async scan() {
    if (this.scanning || this.limitReached || this.reduced.matches || !this.highlight) return;
    this.scanning = true;
    const signal = this.discovery.signal;
    const revision = this.scanRevision;
    const list = await scanTargets(signal);
    if (signal.aborted || !this.host) return;
    this.scanning = false;
    if (revision !== this.scanRevision) {
      this.nextScan = Math.min(this.nextScan, this.time + 0.1);
      return;
    }
    this.targets = list;
    this.nextScan = this.time + (list.length ? 3.2 : 1.1);
  }
  private occupied(target: Target) {
    return this.fragments.some((record) => {
      if (
        (record.target.material && record.target.material !== 'text') ||
        (target.material && target.material !== 'text')
      ) {
        return (
          record.target.element.contains(target.node) || target.element.contains(record.target.node)
        );
      }
      return (
        record.target.node === target.node &&
        record.target.range.startOffset < target.range.endOffset &&
        record.target.range.endOffset > target.range.startOffset
      );
    });
  }
  private choose() {
    this.nextChoice = this.time + huntProfiles[this.settings.personality].choice;
    if (this.settings.followMouse || this.limitReached || !this.highlight) return;
    const body = this.spider?.position ?? this.destination;
    const focus = body;
    // Use cached scan geometry for ranking. Only a bounded shortlist is remeasured.
    const shortlist = this.targets
      .filter((t) => !this.occupied(t))
      .map((target) => ({
        target,
        score:
          Math.hypot(target.rect.x + target.rect.width / 2 - focus.x, target.rect.y - focus.y) +
          Math.random() * 160,
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 16);
    for (const { target } of shortlist) {
      if (!this.targetFresh(target)) continue;
      this.selectCandidate(target, 'autonomous');
      return;
    }
    this.nextScan = Math.min(this.nextScan, this.time + 0.3);
  }
  private targetDestination(target: Target) {
    const centerX = target.rect.x + target.rect.width / 2;
    const right = centerX < innerWidth * 0.55;
    const compact = this.settings.personality === 'feral';
    const orb = this.settings.personality === 'dreamy';
    this.destination = {
      x: clamp(
        centerX + (right ? 1 : -1) * (compact ? 62 : orb ? 84 : 96),
        75,
        Math.max(75, innerWidth - 75),
      ),
      y: clamp(
        target.rect.y - (compact ? 46 : orb ? 65 : 75),
        105,
        Math.max(105, innerHeight - 145),
      ),
    };
  }
  /** Resolve the exact material footprint before the visible lock, never at impact. */
  private lockCandidate() {
    if (!this.candidate || !this.spider) return;
    this.candidate = focusText(
      this.candidate,
      this.settings.personality,
      clamp(this.spider.position.x, this.candidate.rect.left, this.candidate.rect.right),
    );
    this.lockedContact = this.contactFor(this.candidate);
    this.lockedRect = DOMRect.fromRect(this.candidate.rect);
    this.selection?.clear();
    if (!this.candidate.material || this.candidate.material === 'text')
      this.selection?.add(this.candidate.range);
    this.mode = 'lock';
    this.phaseTime = 0;
    this.updateActivity();
  }
  private contactFor(target: Target): Point {
    const body = this.spider?.position ?? this.destination;
    const contact = {
      x: clamp(body.x, target.rect.left, target.rect.right),
      y: clamp(body.y, target.rect.top, target.rect.bottom),
    };
    if (target.material === 'panel') {
      if (body.y <= target.rect.top || body.y >= target.rect.bottom)
        contact.x = clamp(body.x, target.rect.left + 20, target.rect.right - 20);
      else contact.y = clamp(body.y, target.rect.top + 20, target.rect.bottom - 20);
    }
    return contact;
  }
  private strike() {
    const target = this.candidate;
    if (!target || !fresh(target) || this.occupied(target) || !this.highlight) {
      this.cancelCandidate();
      this.mode = 'scan';
      return;
    }
    if (this.fragments.length >= RECORD_LIMIT) {
      this.limitReached = true;
      this.cancelCandidate();
      this.updateActivity();
      return;
    }
    const id = this.nextId++;
    const body = this.spider?.position ?? this.destination;
    const contact = this.lockedContact ?? this.contactFor(target);
    const distance = Math.max(1, Math.hypot(body.x - contact.x, body.y - contact.y));
    const record: Fragment = {
      id,
      target,
      effect:
        huntProfiles[this.settings.personality].effects[
          (id - 1) % huntProfiles[this.settings.personality].effects.length
        ],
      strikeDuration: huntProfiles[this.settings.personality].strike,
      strikeElapsed: 0,
      settleDuration: huntProfiles[this.settings.personality].settle,
      settleProgress: 0,
      color: target.color,
      accent: target.color,
      personality: this.settings.personality,
      impact: {
        x: contact.x - target.rect.x,
        y: contact.y - target.rect.y,
        dx: (body.x - contact.x) / distance,
        dy: (body.y - contact.y) / distance,
      },
      shards: [],
      progress: 0,
      el: null,
      clip: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
      documentX: target.rect.x + scrollX,
      documentY: target.rect.y + scrollY,
      sourceWidth: target.rect.width,
      sourceHeight: target.rect.height,
      intensity: this.settings.intensity,
      shardLimit: [16, 10, 6][this.quality.level],
      layoutDirty: true,
      ...this.anchorTraits(target.element, !!target.material && target.material !== 'text'),
    };
    this.fragments.push(record);
    this.current = record;
    this.cancelCandidate();
    if (!target.material || target.material === 'text') this.highlight.add(target.range);
    if (!target.material || target.material === 'text') this.pageSurfaces.mask(target.node);
    this.resizeObserver?.observe(target.element);
    this.mode = 'strike';
    this.phaseTime = 0;
    if (this.fragments.length === RECORD_LIMIT) this.limitReached = true;
    // Commit mask and initial projection atomically before the next paint.
    this.refreshGeometry();
  }
  private followAvailable() {
    return (
      this.settings.followMouse &&
      !this.paused &&
      !this.hidden &&
      !this.blurred &&
      !this.reduced.matches
    );
  }
  private stopEdge() {
    this.edgeDirection = this.edgeProximity = this.edgeVelocity = 0;
    this.edgeSince = this.edgeStarted = this.edgeDistance = 0;
    this.edgeScroller = null;
    if (this.host) this.host.dataset.edgeVelocity = '0.0';
  }
  private clearFollowIntent(preserveCandidate = false) {
    this.pointerActive = this.pointerDirty = this.pointerMoved = false;
    this.hover = null;
    this.pointerAt = this.pointerSpeed = 0;
    this.pointerSafe = false;
    this.ownScroll = null;
    this.edgeExhausted = false;
    this.edgeAnchor = null;
    this.stopEdge();
    if (!preserveCandidate && this.candidateSource === 'hover') this.cancelCandidate();
    if (!this.candidate) this.selection?.clear();
    this.updateActivity();
  }
  private manualNavigation(explicit = true) {
    this.idleInputUntil = this.time + 3.5;
    if (!this.paused) this.spider?.interruptIdle();
    this.clearFollowIntent();
    this.cancelCandidate();
    this.manualUntil = Math.max(this.manualUntil, performance.now() + (explicit ? 850 : 0));
    this.manualAnchor = { ...this.pointer };
    this.updateActivity();
  }
  private edgeZone() {
    const { top, bottom } = this.edgeBounds;
    const zone = Math.min(84, Math.max(24, (bottom - top) * 0.1));
    if (this.pointer.y < top + zone)
      return { direction: -1, proximity: 1 - (this.pointer.y - top) / zone };
    if (this.pointer.y > bottom - zone)
      return { direction: 1, proximity: 1 - (bottom - this.pointer.y) / zone };
    return { direction: 0, proximity: 0 };
  }
  private onPointer(x: number, y: number) {
    this.pointer = { x, y };
    this.pointerSurfaceOffset = { x: scrollX, y: scrollY };
    // Classify cumulative movement once, independently of following/manual
    // intent. Tremor keeps raw head attention without restarting quiet idle.
    const meaningful =
      !this.pointerInputAnchor ||
      Math.hypot(x - this.pointerInputAnchor.x, y - this.pointerInputAnchor.y) >= 3;
    if (meaningful) {
      this.pointerInputAnchor = { x, y };
      this.idleInputUntil = this.time + 3.5;
      if (!this.paused) this.spider?.interruptIdle();
    }
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
      this.clearFollowIntent();
      return;
    }
    if (!this.followAvailable()) return;
    const now = performance.now();
    if (
      now < this.manualUntil ||
      (this.manualAnchor && Math.hypot(x - this.manualAnchor.x, y - this.manualAnchor.y) < 12)
    )
      return;
    this.manualAnchor = null;
    // A cumulative 3px deadband prevents boundary tremor from restarting a hunt,
    // a speed burst or rearming cleared intent. Head attention sees raw position.
    if (!meaningful) {
      if (this.pointerActive) this.pointerDirty = true;
      return;
    }
    const distance = Math.hypot(x - this.pointerIntent.x, y - this.pointerIntent.y);
    this.pointerSpeed = this.pointerActive
      ? this.pointerSpeed * 0.45 +
        Math.min(2000, distance / Math.max(0.016, (now - this.pointerAt) / 1000)) * 0.55
      : 0;
    this.pointerAt = now;
    this.pointerIntent = { x, y };
    this.pointerActive = this.pointerDirty = this.pointerMoved = true;
  }
  private updateEdgeIntent(freshPointer: boolean, hit: HTMLElement | null) {
    let scrolling: Element | null = document.scrollingElement;
    if (hit) {
      // The nearest scrollable ancestor owns the whole visit, including its
      // boundary. Never spill a nested edge into document navigation.
      let depth = 0;
      let el: HTMLElement | null = hit;
      for (; el && el !== document.body && depth++ < 32; el = el.parentElement) {
        if (el.scrollHeight <= el.clientHeight + 1) continue;
        if (/auto|scroll/.test(getComputedStyle(el).overflowY)) {
          scrolling = el;
          break;
        }
      }
      // An exhausted local walk cannot certify document ownership. Stop rather
      // than scrolling past an uninspected ancestor's navigation boundary.
      if (el && el !== document.body && scrolling === document.scrollingElement) scrolling = null;
    }
    const rect =
      scrolling === document.scrollingElement ? null : scrolling?.getBoundingClientRect();
    this.edgeBounds = {
      top: Math.max(0, rect?.top ?? 0),
      bottom: Math.min(innerHeight, rect?.bottom ?? innerHeight),
    };
    const zone = this.edgeZone();
    if (
      !hit ||
      !scrolling ||
      !zone.direction ||
      !this.followAvailable() ||
      this.current ||
      this.settling
    ) {
      this.stopEdge();
      if (!zone.direction) this.edgeExhausted = false;
      return;
    }
    if (this.edgeExhausted) {
      if (
        !freshPointer ||
        !this.edgeAnchor ||
        Math.hypot(this.pointer.x - this.edgeAnchor.x, this.pointer.y - this.edgeAnchor.y) < 16
      )
        return;
      this.edgeExhausted = false;
    }
    if (zone.direction !== this.edgeDirection || scrolling !== this.edgeScroller) {
      if (!freshPointer) return;
      this.stopEdge();
      this.edgeDirection = zone.direction;
      this.edgeScroller = scrolling;
      this.edgeSince = performance.now();
    }
    this.edgeProximity = clamp(zone.proximity, 0, 1);
  }
  private scrollEdge(dt: number) {
    if (this.edgeDirection && performance.now() - this.pointerAt > 3000) {
      this.clearFollowIntent();
      return;
    }
    if (
      !this.pointerActive ||
      !this.followAvailable() ||
      !this.edgeDirection ||
      this.edgeExhausted ||
      !this.edgeScroller?.isConnected ||
      performance.now() - this.pointerAt > 3000 ||
      this.current ||
      this.settling
    ) {
      this.stopEdge();
      return;
    }
    if (this.mode === 'recover') {
      this.edgeVelocity = 0;
      return;
    }
    const now = performance.now();
    if (now - this.edgeSince < 240) return;
    if (!this.edgeStarted) this.edgeStarted = now;
    const scrolling = this.edgeScroller;
    const room =
      this.edgeDirection < 0
        ? scrolling.scrollTop
        : Math.max(0, scrolling.scrollHeight - scrolling.clientHeight - scrolling.scrollTop);
    // One deliberate edge visit is bounded in both time and distance. Re-arm by
    // leaving/re-entering, or moving at least 16px after the edge crawl rests.
    if (room < 1 || now - this.edgeStarted >= 6000 || this.edgeDistance >= 1800) {
      this.stopEdge();
      this.edgeExhausted = true;
      this.edgeAnchor = { ...this.pointer };
      this.updateActivity();
      return;
    }
    const desired = this.edgeDirection * 440 * this.edgeProximity * this.edgeProximity;
    this.edgeVelocity += (desired - this.edgeVelocity) * (1 - Math.exp(-dt * 7));
    const distance =
      this.edgeDirection *
      Math.min(Math.abs(this.edgeVelocity * dt), room, 1800 - this.edgeDistance);
    const before = scrolling.scrollTop;
    // Explicit instant scrolling cannot queue browser smooth-scroll animations.
    scrolling.scrollBy({ top: distance, left: 0, behavior: 'instant' });
    this.ownScroll = { target: scrolling, top: scrolling.scrollTop, left: scrolling.scrollLeft };
    this.edgeDistance += Math.abs(scrolling.scrollTop - before);
    if (scrolling.scrollTop !== before) {
      this.scheduleGeometry();
      this.pointerDirty = true;
    }
  }
  private selectCandidate(target: Target, source: 'hover' | 'autonomous') {
    this.candidate = target;
    this.candidateIntent = target;
    this.lockedContact = null;
    this.lockedRect = null;
    this.candidateSource = source;
    this.candidateAt = performance.now();
    this.candidateAge = 0;
    this.phaseTime = 0;
    this.mode = 'notice';
    this.surface = this.detectSurface(target.element);
    this.targetDestination(target);
    this.selection?.clear();
    if (!target.material || target.material === 'text') this.selection?.add(target.range);
    this.updateActivity();
  }
  private updateHover() {
    if (!this.pointerActive || !this.followAvailable()) return;
    const profile = huntProfiles[this.settings.personality];
    if (this.pointerDirty) {
      this.pointerDirty = false;
      const freshPointer = this.pointerMoved;
      this.pointerMoved = false;
      const hit = document.elementFromPoint(this.pointer.x, this.pointer.y);
      // Our dock is a control surface. Moving onto Pause must not abandon the
      // hunt before the button can freeze its clock.
      if (hit === this.host) {
        this.stopEdge();
        return;
      }
      const safe = hit instanceof HTMLElement && (eligible(hit) || materialEligible(hit));
      this.pointerSafe = safe;
      this.updateEdgeIntent(freshPointer, safe ? hit : null);
      // Resolve the exact hit before checking occupancy: destroyed text must not
      // redirect attention to another nearby, still-available range.
      const hitTarget =
        safe && !this.edgeDirection
          ? targetAtPoint(this.pointerIntent.x, this.pointerIntent.y, () => true)
          : null;
      const resolved = hitTarget && !this.occupied(hitTarget) ? hitTarget : null;
      const previous = this.hover;
      if (!resolved) {
        this.hover = null;
        this.cancelCandidate();
      } else {
        const same =
          previous?.target.element === resolved.element && previous.target.node === resolved.node;
        // Preserve one line while traversing its element; a distant line is fresh intent.
        const rect = previous && targetRect(previous.target);
        const close =
          rect &&
          Math.hypot(
            Math.max(rect.left - this.pointerIntent.x, 0, this.pointerIntent.x - rect.right),
            Math.max(rect.top - this.pointerIntent.y, 0, this.pointerIntent.y - rect.bottom),
          ) === 0;
        const target = same && close && valid(previous!.target) ? previous!.target : resolved;
        target.rect = targetRect(target);
        if (!same || !close) {
          this.scanRevision++;
          this.hover = { target, at: performance.now(), anchor: { ...this.pointerIntent } };
          // New attention cancels any uncommitted hunt before it can strike.
          if (this.candidate && this.candidateIntent !== target) this.cancelCandidate();
        } else {
          this.hover = previous;
          // Passing over a long line must offer the same short spatial stability
          // as passing over several elements. Jitter never resets this clock.
          if (
            !this.candidate &&
            previous &&
            Math.hypot(
              this.pointerIntent.x - previous.anchor.x,
              this.pointerIntent.y - previous.anchor.y,
            ) > 8
          ) {
            previous.at = performance.now();
            previous.anchor = { ...this.pointerIntent };
          }
        }
      }
      this.selection?.clear();
      const selection = this.current ? null : (this.candidate ?? this.hover?.target);
      if (
        selection &&
        (!selection.material || selection.material === 'text') &&
        !this.occupied(selection)
      )
        this.selection?.add(selection.range);
      this.updateActivity();
    }
    const intent = this.hover;
    if (
      !intent ||
      this.current ||
      this.mode === 'recover' ||
      this.limitReached ||
      !this.highlight ||
      this.occupied(intent.target)
    )
      return;
    if (this.candidateIntent === intent.target) return;
    if (
      performance.now() - intent.at < profile.hoverDwell * 1000 ||
      performance.now() - this.hoverCommittedAt < profile.retarget * 1000
    )
      return;
    if (!this.targetFresh(intent.target)) {
      this.hover = null;
      return;
    }
    this.hoverCommittedAt = performance.now();
    this.selectCandidate(intent.target, 'hover');
  }
  private updateActivity() {
    if (this.host) {
      const status = this.status();
      this.host.dataset.phase = status.phase;
      this.host.dataset.fragments = String(status.fragments);
      this.host.dataset.visibleFragments = String(status.visibleFragments);
      this.host.dataset.recordLimitReached = String(status.recordLimitReached);
      this.host.dataset.followMouse = String(this.settings.followMouse);
      const profile = huntProfiles[this.settings.personality];
      if (status.phase !== this.reportedPhase) {
        this.reportedPhase = status.phase ?? '';
        this.phaseChangedAt = performance.now();
      }
      this.host.dataset.phaseChangedAt = this.phaseChangedAt.toFixed(1);
      this.host.dataset.candidate = this.candidate ? targetIdentity(this.candidate) : '';
      this.host.dataset.candidateSource = this.candidateSource;
      this.host.dataset.candidateAt = this.candidateAt.toFixed(1);
      this.host.dataset.hoverTarget = this.hover ? targetIdentity(this.hover.target) : '';
      this.host.dataset.hoverIntentAt = this.hover?.at.toFixed(1) ?? '';
      this.host.dataset.hoverDwellMs = String(profile.hoverDwell * 1000);
      this.host.dataset.lockMs = String(profile.lock * 1000);
      this.host.dataset.anticipationMs = String(profile.anticipation * 1000);
      this.host.dataset.settleMs = String(profile.settle * 1000);
      this.host.dataset.strikeMs = String(profile.strike * 1000);
      this.host.dataset.strikeRecord = this.current ? String(this.current.id) : '';
      this.host.dataset.strikeTarget = this.current ? targetIdentity(this.current.target) : '';
      this.host.dataset.edgeVelocity = this.edgeVelocity.toFixed(1);
      this.host.dataset.edgeState = this.manualAnchor
        ? 'manual'
        : this.edgeExhausted
          ? 'rest'
          : this.edgeDirection
            ? this.edgeVelocity
              ? 'scrolling'
              : 'dwell'
            : 'idle';
      this.host.dataset.edgeDirection = String(this.edgeDirection);
      this.host.dataset.pointerActive = String(this.pointerActive);
      this.host.dataset.personality = this.settings.personality;
    }
    if (!this.activity) return;
    this.activity.textContent = this.limitReached
      ? '512 marks · Reset to explore again'
      : this.paused
        ? `${this.fragments.length} marks · paused`
        : this.reduced.matches
          ? 'quiet company'
          : !this.highlight
            ? 'quiet visitor · highlights unavailable'
            : this.edgeVelocity
              ? 'edge crawl · move inward to stop'
              : this.mode === 'recover'
                ? 'finding its feet…'
                : this.mode === 'arrive'
                  ? 'coming down…'
                  : this.mode === 'lock'
                    ? 'target locked'
                    : this.mode === 'prepare'
                      ? 'readying its front claw…'
                      : this.mode === 'settle'
                        ? 'letting the fragments settle…'
                        : this.mode === 'strike'
                          ? `${this.current?.effect ?? 'type'} in progress`
                          : this.candidate
                            ? this.mode === 'notice'
                              ? 'something caught its eye…'
                              : 'investigating…'
                            : this.settings.followMouse
                              ? `${this.fragments.length} marks · hover to choose`
                              : `${this.fragments.length} marks · exploring`;
  }
  private beginRecovery(delta: Point) {
    if (!this.spider) return;
    this.cancelCandidate();
    this.hover = null;
    this.selection?.clear();
    this.finishSettling();
    if (this.current) {
      // Finish the already committed mark in place; release its offscreen contact.
      this.current.progress = 1;
      this.current.settleProgress = 1;
      paint(this.current);
      this.current = null;
    }
    this.mode = 'recover';
    this.phaseTime = 0;
    this.invalidateScan();
    this.nextChoice = this.time + 0.12;
    const p = this.spider.position;
    this.destination = {
      x: clamp(p.x, 110, Math.max(110, innerWidth - 110)),
      y: clamp(p.y + Math.sign(delta.y) * 90, 125, Math.max(125, innerHeight - 160)),
    };
    this.spider.recover(this.destination, this.paused || this.reduced.matches);
    this.updateActivity();
  }
  private candidateFresh() {
    if (!this.candidate || !this.targetFresh(this.candidate)) return false;
    const a = this.lockedRect,
      b = this.candidate.rect;
    // Moving/reflowing a locked footprint requires a new investigation.
    return (
      !a ||
      Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.width - b.width),
        Math.abs(a.height - b.height),
      ) <= 0.5
    );
  }
  private finishSettling() {
    if (!this.settling) return;
    this.settling.settleProgress = 1;
    paint(this.settling);
    this.settling = null;
  }
  private frame = (now: number) => {
    this.raf = 0;
    if (!this.host || !this.spider || this.hidden) return;
    // Every surface read in this frame uses one clock, including after physics
    // time advances. Otherwise the polling boundary can be crossed twice.
    const surfaceTime = this.time;
    // CSS animation fallback shares the same read phase as event invalidations.
    if (!this.paused && !this.reduced.matches && this.time >= this.nextBoundsCheck) {
      this.nextBoundsCheck = this.time + 0.15;
      this.boundsRevision++;
      // Owned material snapshots also need the CSS-animation safety fallback.
      if (this.fragments.some((record) => record.sourceMasked)) this.geometryDirty = true;
      if (this.pointerActive) this.pointerDirty = true;
    }
    this.readSurfaces(surfaceTime);
    if (this.resizeDirty) {
      this.resizeDirty = false;
      this.resize();
    }
    if (this.geometryDirty) this.refreshGeometry();
    if (this.paused && !this.reduced.matches) return;
    if (!this.host.isConnected) {
      this.restore();
      return;
    }
    const elapsed = Math.max(0, (now - this.previous) / 1000);
    const dt = Math.min(elapsed, 0.033);
    if (!this.reduced.matches) this.quality.sample(elapsed * 1000);
    const strikeAtFrameStart = this.current;
    this.previous = now;
    const quiet = this.reduced.matches;
    if (!quiet && !this.paused) {
      this.time += dt;
      this.phaseTime += dt;
    }
    if (this.time > 9) this.tip?.classList.add('hide');
    if (
      !quiet &&
      !this.paused &&
      !this.limitReached &&
      !this.settings.followMouse &&
      this.time >= this.nextScan &&
      !this.scanning
    )
      void this.scan();
    const profile = huntProfiles[this.settings.personality];
    const externalDelta = this.takeSurfaceDelta();
    // All movement observed before our own bounded edge step is external intent.
    // Programmatic scroll, scrollbar drags and browser navigation yield just like wheel/touch.
    if (
      (externalDelta.x || externalDelta.y) &&
      !quiet &&
      !this.paused &&
      !(
        this.pointerActive &&
        this.pointerMoved &&
        this.pointerSurfaceOffset.x === scrollX &&
        this.pointerSurfaceOffset.y === scrollY
      )
    )
      this.manualNavigation(false);
    let surfaceDelta = externalDelta;
    let grip: SpiderOptions['grip'];
    let selector: SpiderOptions['selector'];
    if (!quiet && !this.paused) {
      this.updateHover();
      this.scrollEdge(dt);
      const ownDelta = this.takeSurfaceDelta();
      surfaceDelta = { x: externalDelta.x + ownDelta.x, y: externalDelta.y + ownDelta.y };
      if (this.geometryDirty) this.refreshGeometry();
      if (
        this.spider.needsRecovery(surfaceDelta, this.readSurfaces(surfaceTime)) ||
        (this.current && !this.targetFresh(this.current.target))
      )
        this.beginRecovery(surfaceDelta);
      if (this.mode === 'recover' && !this.spider.recovering) {
        this.mode = 'scan';
        this.phaseTime = 0;
        this.nextScan = this.time;
        this.updateActivity();
      }
      if (this.mode === 'arrive' && this.phaseTime > profile.arrive) {
        this.mode = 'scan';
        this.phaseTime = 0;
        this.updateActivity();
      }
      if (this.mode === 'aftermath' && this.phaseTime > profile.rest) {
        this.mode = 'scan';
        this.phaseTime = 0;
        this.updateActivity();
      }
      if (this.mode === 'scan' && !this.candidate && !this.limitReached) {
        if (this.settings.followMouse) {
          // Let the physical silk arrival finish before freezing a follow-mode
          // resting destination; short decision clocks otherwise stop it near the top.
          if (!this.hover && this.spider.settled) this.destination = { ...this.spider.position };
        } else if (this.phaseTime > profile.choice && this.time >= this.nextChoice) this.choose();
      }
      if (this.candidate) {
        if (!this.candidateFresh()) this.cancelCandidate();
        else this.targetDestination(this.candidate);
      }
      const candidate = this.candidate;
      if (candidate) {
        this.candidateAge += dt;
        if (this.mode === 'notice' && this.phaseTime >= profile.notice) {
          this.mode = 'investigate';
          this.phaseTime = 0;
          this.updateActivity();
        }
        if (
          this.mode === 'investigate' &&
          !this.spider.recovering &&
          this.candidateAge > profile.approachMin &&
          (Math.hypot(
            this.spider.position.x - this.destination.x,
            this.spider.position.y - this.destination.y,
          ) < (this.settings.personality === 'feral' ? 26 : 55) ||
            (this.candidateAge > profile.approachMax &&
              Math.hypot(
                this.spider.position.x - this.destination.x,
                this.spider.position.y - this.destination.y,
              ) < (this.settings.personality === 'feral' ? 48 : 105)))
        ) {
          this.lockCandidate();
        }
        if (this.mode === 'lock' && this.phaseTime >= profile.lock) {
          this.mode = 'prepare';
          this.phaseTime = 0;
          this.updateActivity();
        }
        if (this.mode === 'prepare' && this.phaseTime >= profile.anticipation) this.strike();
        else {
          const exact = this.candidate!;
          const locked = this.mode === 'lock' || this.mode === 'prepare';
          selector = {
            rect: exact.rect,
            progress:
              this.mode === 'prepare'
                ? clamp(this.phaseTime / profile.anticipation, 0, 1)
                : locked
                  ? clamp(this.phaseTime / profile.lock, 0, 1)
                  : clamp(this.candidateAge / profile.approachMin, 0, 1),
            phase: this.mode === 'prepare' ? 'prepare' : locked ? 'lock' : 'scan',
            aim: locked ? (this.lockedContact ?? undefined) : undefined,
            color: this.palette()[(this.nextId - 1) % 5],
          };
          if (this.mode === 'prepare' && this.lockedContact) {
            const body = this.spider.position;
            grip = {
              point: {
                x: this.lockedContact.x + (body.x - this.lockedContact.x) * 0.16,
                y: this.lockedContact.y + (body.y - this.lockedContact.y) * 0.16,
              },
              progress: 0,
              color: selector.color,
            };
          }
        }
      }
      if (this.settling) {
        const record = this.settling;
        record.strikeElapsed += elapsed;
        record.settleProgress = clamp(
          (record.strikeElapsed - record.strikeDuration) / record.settleDuration,
          0,
          1,
        );
        if (!this.targetFresh(record.target)) record.settleProgress = 1;
        paint(record);
        if (!this.candidate && !this.current) {
          selector = {
            rect: record.target.rect,
            progress: record.settleProgress,
            phase: 'settle',
            aim: {
              x: record.target.rect.x + (record.impact?.x ?? 0),
              y: record.target.rect.y + (record.impact?.y ?? 0),
            },
            color: record.color,
          };
        }
        if (record.settleProgress === 1) {
          this.settling = null;
          if (this.mode === 'settle') {
            this.mode = 'aftermath';
            this.phaseTime = 0;
            this.updateActivity();
          }
        }
      }
      if (this.current) {
        const record = this.current;
        this.targetDestination(record.target);
        // Physics uses capped dt; an atomic strike uses elapsed foreground time so
        // a slow frame cannot stretch the promised 180–420ms interruption window.
        if (record === strikeAtFrameStart) record.strikeElapsed += elapsed;
        record.progress = clamp(record.strikeElapsed / record.strikeDuration, 0, 1);
        place(record);
        selector = {
          rect: record.target.rect,
          progress: record.progress,
          phase: 'strike',
          aim: this.strikeGrip(record)?.point,
          color: record.color,
        };
        grip = this.strikeGrip(record);
        if (record.progress === 1) {
          this.finishSettling();
          this.settling = record;
          record.strikeElapsed = record.strikeDuration;
          this.current = null;
          this.mode = 'settle';
          this.phaseTime = 0;
          this.updateHover();
          grip = undefined;
          selector = this.candidate
            ? { rect: this.candidate.rect, progress: 0, phase: 'scan', color: this.palette()[0] }
            : undefined;
          this.updateActivity();
        }
      }
      // Queue latest attention while the committed selector finishes in <=420ms.
      if (!this.current && !this.candidate && this.hover && !this.occupied(this.hover.target)) {
        const target = this.hover.target;
        selector = { rect: target.rect, progress: 0, phase: 'scan', color: this.palette()[0] };
      }
      if (
        this.pointerActive &&
        this.pointerSafe &&
        (this.hover || this.edgeDirection) &&
        this.followAvailable() &&
        !this.candidate &&
        !this.current &&
        !this.settling &&
        !['arrive', 'recover'].includes(this.mode) &&
        performance.now() - this.pointerAt < 900
      ) {
        if (this.hover) this.targetDestination(this.hover.target);
        else
          this.destination = {
            x: clamp(this.pointerIntent.x - 65, 200, Math.max(200, innerWidth - 200)),
            y: clamp(this.pointerIntent.y - 65, 200, Math.max(200, innerHeight - 200)),
          };
      }
    }
    const destination = quiet
      ? { x: innerWidth * 0.72, y: Math.min(140, innerHeight * 0.3) }
      : this.destination;
    const spiderOptions: SpiderOptions = {
      ...this.settings,
      reducedMotion: quiet,
      quality: this.quality.level,
      descending: !quiet && this.mode === 'arrive',
      grip,
      selector,
      surface: this.surface,
      pointer:
        this.pointerActive && (this.hover || performance.now() - this.pointerAt < 900)
          ? this.pointer
          : undefined,
      attention:
        this.pointerActive && (this.hover || performance.now() - this.pointerAt < 900)
          ? this.pointer
          : undefined,
      pursuing:
        this.pointerActive &&
        !this.current &&
        (!!this.hover || performance.now() - this.pointerAt < 900),
      pursuitSpeed:
        this.pointerSpeed * Math.exp(-Math.max(0, performance.now() - this.pointerAt) / 240),
      idle:
        !quiet &&
        this.mode === 'scan' &&
        !this.candidate &&
        !this.current &&
        !this.hover &&
        // A stationary pointer is presence, not unresolved hunting intent.
        // Real movement restarts idleInputUntil; active edge travel still wins.
        !this.edgeDirection &&
        this.time >= this.idleInputUntil &&
        !this.blurred &&
        performance.now() >= this.manualUntil,
      surfaces: this.readSurfaces(surfaceTime, destination),
    };
    this.lastSpiderOptions = spiderOptions;
    this.spider.update(quiet ? 0 : dt, this.time, destination, {
      ...spiderOptions,
      surfaceDelta,
    });
    this.spider.render();
    if (this.time >= this.nextTelemetry || quiet) {
      this.nextTelemetry = this.time + 0.1;
      this.updateActivity();
      const canvas = this.root?.querySelector<HTMLCanvasElement>('canvas.visitor');
      if (canvas) {
        const position = this.spider.position;
        canvas.dataset.bodyX = position.x.toFixed(1);
        canvas.dataset.bodyY = position.y.toFixed(1);
        canvas.dataset.destinationX = destination.x.toFixed(1);
        canvas.dataset.destinationY = destination.y.toFixed(1);
        canvas.dataset.motion = quiet
          ? 'quiet'
          : this.candidate || this.current
            ? 'hunt'
            : this.settings.followMouse && this.pointerActive
              ? 'follow'
              : 'explore';
      }
    }
    // Quiet visitors and paused sessions never retain an animation loop. Event-driven
    // geometry work remains available to keep existing aftermath correctly anchored.
    if (quiet || this.paused) {
      this.updateActivity();
      return;
    }
    this.requestFrame();
  };
}
