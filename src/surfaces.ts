import type { Point, PageSurface } from './spider';
import { eligible } from './targets';

interface Anchor {
  id: number;
  element: HTMLElement;
  kind: PageSurface['kind'];
  node?: Text;
  range?: Range;
  text?: string;
  shape: string;
  generation: number;
  segments: PageSurface[];
}
const LIMIT = 40;
const ignored =
  'form,input,textarea,select,iframe,canvas,video,audio,svg,dialog,[popover],[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[hidden],[inert],[data-cr4wler-ignore]';
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
// Percentage/elliptical corners and paint masks need curved/pixel geometry.
// Only simple pixel radii have straight boundaries we can offer conservatively.
const radiusFor = (style: CSSStyleDeclaration): number | null => {
  const values = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomLeftRadius,
    style.borderBottomRightRadius,
  ];
  return values.every((v) => /^\d+(?:\.\d+)?px$/.test(v))
    ? Math.max(...values.map((v) => parseFloat(v)))
    : null;
};

/** Read-only, local geometry. No document walk, observers, timers or page actions.
 * Engine invalidations refresh at most 40 anchors; discovery is throttled separately.
 * Full segments plus visible fractions keep attachments stable as clips move. */
export class PageSurfaces {
  private anchors = new Map<Node, Anchor>();
  private identities = new WeakMap<Node, number>();
  private masked = new WeakSet<Text>();
  private visibility = new Map<string, boolean>();
  private visibilityCursor = 0;
  private probes = 0;
  private nextId = 1;
  private nextDiscovery = 0;
  private nextRefresh = 0;
  private revision = -1;
  private center: Point = { x: -1000, y: -1000 };
  private segments: PageSurface[] = [];
  private reads = 0;
  private discoveries = 0;
  private refreshes = 0;

  get diagnostics() {
    return {
      anchors: this.anchors.size,
      segments: this.segments.length,
      reads: this.reads,
      discoveries: this.discoveries,
      refreshes: this.refreshes,
      probes: this.probes,
    };
  }
  clear() {
    this.anchors.clear();
    this.identities = new WeakMap();
    this.masked = new WeakSet();
    this.visibility.clear();
    this.visibilityCursor = 0;
    this.segments = [];
    this.nextDiscovery = this.nextRefresh = 0;
    this.revision = -1;
  }
  /** A borrowed line is no longer visible support. Other edges remain usable. */
  mask(node: Text) {
    this.masked.add(node);
    this.anchors.delete(node);
    this.revision = -1;
  }
  unmask(node: Text) {
    this.masked.delete(node);
    this.revision = -1;
  }

  update(
    time: number,
    revision: number,
    body: Point,
    destination: Point,
    feet: Point[],
    retained: readonly string[],
    contacts: readonly { id: string; fraction: number }[] = [],
  ): readonly PageSurface[] {
    const moved = Math.hypot(body.x - this.center.x, body.y - this.center.y) > 45;
    const dirty = revision !== this.revision;
    if (time >= this.nextDiscovery && (moved || dirty || !this.anchors.size)) {
      this.nextDiscovery = time + 0.24;
      this.center = { ...body };
      this.discoveries++;
      const used = new Set(retained);
      for (const [node, anchor] of this.anchors) {
        const nearby = anchor.segments.some((s) => {
          const x = (s.a.x + s.b.x) / 2;
          const y = (s.a.y + s.b.y) / 2;
          return Math.hypot(x - body.x, y - body.y) < 430 || used.has(s.id);
        });
        if (!node.isConnected || !nearby) this.anchors.delete(node);
      }
      this.discover(body, destination, feet);
    }
    if (dirty || time >= this.nextRefresh) {
      this.nextRefresh = time + 0.15;
      this.revision = revision;
      this.refreshes++;
      this.measure(body, retained, contacts);
    }
    return this.segments;
  }

  private add(node: Node, element: HTMLElement, kind: PageSurface['kind'], offset = 0) {
    if (this.anchors.has(node) || this.anchors.size >= LIMIT) return;
    let id = this.identities.get(node);
    if (!id) {
      id = this.nextId++;
      this.identities.set(node, id);
    }
    const anchor: Anchor = { id, element, kind, shape: '', generation: 0, segments: [] };
    if (node instanceof Text) {
      if (this.masked.has(node) || !eligible(element) || node.length < 4 || node.length > 12000)
        return;
      const start = Math.max(0, Math.min(node.length - 1, offset) - 128);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, Math.min(node.length, start + 384));
      anchor.node = node;
      anchor.range = range;
      anchor.text = range.toString();
    }
    this.anchors.set(node, anchor);
  }

  private discover(body: Point, destination: Point, feet: Point[]) {
    const travel = Math.hypot(destination.x - body.x, destination.y - body.y);
    const ahead = {
      x: body.x + (destination.x - body.x) * Math.min(1, 190 / Math.max(1, travel)),
      y: body.y + (destination.y - body.y) * Math.min(1, 190 / Math.max(1, travel)),
    };
    // Sixteen hit tests, at most six ancestors/hit and 48 locally visited text nodes.
    const seeds = [body, ahead, ...feet];
    for (const x of [-120, 0, 120])
      for (const y of [-85, 85]) seeds.push({ x: body.x + x, y: body.y + y });
    const visited = new Set<HTMLElement>();
    let textBudget = 48;
    const start = performance.now();
    for (const p of seeds) {
      if (performance.now() - start > 2 || this.anchors.size >= LIMIT) break;
      const x = clamp(p.x, 2, innerWidth - 2),
        y = clamp(p.y, 2, innerHeight - 2);
      const hit = document.elementFromPoint(x, y);
      if (!(hit instanceof HTMLElement) || hit.closest(ignored)) continue;
      const caret = document.caretRangeFromPoint?.(x, y);
      if (caret?.startContainer instanceof Text && hit.contains(caret.startContainer)) {
        const node = caret.startContainer;
        if (node.parentElement) this.add(node, node.parentElement, 'text', caret.startOffset);
      }
      let element: HTMLElement | null = hit;
      for (let depth = 0; element && depth < 6; depth++, element = element.parentElement) {
        if (element === document.body || element === document.documentElement) break;
        if (visited.has(element)) continue;
        visited.add(element);
        const style = getComputedStyle(element);
        if (element.matches('img')) this.add(element, element, 'image');
        else if (element.matches('button,[role="button"],a')) this.add(element, element, 'button');
        else if (
          /^(article|section|figure|li)$/i.test(element.tagName) ||
          parseFloat(style.borderTopWidth) > 0 ||
          (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent')
        )
          this.add(element, element, 'card');
        for (const child of element.childNodes) {
          if (textBudget-- <= 0) break;
          if (child instanceof Text) this.add(child, element, 'text');
        }
      }
    }
  }

  private measure(
    body: Point,
    retained: readonly string[],
    contacts: readonly { id: string; fraction: number }[],
  ) {
    const rectCache = new Map<Element, DOMRect>();
    const styleCache = new Map<Element, CSSStyleDeclaration>();
    const styleFor = (element: Element) => {
      let style = styleCache.get(element);
      if (!style) {
        style = getComputedStyle(element);
        styleCache.set(element, style);
      }
      return style;
    };
    const rectFor = (element: Element) => {
      let rect = rectCache.get(element);
      if (!rect) {
        rect = element.getBoundingClientRect();
        this.reads++;
        rectCache.set(element, rect);
      }
      return rect;
    };
    const used = new Set(retained);
    this.segments = [];
    const checks: { segment: PageSurface; element: HTMLElement; inward: Point }[] = [];
    for (const [node, anchor] of this.anchors) {
      const element = anchor.element;
      if (
        !node.isConnected ||
        element.closest(ignored) ||
        (anchor.node &&
          (anchor.node.parentElement !== element ||
            !eligible(element) ||
            anchor.range?.toString() !== anchor.text))
      ) {
        this.anchors.delete(node);
        continue;
      }
      let left = 1,
        top = 1,
        right = innerWidth - 1,
        bottom = innerHeight - 1;
      let visible = true;
      // Excessively deep clipping chains fall back instead of doing unbounded layout work.
      let parent: HTMLElement | null = element;
      for (let depth = 0; parent; depth++, parent = parent.parentElement) {
        if (depth === 24) {
          visible = false;
          break;
        }
        const style = styleFor(parent);
        if (
          style.visibility !== 'visible' ||
          style.display === 'none' ||
          parseFloat(style.opacity) < 0.05 ||
          style.clipPath !== 'none' ||
          (style.getPropertyValue('mask-image') || 'none') !== 'none' ||
          (style.getPropertyValue('-webkit-mask-image') || 'none') !== 'none' ||
          (style.getPropertyValue('mask-border-source') || 'none') !== 'none' ||
          (style.getPropertyValue('-webkit-mask-box-image-source') || 'none') !== 'none' ||
          style.clip !== 'auto'
        ) {
          visible = false;
          break;
        }
        const rotate = style.getPropertyValue('rotate');
        if (rotate && rotate !== 'none' && rotate !== '0deg') {
          visible = false;
          break;
        }
        if (style.transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(style.transform);
          if (!matrix.is2D || Math.abs(matrix.b) > 0.001 || Math.abs(matrix.c) > 0.001) {
            visible = false;
            break;
          }
        }
        const clips = /auto|scroll|hidden|clip/.test(`${style.overflowX} ${style.overflowY}`);
        const radius = radiusFor(style);
        if (
          (parent === element && anchor.kind !== 'text' && radius === null) ||
          (clips && (parent !== element || anchor.kind === 'text') && radius !== 0)
        ) {
          visible = false;
          break;
        }
        if (
          clips &&
          parent !== document.documentElement &&
          (parent !== element || anchor.kind === 'text')
        ) {
          const r = rectFor(parent);
          const sx = r.width / Math.max(1, parent.offsetWidth),
            sy = r.height / Math.max(1, parent.offsetHeight);
          if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
            left = Math.max(left, r.left + parent.clientLeft * sx);
            right = Math.min(right, r.left + (parent.clientLeft + parent.clientWidth) * sx);
          }
          if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
            top = Math.max(top, r.top + parent.clientTop * sy);
            bottom = Math.min(bottom, r.top + (parent.clientTop + parent.clientHeight) * sy);
          }
        }
      }
      if (!visible || right <= left || bottom <= top) {
        anchor.segments = [];
        continue;
      }
      let rects: DOMRect[];
      if (anchor.range) {
        this.reads++;
        rects = Array.from(anchor.range.getClientRects()).slice(0, 8);
      } else rects = [rectFor(element)];
      // Reflow changes line identity; translation preserves a planted fraction.
      const shape = rects
        .map((r) => `${Math.round(r.width / 3)},${Math.round(r.height / 3)}`)
        .join(';');
      if (!anchor.generation || (anchor.kind === 'text' && shape !== anchor.shape)) {
        anchor.generation++;
      }
      anchor.shape = shape;
      anchor.segments = [];
      const offer = (a: Point, b: Point, index: number, inward: Point) => {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (length < 12) return;
        let min = 0,
          max = 1;
        if (anchor.kind !== 'text') {
          // The straight part of a rounded boundary stops before the corner arc.
          const radius = radiusFor(styleFor(element))!;
          const rect = rectFor(element);
          const scale =
            Math.abs(dx) > Math.abs(dy)
              ? rect.width / Math.max(1, element.offsetWidth)
              : rect.height / Math.max(1, element.offsetHeight);
          // DOM hit tests exclude a box's far endpoint. Keep corner landings
          // one viewport pixel inside the painted straight edge.
          min = Math.min(0.5, Math.max(1, radius * scale) / length);
          max = 1 - min;
        }
        for (const [origin, delta, lo, hi] of [
          [a.x, dx, left, right],
          [a.y, dy, top, bottom],
        ]) {
          if (Math.abs(delta) < 0.01) {
            if (origin < lo || origin > hi) return;
          } else {
            const guard = 1 / Math.abs(delta);
            min = Math.max(min, Math.min((lo - origin) / delta, (hi - origin) / delta) + guard);
            max = Math.min(max, Math.max((lo - origin) / delta, (hi - origin) / delta) - guard);
          }
        }
        if ((max - min) * length < 10) return;
        const id = `${anchor.id}:${anchor.generation}:${index}`;
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (Math.hypot(middle.x - body.x, middle.y - body.y) > 550 && !used.has(id) && length < 550)
          return;
        // Exact probes for the rig's at most eight attachments supplement broad
        // visibility sampling. A small overlay can cover an arbitrary fraction.
        const blocked = contacts
          .filter((c) => c.id === id)
          .filter((c) => {
            this.probes++;
            const hit = document.elementFromPoint(
              a.x + dx * c.fraction + inward.x * 2,
              a.y + dy * c.fraction + inward.y * 2,
            );
            return !hit || !element.contains(hit);
          })
          .map((c) => c.fraction);
        const segment: PageSurface = { id, kind: anchor.kind, a, b, min, max, blocked };
        anchor.segments.push(segment);
        checks.push({ segment, element, inward });
      };
      rects.forEach((r, index) => {
        if (r.width < 12 || r.height < 4) return;
        if (anchor.kind === 'text') {
          if (styleFor(element).color === 'rgba(0, 0, 0, 0)') return;
          offer({ x: r.left, y: r.bottom - 2 }, { x: r.right, y: r.bottom - 2 }, index, {
            x: 0,
            y: -1,
          });
        } else {
          offer({ x: r.left, y: r.top }, { x: r.right, y: r.top }, 0, { x: 0, y: 1 });
          offer({ x: r.right, y: r.top }, { x: r.right, y: r.bottom }, 1, { x: -1, y: 0 });
          offer({ x: r.left, y: r.bottom }, { x: r.right, y: r.bottom }, 2, { x: 0, y: -1 });
          offer({ x: r.left, y: r.top }, { x: r.left, y: r.bottom }, 3, { x: 1, y: 0 });
        }
      });
    }
    // Hit testing scales with the page's paint tree, even for cached layout.
    // Eight rotating candidate probes plus at most eight exact contact probes
    // bound that cost independently of the number of discovered boundaries.
    const count = Math.min(8, checks.length);
    for (let i = 0; i < count; i++) {
      const check = checks[(this.visibilityCursor + i) % checks.length]!;
      const { segment: s, element, inward } = check;
      const t = (s.min + s.max) / 2;
      this.probes++;
      const hit = document.elementFromPoint(
        s.a.x + (s.b.x - s.a.x) * t + inward.x * 2,
        s.a.y + (s.b.y - s.a.y) * t + inward.y * 2,
      );
      this.visibility.set(s.id, !!hit && element.contains(hit));
    }
    this.visibilityCursor = checks.length ? (this.visibilityCursor + count) % checks.length : 0;
    const current = new Set(checks.map((c) => c.segment.id));
    for (const id of this.visibility.keys()) if (!current.has(id)) this.visibility.delete(id);
    this.segments = checks
      .filter(
        ({ segment: s }) =>
          this.visibility.get(s.id) ||
          contacts.some((c) => c.id === s.id && !s.blocked?.includes(c.fraction)),
      )
      .map((c) => c.segment);
  }
}
