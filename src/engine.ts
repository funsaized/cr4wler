import { Spider, type Point } from './spider';
import { scanTargets, fresh, eligible, type Target } from './targets';
import { defaults, settingsFrom, type Settings, type Status } from './types';
const colors = ['#61f3ff', '#fd74cd', '#b59bff', '#ffa766', '#a4ffd6'];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
interface Fragment {
  target: Target;
  el: HTMLSpanElement;
  origin: Point;
  offset: Point;
  rotation: number;
  scale: number;
  stretch: number;
  age: number;
  color: string;
}
const styles = `
:host{all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;contain:strict!important;color-scheme:dark!important;display:block!important;}
*{box-sizing:border-box}canvas,.pieces{position:absolute;inset:0;pointer-events:none}canvas{width:100%;height:100%}.piece{position:absolute;display:block;white-space:pre;line-height:1.2;transform-origin:0 50%;will-change:transform;pointer-events:none;user-select:none;border-radius:2px;}
.dock{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;background:#10101ceF;color:#d9d9e9;border:1px solid #45425e;border-radius:100px;padding:10px 12px 10px 18px;box-shadow:0 8px 40px #0005;font:12px/1.4 system-ui,sans-serif;pointer-events:auto;white-space:nowrap}
.dot{width:6px;height:6px;border-radius:50%;background:#bdffa3;box-shadow:0 0 9px #bdffa355}.wordmark{font-weight:700;letter-spacing:.5px}.activity{color:#9694ad;min-width:114px}button{font:inherit;cursor:pointer;color:#eeeefa;border:1px solid #45425e;background:#232132;border-radius:100px;padding:7px 12px}button:hover{border-color:#b6a7ff;background:#383148}button:focus-visible{outline:2px solid #b6ff96;outline-offset:3px}.restore{color:#baff9a}.tip{position:absolute;bottom:87px;left:50%;transform:translateX(-50%);max-width:90vw;color:#bbb7d0;background:#11121deF;border:1px solid #393448;padding:10px 18px;border-radius:9px;font:12px/1.5 system-ui,sans-serif;text-align:center}.tip kbd{color:#c3ffa6;font:inherit}.hide{display:none}@media(max-width:550px){.activity{display:none}.dock{gap:7px;padding-left:12px}.tip{width:86vw}}
`;
export class Cr4wler {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private spider: Spider | null = null;
  private settings: Settings = { ...defaults };
  private abort = new AbortController();
  private raf = 0;
  private previous = 0;
  private time = 0;
  private paused = false;
  private hidden = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private targets: Target[] = [];
  private scanning = false;
  private nextScan = 0;
  private fragments: Fragment[] = [];
  private current: Fragment | null = null;
  private mode: 'arrive' | 'seek' | 'reach' | 'pull' = 'arrive';
  private phase = 0;
  private destination: Point = { x: innerWidth * 0.62, y: innerHeight * 0.38 };
  private pointer: Point = { x: -1000, y: -1000 };
  private highlight: Highlight | null = null;
  private highlightName = `cr4wler-${crypto.randomUUID()}`;
  private highlightStyle: HTMLStyleElement | null = null;
  private observer: MutationObserver | null = null;
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
    };
  }
  configure(value: Partial<Settings>) {
    this.settings = settingsFrom({ ...this.settings, ...value });
    return this.status();
  }
  summon(value?: Partial<Settings>) {
    this.configure(value ?? {});
    if (this.host) return this.status();
    this.abort = new AbortController();
    this.paused = false;
    this.hidden = document.hidden;
    this.time = 0;
    this.phase = 0;
    this.mode = 'arrive';
    this.nextScan = 0;
    this.previous = 0;
    this.host = document.createElement('div');
    this.host.dataset.cr4wlerIgnore = '';
    this.host.dataset.cr4wlerRoot = '';
    this.root = this.host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = styles;
    this.root.append(css);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    this.root.append(canvas);
    const pieces = document.createElement('div');
    pieces.className = 'pieces';
    pieces.setAttribute('aria-hidden', 'true');
    this.root.append(pieces);
    const dock = document.createElement('div');
    dock.className = 'dock';
    dock.setAttribute('role', 'region');
    dock.setAttribute('aria-label', 'Cr4wler controls');
    dock.innerHTML =
      '<span class="dot"></span><span class="wordmark">cr4wler</span><span class="activity">coming down…</span><button class="pause" type="button">Pause</button><button class="restore" type="button">Restore <span aria-hidden="true">↗</span></button>';
    this.root.append(dock);
    this.activity = dock.querySelector('.activity');
    this.pauseButton = dock.querySelector('.pause');
    this.tip = document.createElement('div');
    this.tip.className = 'tip';
    this.tip.textContent = this.reduced.matches
      ? 'Reduced motion is on. A quiet little visitor. Escape restores your page.'
      : 'A little mischief. Move your cursor to say hello. Press Esc to put everything back.';
    this.root.append(this.tip);
    document.documentElement.append(this.host);
    this.spider = new Spider(canvas);
    this.resize();
    if ('highlights' in CSS && typeof Highlight !== 'undefined') {
      this.highlight = new Highlight();
      CSS.highlights.set(this.highlightName, this.highlight);
      this.highlightStyle = document.createElement('style');
      this.highlightStyle.dataset.cr4wlerIgnore = '';
      this.highlightStyle.textContent = `::highlight(${this.highlightName}) { color: transparent; text-shadow: none; }`;
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
        this.pointer = { x: e.clientX, y: e.clientY };
      },
      { passive: true, signal },
    );
    window.addEventListener(
      'resize',
      () => {
        this.resize();
        this.clearFragments();
        this.nextScan = 0;
      },
      { passive: true, signal },
    );
    window.addEventListener(
      'scroll',
      () => {
        this.clearFragments();
        this.nextScan = 0;
      },
      { passive: true, capture: true, signal },
    );
    window.addEventListener('pagehide', () => this.restore(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        this.hidden = document.hidden;
        if (this.hidden) cancelAnimationFrame(this.raf);
        else this.resumeFrames();
      },
      { signal },
    );
    this.reduced.addEventListener(
      'change',
      () => {
        this.clearFragments();
        this.time = 0;
        this.mode = 'arrive';
        this.phase = 0;
        this.resumeFrames();
      },
      { signal },
    );
    this.observer = new MutationObserver((records) => {
      if (!this.host?.isConnected) {
        this.restore();
        return;
      }
      if (records.some((r) => !this.host?.contains(r.target) && r.target !== this.highlightStyle)) {
        this.nextScan = Math.min(this.nextScan, this.time + 0.3);
        // A SPA may recycle text nodes. Release the affected highlights immediately.
        this.fragments
          .filter(
            (f) =>
              !f.target.element.isConnected ||
              !eligible(f.target.element) ||
              f.target.range.toString() !== f.target.text,
          )
          .forEach((f) => this.release(f));
      }
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['contenteditable', 'hidden', 'aria-hidden', 'id', 'class', 'role'],
    });
    this.resumeFrames();
    return this.status();
  }
  pause() {
    if (!this.host) return this.status();
    this.paused = !this.paused;
    if (this.pauseButton) this.pauseButton.textContent = this.paused ? 'Resume' : 'Pause';
    if (this.activity)
      this.activity.textContent = this.paused ? 'holding that thought' : 'looking for a word';
    if (this.paused) cancelAnimationFrame(this.raf);
    else this.resumeFrames();
    return this.status();
  }
  restore() {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.observer?.disconnect();
    this.observer = null;
    this.clearFragments();
    this.highlight?.clear();
    if ('highlights' in CSS) CSS.highlights.delete(this.highlightName);
    this.highlight = null;
    this.highlightStyle?.remove();
    this.highlightStyle = null;
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.spider = null;
    this.targets = [];
    this.scanning = false;
    this.paused = false;
    return this.status();
  }
  private resize() {
    this.spider?.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
    this.destination = { x: innerWidth * 0.62, y: innerHeight * 0.38 };
  }
  private resumeFrames() {
    cancelAnimationFrame(this.raf);
    this.previous = performance.now();
    if (!this.paused && !this.hidden && this.host) this.raf = requestAnimationFrame(this.frame);
  }
  private clearFragments() {
    for (const f of [...this.fragments]) this.release(f);
    this.current = null;
    if (this.mode !== 'arrive') this.mode = 'seek';
    this.phase = 0;
  }
  private release(f: Fragment) {
    this.highlight?.delete(f.target.range);
    f.el.remove();
    this.fragments = this.fragments.filter((x) => x !== f);
    if (this.current === f) {
      this.current = null;
      this.mode = 'seek';
      this.phase = 0;
    }
  }
  private async scan() {
    if (this.scanning) return;
    this.scanning = true;
    const signal = this.abort.signal;
    const list = await scanTargets(signal);
    if (!signal.aborted) {
      this.targets = list;
      this.scanning = false;
      this.nextScan = this.time + 3;
    }
  }
  private choose() {
    const candidates = this.targets.filter(
      (t) =>
        !this.fragments.some((f) => f.target.range.startContainer === t.range.startContainer) &&
        fresh(t),
    );
    if (!candidates.length) {
      this.nextScan = 0;
      return;
    }
    const links = candidates.filter((t) => t.element.closest('a'));
    const pool = links.length && Math.random() < 0.65 ? links : candidates;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const color = colors[this.fragments.length % colors.length];
    const el = document.createElement('span');
    el.className = 'piece';
    el.textContent = target.text;
    el.style.font = target.font;
    el.style.letterSpacing = target.letterSpacing;
    el.style.color = color;
    el.style.outline = `1px solid ${color}`;
    el.style.outlineOffset = '3px';
    el.style.background = `${color}12`;
    this.root?.querySelector('.pieces')?.append(el);
    const f: Fragment = {
      target,
      el,
      origin: { x: target.rect.x, y: target.rect.y },
      offset: { x: 0, y: 0 },
      rotation: (Math.random() - 0.5) * 68,
      scale: Math.max(
        1.1,
        Math.min(1.18 + this.settings.intensity * 1.6, (innerWidth * 0.6) / target.rect.width),
      ),
      stretch: this.fragments.length % 3 === 1 ? 1.4 : 1,
      age: 0,
      color,
    };
    this.fragments.push(f);
    this.current = f;
    this.destination = {
      x: clamp(target.rect.x + 100, 90, innerWidth - 100),
      y: clamp(target.rect.y - 86, 165, innerHeight - 180),
    };
    this.mode = 'reach';
    this.phase = 0;
    if (this.activity)
      this.activity.textContent = [
        'found a shiny word',
        'this one looks tasty',
        'just borrowing this',
        'a very good syllable',
      ][Math.floor(Math.random() * 4)];
  }
  private frame = (now: number) => {
    if (!this.host || !this.spider || this.paused || this.hidden) return;
    if (!this.host.isConnected) {
      this.restore();
      return;
    }
    const dt = Math.min((now - this.previous) / 1000, 0.033);
    this.previous = now;
    this.time += dt;
    this.phase += dt;
    const quiet = this.reduced.matches;
    if (this.time > 9) this.tip?.classList.add('hide');
    if (!quiet && this.time >= this.nextScan && !this.scanning) void this.scan();
    let grip: { point: Point; progress: number; color: string } | undefined;
    if (this.mode === 'arrive' && this.time > 1.9) {
      this.mode = 'seek';
      this.phase = 0;
    }
    const pace =
      this.settings.personality === 'dreamy'
        ? 1.6
        : this.settings.personality === 'feral'
          ? 0.7
          : 1;
    if (!quiet && this.mode === 'seek' && this.phase > 1.15 * pace) this.choose();
    const f = this.current;
    if (f) {
      if (!fresh(f.target)) {
        this.release(f);
      } else {
        f.origin = { x: f.target.rect.x, y: f.target.rect.y };
        if (this.mode === 'reach' && this.phase > 1.25 * pace) {
          this.mode = 'pull';
          this.phase = 0;
          this.highlight?.add(f.target.range);
        }
        const t = this.mode === 'pull' ? clamp(this.phase / (1.6 * pace), 0, 1) : 0;
        const pull = t * t * (3 - 2 * t);
        f.offset = {
          x: -65 * pull * (0.5 + this.settings.intensity),
          y: -(45 + this.settings.intensity * 35) * pull,
        };
        const contact = {
          x: f.origin.x + f.offset.x,
          y: f.origin.y + f.offset.y + f.target.rect.height * 0.5,
        };
        grip = {
          point: contact,
          progress: this.mode === 'reach' ? clamp(this.phase / (0.9 * pace), 0, 1) : 1,
          color: f.color,
        };
        f.el.style.transform = `translate3d(${f.origin.x + f.offset.x}px,${f.origin.y + f.offset.y}px,0) rotate(${f.rotation * pull}deg) scale(${1 + (f.scale - 1) * pull},${1 + (f.scale - 1) * pull * f.stretch})`;
        f.el.style.background =
          this.mode === 'pull' && this.fragments.length % 3 === 0 ? f.color : `${f.color}12`;
        if (this.mode === 'pull' && this.fragments.length % 3 === 0) f.el.style.color = '#12111d';
        if (t === 1) {
          this.current = null;
          this.mode = 'seek';
          this.phase = 0;
          if (this.activity) this.activity.textContent = 'rearranging the internet';
        }
      }
    }
    const limit = Math.round(3 + this.settings.intensity * 7);
    while (this.fragments.length > limit) this.release(this.fragments[0]);
    for (const piece of this.fragments) {
      if (piece === this.current) continue;
      piece.age += dt;
      const x = piece.origin.x + piece.offset.x,
        y = piece.origin.y + piece.offset.y;
      const near = Math.hypot(this.pointer.x - x, this.pointer.y - y) < 100;
      const bob = Math.sin(piece.age * 1.3) * 1.2;
      piece.el.style.transform = `translate3d(${x}px,${y + bob}px,0) rotate(${piece.rotation + (near ? Math.sin(piece.age * 8) * 3 : 0)}deg) scale(${piece.scale},${piece.scale * piece.stretch})`;
      if (piece.age > 26) this.release(piece);
    }
    const dest = quiet ? { x: innerWidth * 0.72, y: 120 } : this.destination;
    this.spider.update(dt, this.time, dest, {
      ...this.settings,
      reducedMotion: quiet,
      descending: this.time < 1.9,
      grip,
      pointer: this.pointer,
    });
    this.spider.render();
    // Reduced motion renders a stationary visitor; no continuous animation or grabs.
    if (quiet && this.time > 0.15) {
      if (this.activity) this.activity.textContent = 'quiet company';
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
