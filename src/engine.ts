import { Spider, type Point, type SpiderOptions } from './spider';
import { scanTargets, fresh, valid, type Target } from './targets';
import { defaults, settingsFrom, type Settings, type Status } from './types';
import {
  effects,
  layoutShards,
  mount,
  rebuild,
  place,
  paint,
  draw,
  type Projection,
  type Clip,
} from './effects';

const RECORD_LIMIT = 512;
const DOM_LIMIT = 72;
const MARGIN = 150;
const darkColors = ['#66eaff', '#ff8ccc', '#bd9bff', '#ffb273', '#8effd1'];
const lightColors = ['#00768c', '#ad256a', '#6541b8', '#ae4a15', '#117153'];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
type Mode = 'arrive' | 'scan' | 'lock' | 'strike' | 'aftermath';
interface Fragment extends Projection {
  documentX: number;
  documentY: number;
  sourceWidth: number;
  sourceHeight: number;
  intensity: number;
  clips: HTMLElement[];
  liveScroll: boolean;
  layoutDirty: boolean;
}
const styles = `
:host{all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;contain:strict!important;color-scheme:dark!important;display:block!important;}
*{box-sizing:border-box}canvas,.pieces{position:absolute;inset:0;pointer-events:none}canvas{width:100%;height:100%}.piece{position:absolute;display:block;transform-origin:0 50%;pointer-events:none;user-select:none;white-space:pre}.shard{position:absolute;display:block;left:0;top:0;white-space:pre;transform-origin:0 50%;text-shadow:.65px .65px 0 #07102225;pointer-events:none}
.dock{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;background:#10101cf2;color:#d9d9e9;border:1px solid #45425e;border-radius:100px;padding:10px 12px 10px 18px;box-shadow:0 8px 40px #0005;font:12px/1.4 system-ui,sans-serif;pointer-events:auto;white-space:nowrap}
.dot{width:6px;height:6px;border-radius:50%;background:#bdffa3;box-shadow:0 0 9px #bdffa355}.wordmark{font-weight:700;letter-spacing:.5px}.activity{color:#b3afc9;min-width:145px}button{font:inherit;cursor:pointer;color:#eeeefa;border:1px solid #45425e;background:#232132;border-radius:100px;padding:7px 12px}button:hover{border-color:#b6a7ff;background:#383148}button:focus-visible{outline:2px solid #b6ff96;outline-offset:3px}.restore{color:#baff9a}.tip{position:absolute;bottom:87px;left:50%;transform:translateX(-50%);max-width:90vw;color:#bbb7d0;background:#11121df2;border:1px solid #393448;padding:10px 18px;border-radius:9px;font:12px/1.5 system-ui,sans-serif;text-align:center}.hide{display:none}@media(max-width:600px){.activity{font-size:10px;min-width:0;max-width:145px;white-space:normal}.dock{gap:7px;padding-left:12px;max-width:96vw}.tip{width:86vw}.wordmark{font-size:11px}}
`;
export class Cr4wler {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private pieces: HTMLDivElement | null = null;
  private overflow: HTMLCanvasElement | null = null;
  private spider: Spider | null = null;
  private settings: Settings = { ...defaults };
  private abort = new AbortController();
  private raf = 0;
  private geometryRaf = 0;
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
  private candidate: Target | null = null;
  private candidateAge = 0;
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
  private pointerAt = -100;
  private nextFollow = 0;
  private nextTelemetry = 0;
  private surface: 'light' | 'dark' = 'dark';
  private highlight: Highlight | null = null;
  private selection: Highlight | null = null;
  private highlightName = `cr4wler-${crypto.randomUUID()}`;
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
    this.settings = settingsFrom({ ...this.settings, ...value });
    this.updateActivity();
    return this.status();
  }
  summon(value?: Partial<Settings>) {
    this.configure(value ?? {});
    if (this.host) return this.status();
    this.abort = new AbortController();
    this.paused = false;
    this.hidden = document.hidden;
    this.time = this.phaseTime = this.previous = 0;
    this.mode = 'arrive';
    this.nextScan = this.nextChoice = this.nextFollow = this.nextTelemetry = 0;
    this.nextId = 1;
    this.limitReached = false;
    this.pointerAt = -100;
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
      : 'Tiny acts of typography. The aftermath stays as you scroll. Reset or Esc restores everything.';
    this.root.append(this.tip);
    document.documentElement.append(this.host);
    this.spider = new Spider(canvas);
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
      this.highlightStyle.textContent = `::highlight(${this.highlightName}){color:transparent;text-shadow:none}::highlight(${this.highlightName}-selection){color:${this.palette()[0]};background-color:${this.palette()[0]}1f;text-shadow:none}`;
      document.documentElement.append(this.highlightStyle);
    }
    const signal = this.abort.signal;
    this.pauseButton?.addEventListener('click', () => this.pause(), { signal });
    dock.querySelector('.restore')?.addEventListener('click', () => this.restore(), { signal });
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') this.restore();
      },
      { capture: true, signal },
    );
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch') return;
        this.pointer = { x: e.clientX, y: e.clientY };
        this.pointerAt = this.time;
      },
      { passive: true, signal },
    );
    window.addEventListener(
      'resize',
      () => {
        this.resize();
        this.scheduleGeometry(true);
        this.invalidateScan();
      },
      { passive: true, signal },
    );
    window.addEventListener(
      'scroll',
      (e) => {
        if (e.target) this.movedScrollers.add(e.target);
        this.scheduleGeometry();
        this.invalidateScan();
      },
      { passive: true, capture: true, signal },
    );
    window.addEventListener('pagehide', () => this.restore(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        this.hidden = document.hidden;
        if (this.hidden) {
          cancelAnimationFrame(this.raf);
          cancelAnimationFrame(this.geometryRaf);
          this.geometryRaf = 0;
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
        // Committed aftermath stays; only an uncommitted lock is abandoned.
        this.cancelCandidate();
        if (this.current) {
          this.current.progress = 1;
          paint(this.current);
          this.current = null;
        }
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
      ],
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleGeometry(true));
      this.resizeObserver.observe(document.documentElement);
      if (document.body) this.resizeObserver.observe(document.body);
    }
    document.fonts?.addEventListener('loadingdone', () => this.scheduleGeometry(true), { signal });
    this.updateActivity();
    this.resumeFrames();
    return this.status();
  }
  pause() {
    if (!this.host) return this.status();
    this.paused = !this.paused;
    if (this.pauseButton) this.pauseButton.textContent = this.paused ? 'Resume' : 'Pause';
    this.updateActivity();
    if (this.paused) cancelAnimationFrame(this.raf);
    else this.resumeFrames();
    return this.status();
  }
  restore() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.geometryRaf);
    this.geometryRaf = 0;
    this.abort.abort();
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
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.pieces = null;
    this.overflow = null;
    this.spider = null;
    this.targets = [];
    this.fragments = [];
    this.current = null;
    this.candidate = null;
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
  private resumeFrames() {
    cancelAnimationFrame(this.raf);
    this.previous = performance.now();
    if (!this.hidden && this.host && (!this.paused || this.reduced.matches))
      this.raf = requestAnimationFrame(this.frame);
  }
  private invalidateScan() {
    this.targets = [];
    this.nextScan = Math.min(this.nextScan, this.time + 0.22);
  }
  private cancelCandidate() {
    this.selection?.clear();
    this.candidate = null;
    this.candidateAge = 0;
    if (this.mode === 'lock') {
      this.mode = 'scan';
      this.phaseTime = 0;
    }
  }
  private release(record: Fragment) {
    this.highlight?.delete(record.target.range);
    record.el?.remove();
    record.el = null;
    this.fragments = this.fragments.filter((f) => f !== record);
    if (!this.fragments.some((f) => f.target.element === record.target.element))
      this.resizeObserver?.unobserve(record.target.element);
    if (this.current === record) {
      this.current = null;
      this.mode = 'scan';
      this.phaseTime = 0;
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
    for (const record of [...this.fragments]) {
      const touched =
        !record.target.node.isConnected ||
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
    if (this.candidate && !valid(this.candidate)) this.cancelCandidate();
    this.invalidateScan();
    this.scheduleGeometry(true);
  }
  private scheduleGeometry(reflow = false) {
    this.geometryDirty = true;
    this.layoutDirty ||= reflow;
    if (!this.host || this.hidden || this.geometryRaf) return;
    // This scheduler is independent of hunting, so Pause still follows document scroll.
    this.geometryRaf = requestAnimationFrame(() => {
      this.geometryRaf = 0;
      if (this.host && !this.hidden) this.refreshGeometry();
    });
  }
  private anchorTraits(element: HTMLElement): { clips: HTMLElement[]; liveScroll: boolean } {
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
    if (!this.pieces || !this.overflow) return;
    const reflow = this.layoutDirty;
    this.layoutDirty = this.geometryDirty = false;
    const clipCache = new Map<Element, DOMRect>();
    const visible: Fragment[] = [];
    for (const record of [...this.fragments]) {
      if (!record.target.node.isConnected) {
        this.release(record);
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
      const scrolled = [...this.movedScrollers].some(
        (node) => node instanceof Element && node.contains(record.target.element),
      );
      if (reflow || record.layoutDirty || record.liveScroll || nearby || scrolled) {
        rect = record.target.range.getBoundingClientRect();
        record.documentX = rect.x + scrollX;
        record.documentY = rect.y + scrollY;
      }
      record.target.rect = rect;
      if (reflow || record.layoutDirty)
        Object.assign(record, this.anchorTraits(record.target.element));
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
        if (reflow || record.layoutDirty || resized || !record.shards.length) {
          const style = getComputedStyle(record.target.element);
          record.target.font = style.font;
          record.target.letterSpacing = style.letterSpacing;
          if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') {
            record.el?.remove();
            record.el = null;
            continue;
          }
          record.shards = layoutShards(record, record.intensity);
          rebuild(record);
          record.layoutDirty = false;
        }
        visible.push(record);
      } else {
        record.layoutDirty ||= reflow;
        record.el?.remove();
        record.el = null;
      }
      record.sourceWidth = rect.width;
      record.sourceHeight = rect.height;
    }
    this.movedScrollers.clear();
    this.visibleCount = visible.length;
    // The active strike always has a DOM projection; excess *visible* settled effects
    // retain their exact geometry on the shared canvas instead of being discarded.
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
    if (this.candidate) {
      if (!fresh(this.candidate)) this.cancelCandidate();
      else this.targetDestination(this.candidate);
    }
    this.updateActivity();
    if (this.paused || this.reduced.matches) this.spider?.render();
  }
  private async scan() {
    if (this.scanning || this.limitReached || this.reduced.matches || !this.highlight) return;
    this.scanning = true;
    const signal = this.abort.signal;
    const list = await scanTargets(signal);
    if (signal.aborted || !this.host) return;
    this.scanning = false;
    this.targets = list;
    this.nextScan = this.time + (list.length ? 3.2 : 1.1);
  }
  private occupied(target: Target) {
    return this.fragments.some(
      (record) =>
        record.target.node === target.node &&
        record.target.range.startOffset < target.range.endOffset &&
        record.target.range.endOffset > target.range.startOffset,
    );
  }
  private choose() {
    this.nextChoice = this.time + 0.5;
    if (this.limitReached || !this.highlight) return;
    const body = this.spider?.position ?? this.destination;
    const following = this.settings.followMouse && this.time - this.pointerAt < 5;
    const focus = following ? this.pointer : body;
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
      if (!fresh(target)) continue;
      this.candidate = target;
      this.candidateAge = 0;
      this.phaseTime = 0;
      this.surface = this.detectSurface(target.element);
      this.targetDestination(target);
      this.selection?.clear();
      this.selection?.add(target.range);
      this.updateActivity();
      return;
    }
    this.nextScan = Math.min(this.nextScan, this.time + 0.3);
  }
  private targetDestination(target: Target) {
    const centerX = target.rect.x + target.rect.width / 2;
    const right = centerX < innerWidth * 0.55;
    this.destination = {
      x: clamp(centerX + (right ? 96 : -96), 75, Math.max(75, innerWidth - 75)),
      y: clamp(target.rect.y - 75, 105, Math.max(105, innerHeight - 145)),
    };
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
    const palette = this.palette();
    const record: Fragment = {
      id,
      target,
      effect: effects[(id - 1) % effects.length],
      color: palette[(id - 1) % palette.length],
      accent: palette[(id + 1) % palette.length],
      shards: [],
      progress: 0,
      el: null,
      clip: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
      documentX: target.rect.x + scrollX,
      documentY: target.rect.y + scrollY,
      sourceWidth: target.rect.width,
      sourceHeight: target.rect.height,
      intensity: this.settings.intensity,
      layoutDirty: true,
      ...this.anchorTraits(target.element),
    };
    this.fragments.push(record);
    this.current = record;
    this.cancelCandidate();
    this.highlight.add(target.range);
    this.resizeObserver?.observe(target.element);
    this.mode = 'strike';
    this.phaseTime = 0;
    if (this.fragments.length === RECORD_LIMIT) this.limitReached = true;
    // Commit mask and initial projection atomically before the next paint.
    this.refreshGeometry();
  }
  private followPointer() {
    if (
      !this.settings.followMouse ||
      this.time < this.nextFollow ||
      this.time - this.pointerAt > 4 ||
      !this.spider
    )
      return;
    this.nextFollow = this.time + 0.16;
    const position = this.spider.position;
    const dx = this.pointer.x - position.x;
    const dy = this.pointer.y - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 125) return;
    // It approaches a comfortable stand-off, with spring acceleration in Spider.
    // Target acquisition owns movement while a scan/lock/strike is under way.
    const side = Math.sin(this.time * 0.35) * 18;
    this.destination = {
      x: clamp(this.pointer.x - (dx / distance) * 102 + side, 70, Math.max(70, innerWidth - 70)),
      y: clamp(this.pointer.y - (dy / distance) * 102, 105, Math.max(105, innerHeight - 145)),
    };
  }
  private updateActivity() {
    if (this.host) {
      const status = this.status();
      this.host.dataset.phase = status.phase;
      this.host.dataset.fragments = String(status.fragments);
      this.host.dataset.visibleFragments = String(status.visibleFragments);
      this.host.dataset.recordLimitReached = String(status.recordLimitReached);
      this.host.dataset.followMouse = String(this.settings.followMouse);
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
            : this.mode === 'arrive'
              ? 'coming down…'
              : this.mode === 'lock'
                ? 'target locked · considering…'
                : this.mode === 'strike'
                  ? `${this.current?.effect ?? 'type'} in progress`
                  : this.candidate
                    ? 'scanning the type…'
                    : `${this.fragments.length} marks · exploring`;
  }
  private frame = (now: number) => {
    if (!this.host || !this.spider || this.hidden || (this.paused && !this.reduced.matches)) return;
    if (!this.host.isConnected) {
      this.restore();
      return;
    }
    const dt = Math.min(Math.max(0, (now - this.previous) / 1000), 0.033);
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
      this.time >= this.nextScan &&
      !this.scanning
    )
      void this.scan();
    const pace =
      this.settings.personality === 'dreamy'
        ? 1.35
        : this.settings.personality === 'feral'
          ? 0.8
          : 1;
    let grip: SpiderOptions['grip'];
    let selector: SpiderOptions['selector'];
    if (!quiet && !this.paused) {
      if (this.mode === 'arrive' && this.phaseTime > 1.8) {
        this.mode = 'scan';
        this.phaseTime = 0;
        this.updateActivity();
      }
      if (this.mode === 'aftermath' && this.phaseTime > 0.45 * pace) {
        this.mode = 'scan';
        this.phaseTime = 0;
        this.updateActivity();
      }
      if (this.mode === 'scan' && !this.candidate && !this.limitReached) {
        this.followPointer();
        if (this.phaseTime > 0.35 * pace && this.time >= this.nextChoice) this.choose();
      }
      const candidate = this.candidate;
      if (candidate) {
        this.candidateAge += dt;
        if (
          this.mode === 'scan' &&
          this.candidateAge > 0.68 * pace &&
          (Math.hypot(
            this.spider.position.x - this.destination.x,
            this.spider.position.y - this.destination.y,
          ) < 70 ||
            this.candidateAge > 1.8 * pace)
        ) {
          this.mode = 'lock';
          this.phaseTime = 0;
          this.updateActivity();
        }
        if (this.mode === 'lock' && this.phaseTime > 0.72 * pace) this.strike();
        else
          selector = {
            rect: candidate.rect,
            progress:
              this.mode === 'lock'
                ? clamp(this.phaseTime / (0.72 * pace), 0, 1)
                : clamp(this.candidateAge / (0.68 * pace), 0, 1),
            phase: this.mode === 'lock' ? 'lock' : 'scan',
            color: this.palette()[(this.nextId - 1) % 5],
          };
      }
      if (this.current) {
        const record = this.current;
        record.progress = clamp(
          this.phaseTime / ((record.effect === 'peel' ? 1.08 : 0.86) * pace),
          0,
          1,
        );
        paint(record);
        selector = {
          rect: record.target.rect,
          progress: record.progress,
          phase: 'strike',
          color: record.color,
        };
        if (record.effect === 'peel' || record.effect === 'shear') {
          const shard = record.shards[0];
          grip = {
            point: {
              x: record.target.rect.x + (shard?.dx ?? 0) * record.progress,
              y:
                record.target.rect.y +
                record.target.rect.height / 2 +
                (shard?.dy ?? 0) * record.progress,
            },
            progress: record.progress,
            color: record.color,
          };
        }
        if (record.progress === 1) {
          this.current = null;
          this.mode = 'aftermath';
          this.phaseTime = 0;
          this.updateActivity();
        }
      }
    }
    const destination = quiet
      ? { x: innerWidth * 0.72, y: Math.min(140, innerHeight * 0.3) }
      : this.destination;
    this.spider.update(quiet ? 0 : dt, this.time, destination, {
      ...this.settings,
      reducedMotion: quiet,
      descending: !quiet && this.mode === 'arrive',
      grip,
      selector,
      surface: this.surface,
      pointer: this.pointer,
    });
    this.spider.render();
    if (this.time >= this.nextTelemetry || quiet) {
      this.nextTelemetry = this.time + 0.2;
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
            : this.settings.followMouse && this.time - this.pointerAt < 4
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
    this.raf = requestAnimationFrame(this.frame);
  };
}
