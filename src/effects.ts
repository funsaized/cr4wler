import type { Target } from './targets';

export type Effect = 'peel' | 'shear' | 'scatter' | 'disassemble' | 'erase';
export const effects: readonly Effect[] = ['peel', 'scatter', 'shear', 'disassemble', 'erase'];
export interface Shard {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  rotation: number;
  skew: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  color: string;
}
export interface Clip {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Projection {
  id: number;
  target: Target;
  effect: Effect;
  color: string;
  accent: string;
  shards: Shard[];
  progress: number;
  clip: Clip;
  el: HTMLSpanElement | null;
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const ease = (t: number) => t * t * (3 - 2 * t);
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
/** At most 16 short inert text runs. Live ranges provide placement after reflow;
 * all artistic offsets are seeded, so remounting never changes an existing scar. */
export function layoutShards(record: Projection, intensity: number): Shard[] {
  const { target, effect, id, color, accent } = record;
  const chars = Array.from(target.text);
  const count = effect === 'peel' ? 1 : effect === 'shear' ? 3 : Math.min(16, chars.length);
  const shards: Shard[] = [];
  let offset = 0;
  const force = 0.62 + intensity * 0.66;
  for (let i = 0; i < count; i++) {
    const text = chars
      .slice(Math.floor((i * chars.length) / count), Math.floor(((i + 1) * chars.length) / count))
      .join('');
    if (!text) continue;
    const range = document.createRange();
    range.setStart(target.node, target.range.startOffset + offset);
    offset += text.length;
    range.setEnd(target.node, target.range.startOffset + offset);
    const box = range.getBoundingClientRect();
    const n = noise(id * 31 + i);
    const m = noise(id * 19 + i * 3);
    const direction = id % 2 ? -1 : 1;
    const shard: Shard = {
      text,
      x: box.x - target.rect.x,
      y: box.y - target.rect.y,
      width: box.width,
      height: Math.max(5, box.height),
      dx: 0,
      dy: 0,
      rotation: 0,
      skew: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      color: i % 3 === 1 ? accent : color,
    };
    if (effect === 'peel') {
      shard.dx = direction * (30 + n * 20) * force;
      shard.dy = -(26 + m * 30) * force;
      shard.rotation = direction * (11 + n * 13);
      shard.scaleX = 1.04 + intensity * 0.15;
      shard.scaleY = 1.1;
      shard.skew = direction * 7;
    } else if (effect === 'shear') {
      shard.dx = (i - 1) * 17 * force;
      shard.dy = (i % 2 ? 9 : -14) * force;
      shard.rotation = (i - 1) * 4;
      shard.skew = (i % 2 ? -1 : 1) * (15 + intensity * 12);
      shard.scaleX = 1.08;
    } else if (effect === 'scatter') {
      shard.dx = ((i / Math.max(1, count - 1) - 0.5) * 38 + (n - 0.5) * 32) * force;
      shard.dy = (m - 0.54) * 100 * force;
      shard.rotation = (n - 0.5) * 74;
      shard.scaleX = shard.scaleY = 0.83 + m * 0.46;
    } else if (effect === 'disassemble') {
      shard.dx = (n - 0.5) * 18 * force;
      shard.dy = (i % 2 ? 1 : -1) * (10 + m * 30) * force;
      shard.rotation = ((i % 3) - 1) * 9;
      shard.scaleY = 0.73 + n * 0.38;
      shard.opacity = i % 5 === 3 ? 0.34 : 0.94;
    } else {
      shard.dx = direction * (10 + i * 2.2) * force;
      shard.dy = (n - 0.5) * 11;
      shard.scaleX = 0.64 + n * 0.35;
      shard.scaleY = 0.65 + m * 0.3;
      // A ragged erasure leaves small readable debris, never a page-sized flash.
      shard.opacity = i % 4 === 0 ? 0.72 : i % 3 === 0 ? 0.19 : 0.035;
      shard.rotation = direction * (3 + n * 8);
    }
    shards.push(shard);
  }
  return shards;
}
export function mount(record: Projection, parent: HTMLElement): void {
  const el = document.createElement('span');
  el.className = 'piece';
  el.dataset.recordId = String(record.id);
  el.dataset.effect = record.effect;
  el.setAttribute('aria-hidden', 'true');
  record.el = el;
  rebuild(record);
  parent.append(el);
}
export function rebuild(record: Projection): void {
  if (!record.el) return;
  record.el.replaceChildren();
  for (const shard of record.shards) {
    const el = document.createElement('span');
    el.className = 'shard';
    el.textContent = shard.text;
    el.style.height = `${shard.height}px`;
    el.style.lineHeight = `${shard.height}px`;
    el.style.color = shard.color;
    record.el.append(el);
  }
  record.el.style.font = record.target.font;
  record.el.style.letterSpacing = record.target.letterSpacing;
  record.el.style.setProperty('--scar', record.color);
}
function progress(record: Projection, i: number): number {
  const stagger = record.effect === 'peel' ? 0 : (i / Math.max(1, record.shards.length - 1)) * 0.19;
  return ease(clamp((record.progress - stagger) / (1 - stagger), 0, 1));
}
export function place(record: Projection): void {
  const el = record.el;
  if (!el) return;
  const rect = record.target.rect;
  el.style.transform = `translate3d(${rect.x}px,${rect.y}px,0)`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.clipPath = `inset(${record.clip.top - rect.top}px ${rect.right - record.clip.right}px ${rect.bottom - record.clip.bottom}px ${record.clip.left - rect.left}px)`;
  paint(record);
}
/** Write-only animation. Geometry is measured only on acquisition and layout events. */
export function paint(record: Projection): void {
  if (!record.el) return;
  record.el.dataset.phase = record.progress < 1 ? 'strike' : 'aftermath';
  record.el.style.willChange = record.progress < 1 ? 'transform' : 'auto';
  for (let i = 0; i < record.shards.length; i++) {
    const shard = record.shards[i];
    const el = record.el.children[i] as HTMLElement;
    if (!el) continue;
    const t = progress(record, i);
    el.style.transform = `translate(${shard.x + shard.dx * t}px,${shard.y + shard.dy * t}px) rotate(${shard.rotation * t}deg) skewX(${shard.skew * t}deg) scale(${1 + (shard.scaleX - 1) * t},${1 + (shard.scaleY - 1) * t})`;
    el.style.opacity = String(1 + (shard.opacity - 1) * t);
  }
}
/** Overflow uses one shared, viewport-sized surface, preserving visible scars even
 * when reflow brings more than the DOM projection budget back into the viewport. */
export function draw(record: Projection, ctx: CanvasRenderingContext2D): void {
  const rect = record.target.rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    record.clip.left,
    record.clip.top,
    record.clip.right - record.clip.left,
    record.clip.bottom - record.clip.top,
  );
  ctx.clip();
  ctx.font = record.target.font;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = record.target.letterSpacing;
  for (let i = 0; i < record.shards.length; i++) {
    const shard = record.shards[i];
    const t = progress(record, i);
    ctx.save();
    ctx.translate(
      rect.x + shard.x + shard.dx * t,
      rect.y + shard.y + shard.dy * t + shard.height * 0.5,
    );
    ctx.rotate((shard.rotation * t * Math.PI) / 180);
    ctx.transform(1, 0, Math.tan((shard.skew * t * Math.PI) / 180), 1, 0, 0);
    ctx.scale(1 + (shard.scaleX - 1) * t, 1 + (shard.scaleY - 1) * t);
    ctx.globalAlpha = 1 + (shard.opacity - 1) * t;
    ctx.fillStyle = shard.color;
    const metrics = ctx.measureText(shard.text);
    ctx.fillText(
      shard.text,
      0,
      (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2,
    );
    ctx.restore();
  }
  ctx.restore();
}
