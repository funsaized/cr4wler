import type { Personality } from './types';
import { materialGeometry, materialExtent } from './paint-geometry';

export type Material = 'text' | 'image' | 'panel' | 'rule';
/** Live anchors, never cloned page HTML. Object appearance is read only at impact. */
export interface Target {
  range: Range;
  element: HTMLElement;
  node: Text | HTMLElement;
  material?: Material;
  signature?: string;
  text: string;
  rect: DOMRect;
  font: string;
  letterSpacing: string;
  color: string;
}
const excluded =
  'input,textarea,select,option,button,form,fieldset,label,iframe,canvas,video,audio,script,style,noscript,svg,math,dialog,[popover],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="dialog"],[role="combobox"],[role="menu"],[aria-hidden="true"],[aria-live],[hidden],[inert],[data-cr4wler-ignore]';
const sensitive =
  /(?:password|payment|checkout|credit.?card|billing|signin|sign-in|log-in|login|auth|captcha|account|private|secret|token)/i;
export function eligible(element: HTMLElement): boolean {
  if (element.closest(excluded) || element.getRootNode() !== document) return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (
      sensitive.test(
        `${ancestor.id} ${ancestor.className} ${ancestor.getAttribute('autocomplete') ?? ''}`,
      )
    )
      return false;
  }
  return true;
}
const materialExcluded =
  'input,textarea,select,option,form,fieldset,label,iframe,canvas,video,audio,script,style,noscript,svg,math,dialog,[popover],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="dialog"],[role="combobox"],[role="menu"],[aria-hidden="true"],[aria-live],[hidden],[inert],[data-cr4wler-ignore]';
/** Plain type=button outside forms is visual material; submitters/editors stay protected. */
export function materialEligible(element: HTMLElement): boolean {
  if (element.closest(materialExcluded) || element.getRootNode() !== document) return false;
  const button = element.closest('button');
  if (
    button &&
    (button.getAttribute('type') !== 'button' ||
      button.hasAttribute('form') ||
      sensitive.test(
        `${button.getAttribute('aria-label') ?? ''} ${button.getAttribute('name') ?? ''} ${button.title}`,
      ))
  )
    return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (
      sensitive.test(
        `${ancestor.id} ${ancestor.className} ${ancestor.getAttribute('autocomplete') ?? ''}`,
      )
    )
      return false;
  }
  return true;
}
function signature(element: HTMLElement): string {
  return element instanceof HTMLImageElement
    ? `${element.currentSrc}|${element.naturalWidth}|${element.naturalHeight}|${element.getAttribute('src')}|${element.getAttribute('srcset')}|${element.getAttribute('sizes')}`
    : (element.textContent ?? '');
}
/** Bound the entire panel inspection, including rejected/sensitive descendants. */
function plainPanel(element: HTMLElement): boolean {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node: Node | null,
    visited = 0,
    characters = 0,
    label = '';
  while ((node = walker.nextNode())) {
    if (++visited > 24) return false;
    if (node instanceof Text) {
      characters += node.length;
      if (characters > 160) return false;
      label += node.data;
    } else if (
      node instanceof HTMLElement &&
      (!materialEligible(node) || node.matches('button,a,img,svg,canvas,video,[contenteditable]'))
    )
      return false;
    else if (!(node instanceof HTMLElement)) return false;
  }
  return !(element instanceof HTMLButtonElement && sensitive.test(label.replace(/\s+/g, '-')));
}
export function targetRect(target: Target): DOMRect {
  return target.material && target.material !== 'text'
    ? target.element.getBoundingClientRect()
    : target.range.getBoundingClientRect();
}
/** No layout reads: safe to use when a SPA edits or recycles an anchor. */
export function valid(target: Target): boolean {
  if (target.material && target.material !== 'text') {
    return (
      target.element.isConnected &&
      target.node === target.element &&
      materialEligible(target.element) &&
      (target.material !== 'panel' || plainPanel(target.element)) &&
      signature(target.element) === target.signature
    );
  }
  return (
    target.node.isConnected &&
    target.node.parentElement === target.element &&
    target.range.startContainer === target.node &&
    target.range.endContainer === target.node &&
    eligible(target.element) &&
    target.range.toString() === target.text
  );
}
export function fresh(target: Target): boolean {
  if (!valid(target)) return false;
  if (target.material && target.material !== 'text' && !materialGeometry(target.element))
    return false;
  const r = targetRect(target);
  target.rect = r;
  return (
    (!target.material ||
      target.material === 'text' ||
      materialExtent(r, target.material === 'rule')) &&
    r.width > 12 &&
    r.height > (target.material === 'rule' ? 0 : 5) &&
    r.top >= 6 &&
    r.bottom <= innerHeight - 6 &&
    r.left >= 0 &&
    r.right <= innerWidth
  );
}

/** One small object, with conservative fallback for complex page surfaces. */
function targetFromElement(element: HTMLElement, hover = false): Target | null {
  const material: Material | null =
    element instanceof HTMLImageElement
      ? 'image'
      : element.matches('hr,[role="separator"]')
        ? 'rule'
        : element.matches('button[type="button"],article,.card,[role="article"]')
          ? 'panel'
          : null;
  if (!material || !materialEligible(element)) return null;
  if (material === 'panel' && !plainPanel(element)) return null;
  const rect = element.getBoundingClientRect();
  if (
    rect.width < 12 ||
    rect.height < 1 ||
    rect.left < 0 ||
    rect.right > innerWidth ||
    rect.top < (hover ? 6 : 45) ||
    rect.bottom > innerHeight - (hover ? 6 : 95) ||
    !materialExtent(rect, material === 'rule')
  )
    return null;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0')
    return null;
  if (!materialGeometry(element, (node) => (node === element ? style : getComputedStyle(node))))
    return null;
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  if (hit && !element.contains(hit)) return null;
  const range = document.createRange();
  range.selectNode(element);
  return {
    range,
    element,
    node: element,
    material,
    signature: signature(element),
    text: '',
    rect,
    font: style.font,
    letterSpacing: style.letterSpacing,
    color: style.color,
  };
}

/** Only the chosen text is shortened/measured, keeping Feral's destruction local. */
export function focusText(target: Target, personality: Personality, x: number): Target {
  if (target.material && target.material !== 'text') return target;
  const chars = Array.from(target.text);
  const budget = personality === 'curious' ? 16 : personality === 'feral' ? 30 : 20;
  if (chars.length <= budget) return target;
  const center = Math.round(
    clampFraction((x - target.rect.left) / target.rect.width) * chars.length,
  );
  const start = Math.max(0, Math.min(chars.length - budget, center - Math.floor(budget / 2)));
  const range = document.createRange();
  const offset = target.range.startOffset + chars.slice(0, start).join('').length;
  const text = chars.slice(start, start + budget).join('');
  range.setStart(target.node, offset);
  range.setEnd(target.node, offset + text.length);
  return { ...target, range, text, rect: range.getBoundingClientRect() };
}
const clampFraction = (n: number) => Math.max(0, Math.min(1, n));

interface Cursor {
  next: Node | null;
  offset: number;
}
const cursors = new WeakMap<AbortSignal, Cursor>();
const MAX_NODES = 1800;
const MAX_RANGES = 80;
/** A manual walker bounds rejected nodes as well as accepted ones. TreeWalker.nextNode
 * can otherwise spend an unbounded slice skipping thousands of excluded siblings. */
function nextAfter(node: Node, root: Node, descend: boolean): Node | null {
  if (descend && node.firstChild) return node.firstChild;
  let next: Node | null = node;
  while (next && next !== root) {
    if (next.nextSibling) return next.nextSibling;
    next = next.parentNode;
  }
  return null;
}
/** Build one bounded, visible source-line range without changing the page. */
function targetFromText(text: Text, offsetHint: number, hover = false): Target | null {
  const element = text.parentElement;
  if (!element || !eligible(element)) return null;
  // Cap the text read too; giant source/code nodes are not a useful target.
  if (text.length < 4 || text.length > 12000) return null;
  const raw = text.data;
  let offset = Math.min(offsetHint, Math.max(0, raw.length - 4));
  while (offset > 0 && !/\s/.test(raw[offset - 1]) && offsetHint - offset < 32) offset--;
  while (offset < raw.length && /\s/.test(raw[offset])) offset++;
  let end = Math.min(raw.length, offset + 64);
  if (end < raw.length) {
    const space = raw.lastIndexOf(' ', end);
    if (space > offset + 12) end = space;
  }
  while (end > offset && /\s/.test(raw[end - 1])) end--;
  if (end - offset < 4) return null;
  const range = document.createRange();
  range.setStart(text, offset);
  range.setEnd(text, end);
  let rects = range.getClientRects();
  // Long paragraphs often wrap: shorten the candidate until one source line fits.
  while (rects.length > 1 && end - offset > 9) {
    end = offset + Math.max(4, Math.floor((end - offset) * 0.68));
    range.setEnd(text, end);
    rects = range.getClientRects();
  }
  if (rects.length !== 1) return null;
  const rect = rects[0];
  if (
    rect.width < 22 ||
    rect.width > innerWidth * 0.75 ||
    rect.height < 5 ||
    rect.top < (hover ? 6 : 45) ||
    rect.bottom > innerHeight - (hover ? 6 : 95) ||
    rect.left < 0 ||
    rect.right > innerWidth ||
    rect.height > 110
  )
    return null;
  const style = getComputedStyle(element);
  if (
    style.visibility !== 'visible' ||
    style.opacity === '0' ||
    style.display === 'none' ||
    style.color === 'rgba(0, 0, 0, 0)'
  )
    return null;
  // Fully clipped or covered text cannot become an apparent detached floating word.
  const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  if (center && !element.contains(center) && !center.contains(element)) return null;
  return {
    range,
    element,
    node: text,
    text: range.toString(),
    rect,
    font: style.font,
    letterSpacing: style.letterSpacing,
    color: style.color,
  };
}

const identities = new WeakMap<HTMLElement, number>();
let nextIdentity = 1;
/** Opaque, session-local element identity: never page text, ids or classes. */
export function targetIdentity(target: Target): string {
  let id = identities.get(target.element);
  if (!id) {
    id = nextIdentity++;
    identities.set(target.element, id);
  }
  return `t${id}`;
}

/** Pointer work stays local: at most 100 nodes / 12 measured text ranges.
 * An excluded hit is a hard boundary; never climb out of a form or editor. */
export function targetAtPoint(
  x: number,
  y: number,
  available: (target: Target) => boolean,
): Target | null {
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof HTMLElement) || !materialEligible(hit)) return null;
  const object = hit.closest<HTMLElement>(
    'img,hr,[role="separator"],button,article,.card,[role="article"]',
  );
  // Text inside cards remains text. Empty space/edges and buttons select the object.
  const caretHit = document.caretRangeFromPoint?.(x, y);
  const caretRect = caretHit?.getBoundingClientRect();
  if (
    object &&
    (object.matches('img,hr,[role="separator"],button') ||
      !caretRect ||
      Math.abs(caretRect.x - x) > 12 ||
      y < caretRect.top ||
      y > caretRect.bottom)
  ) {
    const target = targetFromElement(object, true);
    if (target && available(target)) return target;
  }
  if (!eligible(hit)) return null;
  const root = hit;
  if (root === document.body || root === document.documentElement) return null;
  const caret = document.caretRangeFromPoint?.(x, y);
  const caretNode = caret?.startContainer;
  let best: Target | null = null;
  let bestDistance = Infinity;
  let ranges = 0;
  const offer = (node: Text, offset: number) => {
    if (++ranges > 12) return;
    const target = targetFromText(node, offset, true);
    if (!target || !available(target)) return;
    const r = target.rect;
    const distance = Math.hypot(
      Math.max(r.left - x, 0, x - r.right),
      Math.max(r.top - y, 0, y - r.bottom),
    );
    if (distance === 0 && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  };
  if (caretNode?.nodeType === Node.TEXT_NODE && root.contains(caretNode))
    offer(caretNode as Text, caret!.startOffset);
  if (bestDistance === 0) return best;
  let node: Node | null = root;
  for (let seen = 0; node && seen < 100 && ranges < 12; seen++) {
    const current: Node = node;
    const allowed = current.nodeType !== Node.ELEMENT_NODE || eligible(current as HTMLElement);
    node = nextAfter(current, root, allowed);
    if (allowed && current.nodeType === Node.TEXT_NODE && current !== caretNode)
      offer(current as Text, 0);
  }
  return best;
}

/** Viewport seeds find deep-page text immediately; the session cursor also explores
 * progressively. At most 1,800 visited nodes / 80 ranges, in ~2ms cooperative slices. */
export function scanTargets(signal: AbortSignal): Promise<Target[]> {
  return new Promise((resolve) => {
    const result: Target[] = [];
    const body = document.body;
    if (!body || signal.aborted) {
      resolve(result);
      return;
    }
    let cursor = cursors.get(signal);
    if (!cursor) {
      cursor = { next: body.firstChild, offset: 0 };
      cursors.set(signal, cursor);
      signal.addEventListener('abort', () => cursors.delete(signal), { once: true });
    }
    let timer = 0;
    const finish = (targets: Target[]) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(targets);
    };
    const cancel = () => finish([]);
    signal.addEventListener('abort', cancel, { once: true });
    if (!cursor.next?.isConnected || !body.contains(cursor.next)) cursor.next = body.firstChild;
    const roots: Node[] = [];
    const seedOffsets = new Map<Text, number>();
    const found = new Set<Node>();
    // Hit testing is bounded independently of document size, including nested scrollers.
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        const x = (innerWidth * (col + 0.5)) / 6;
        const y = 72 + (Math.max(1, innerHeight - 190) * (row + 0.5)) / 5;
        const hit = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!hit || hit === body || hit === document.documentElement || !materialEligible(hit))
          continue;
        const caret = document.caretRangeFromPoint?.(x, y);
        if (caret?.startContainer.nodeType === Node.TEXT_NODE) {
          const node = caret.startContainer as Text;
          if (node.parentElement && eligible(node.parentElement) && !found.has(node)) {
            seedOffsets.set(node, caret.startOffset);
            roots.push(node);
            found.add(node);
          }
        }
        const root = hit.closest('p,h1,h2,h3,h4,h5,h6,a,li,dt,dd,blockquote,figcaption') ?? hit;
        if (!found.has(root)) {
          roots.push(root);
          found.add(root);
        }
      }
    }
    const used = new Map<Node, Set<number>>();
    let rootIndex = 0;
    let root = roots[0] ?? null;
    let node: Node | null = root;
    let seen = 0;
    let seeded = 0;
    let walkingBody = !root;
    if (walkingBody) {
      root = body;
      node = cursor.next;
    }
    const offer = (text: Text, offsetHint: number) => {
      const target = targetFromText(text, offsetHint);
      if (!target || used.get(text)?.has(target.range.startOffset)) return;
      let offsets = used.get(text);
      if (!offsets) {
        offsets = new Set();
        used.set(text, offsets);
      }
      offsets.add(target.range.startOffset);
      result.push(target);
    };
    const slice = () => {
      if (signal.aborted) {
        finish([]);
        return;
      }
      const start = performance.now();
      while (seen < MAX_NODES && result.length < MAX_RANGES) {
        if (!walkingBody && (!node || seeded >= 900)) {
          if (++rootIndex < roots.length && seeded < 900) {
            root = roots[rootIndex];
            node = root;
          } else {
            walkingBody = true;
            root = body;
            node = cursor.next;
          }
        }
        if (!node) {
          cursor.next = body.firstChild;
          cursor.offset = (cursor.offset + 37) % 128;
          finish(result);
          return;
        }
        const current: Node = node;
        seen++;
        if (!walkingBody) seeded++;
        const allowed =
          current.nodeType !== Node.ELEMENT_NODE || materialEligible(current as HTMLElement);
        node = nextAfter(current, root!, allowed);
        if (walkingBody) cursor.next = node;
        if (allowed && current.nodeType === Node.TEXT_NODE) {
          offer(current as Text, seedOffsets.get(current as Text) ?? cursor.offset);
        } else if (allowed && current instanceof HTMLElement) {
          const target = targetFromElement(current);
          if (target && !used.has(current)) {
            used.set(current, new Set());
            result.push(target);
          }
        }
        if (performance.now() - start >= 2) {
          timer = window.setTimeout(slice, 16);
          return;
        }
      }
      if (walkingBody && !cursor.next) cursor.next = body.firstChild;
      finish(result);
    };
    // Even the first document walk runs outside the pointer/scroll event handler.
    timer = window.setTimeout(slice, 0);
  });
}
