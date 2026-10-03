import type { Target } from './targets';
import type { Personality } from './types';
import type { MaterialPaint } from './materials';

export type Effect = 'peel' | 'shear' | 'scatter' | 'disassemble' | 'erase';
export const effects: readonly Effect[] = ['peel', 'scatter', 'shear', 'disassemble', 'erase'];
export interface Shard {
  kind?: 'text' | 'tile' | 'thread';
  source?: { x: number; y: number; width: number; height: number };
  initialOpacity?: number;
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
  shardLimit?: number;
  progress: number;
  /** Shares the attack clock; absent means a settled legacy/manual projection. */
  settleProgress?: number;
  clip: Clip;
  el: HTMLSpanElement | null;
  personality?: Personality;
  impact?: { x: number; y: number; dx: number; dy: number };
  materialPaint?: MaterialPaint;
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
  if (record.target.material && record.target.material !== 'text')
    return layoutMaterial(record, intensity);
  const { target, effect, id, color } = record;
  const chars = Array.from(target.text);
  const count =
    record.personality === 'feral'
      ? Math.min(record.shardLimit ?? 16, chars.length)
      : effect === 'peel'
        ? Math.min(4, record.shardLimit ?? 16, chars.length)
        : effect === 'shear'
          ? 3
          : Math.min(record.shardLimit ?? 16, chars.length);
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
      color: target.color || color,
    };
    if (effect === 'peel') {
      shard.dx = (30 + n * 20) * force;
      shard.dy = -(26 + m * 30) * force;
      shard.rotation = 11 + n * 13;
      shard.scaleX = 1.04 + intensity * 0.15;
      shard.scaleY = 1.1;
      shard.skew = 7;
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
      shard.dx = (10 + i * 2.2) * force;
      shard.dy = (n - 0.5) * 11;
      shard.scaleX = 0.64 + n * 0.35;
      shard.scaleY = 0.65 + m * 0.3;
      // A ragged erasure leaves small readable debris, never a page-sized flash.
      shard.opacity = i % 4 === 0 ? 0.72 : i % 3 === 0 ? 0.19 : 0.035;
      shard.rotation = 3 + n * 8;
    }
    // The claw pulls away from its recorded contact toward the body. Lateral
    // variation is bounded; record ids seed texture, never the force direction.
    const impact = record.impact ?? { dx: 0.7, dy: -0.7 };
    const energy =
      record.personality === 'feral' ? 1.35 : record.personality === 'dreamy' ? 0.62 : 0.85;
    const distance = (16 + Math.hypot(shard.dx, shard.dy) * 0.35) * energy;
    const spread = (n - 0.5) * (record.personality === 'feral' ? 24 : 9);
    shard.dx = impact.dx * distance - impact.dy * spread;
    shard.dy = impact.dy * distance + impact.dx * spread;
    shard.rotation = (n - 0.5) * (record.personality === 'feral' ? 42 : 18);
    shard.skew *= 0.35;
    shard.scaleX = clamp(shard.scaleX, 0.87, 1.08);
    shard.scaleY = clamp(shard.scaleY, 0.87, 1.08);
    // Readable source-colored remnants; the original erase remains ragged.
    shard.opacity =
      effect === 'erase' ? Math.max(0.28, shard.opacity) : Math.max(0.72, shard.opacity);
    shards.push(shard);
  }
  return shards;
}
function layoutMaterial(record: Projection, intensity: number): Shard[] {
  const { target, materialPaint: appearance } = record;
  const impact = record.impact ?? { x: 0, y: 0, dx: 0.7, dy: -0.7 };
  const energetic = record.personality === 'feral';
  const dreamy = record.personality === 'dreamy';
  const force = (0.6 + intensity * 0.55) * (energetic ? 1.4 : dreamy ? 0.55 : 0.85);
  const shards: Shard[] = [];
  const make = (
    x: number,
    y: number,
    width: number,
    height: number,
    kind: Shard['kind'],
  ): Shard => ({
    kind,
    text: '',
    x,
    y,
    width,
    height,
    dx: 0,
    dy: 0,
    rotation: 0,
    skew: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    color: appearance?.border ?? target.color,
  });
  if (appearance?.bitmap) {
    const grid = target.material === 'image' ? ((record.shardLimit ?? 16) < 9 ? 2 : 3) : 1;
    for (let row = 0; row < grid; row++)
      for (let col = 0; col < grid; col++) {
        const width = target.rect.width / grid,
          height = target.rect.height / grid;
        const shard = make(col * width, row * height, width, height, 'tile');
        shard.source = { x: col / grid, y: row / grid, width: 1 / grid, height: 1 / grid };
        shards.push(shard);
      }
    const ranked = [...shards].sort(
      (a, b) =>
        Math.hypot(a.x + a.width / 2 - impact.x, a.y + a.height / 2 - impact.y) -
        Math.hypot(b.x + b.width / 2 - impact.x, b.y + b.height / 2 - impact.y),
    );
    const moved = target.material === 'panel' ? 1 : energetic ? 4 : dreamy ? 2 : 1;
    for (const shard of ranked.slice(0, moved)) {
      const i = shards.indexOf(shard),
        n = noise(record.id * 31 + i);
      const distance = (target.material === 'panel' ? 4 : 10 + n * 5) * force;
      shard.dx = impact.dx * distance;
      shard.dy = impact.dy * distance;
      shard.rotation = (n - 0.5) * (target.material === 'panel' ? 3 : 9) * force;
      shard.skew = target.material === 'panel' ? impact.dx * 3 * force : 0;
      shard.scaleY = 1 - (target.material === 'panel' ? 0.035 : dreamy ? 0.08 : 0.025) * force;
    }
    if (target.material === 'image') return shards;
    if (!appearance.tear) return shards;
  }
  if (target.material === 'rule') {
    const vertical = target.rect.height > target.rect.width;
    for (let i = 0; i < 3; i++) {
      const width = vertical ? Math.max(1, target.rect.width) : target.rect.width / 3;
      const height = vertical ? target.rect.height / 3 : Math.max(1, appearance?.thickness ?? 1);
      const shard = make(
        vertical ? 0 : i * width,
        vertical ? i * height : 0,
        width,
        height,
        'thread',
      );
      shard.dx = impact.dx * (i === 1 ? 7 : 3) * force;
      shard.dy = impact.dy * (i === 1 ? 7 : 3) * force;
      shard.rotation = (i - 1) * 4 * force;
      shards.push(shard);
    }
    return shards;
  }
  // Unsupported sources retain their pixels. Only a small rim unravels.
  const count = Math.min(energetic ? 5 : dreamy ? 4 : 3, (record.shardLimit ?? 16) - shards.length);
  const horizontal = impact.y < 6 || impact.y > target.rect.height - 6;
  const tear = appearance?.tear;
  const edge = horizontal
    ? clamp(impact.x, 12, target.rect.width - 12)
    : clamp(impact.y, 12, target.rect.height - 12);
  for (let i = 0; i < count; i++) {
    const n = noise(record.id * 17 + i),
      length = 7 + n * 8;
    const shard = make(
      horizontal ? edge + (i - count / 2) * 9 : impact.x,
      horizontal ? impact.y : edge + (i - count / 2) * 9,
      horizontal ? length : Math.max(1, appearance?.thickness ?? 1),
      horizontal ? Math.max(1, appearance?.thickness ?? 1) : length,
      'thread',
    );
    if (tear) {
      shard.x = tear.x + (horizontal ? (i * tear.width) / count : 0);
      shard.y = tear.y + (horizontal ? 0 : (i * tear.height) / count);
      shard.width = horizontal ? tear.width / count : tear.width;
      shard.height = horizontal ? tear.height : tear.height / count;
    }
    shard.initialOpacity = tear ? 1 : 0;
    shard.opacity = 0.85;
    shard.dx = impact.dx * (13 + n * 12) * force;
    shard.dy = impact.dy * (13 + n * 12) * force;
    shard.rotation = (n - 0.5) * 28 * force;
    shards.push(shard);
  }
  return shards;
}
export function mount(record: Projection, parent: HTMLElement): void {
  const el = document.createElement('span');
  el.className = 'piece';
  el.dataset.recordId = String(record.id);
  el.dataset.effect = record.effect;
  el.dataset.material = record.target.material ?? 'text';
  if (record.materialPaint?.fallback) el.dataset.fallback = record.materialPaint.fallback;
  el.setAttribute('aria-hidden', 'true');
  record.el = el;
  rebuild(record);
  parent.append(el);
}
export function rebuild(record: Projection): void {
  if (!record.el) return;
  record.el.replaceChildren();
  for (const shard of record.shards) {
    const bitmap = record.materialPaint?.bitmap;
    const el = document.createElement(shard.kind === 'tile' ? 'canvas' : 'span');
    el.className = 'shard';
    el.textContent = shard.text;
    el.style.height = `${shard.height}px`;
    el.style.lineHeight = `${shard.height}px`;
    el.style.color = shard.color;
    if (shard.kind && shard.kind !== 'text') {
      el.style.width = `${shard.width}px`;
      el.style.transformOrigin = '0 0';
      if (shard.kind === 'thread') el.style.background = shard.color;
      else if (bitmap && shard.source && el instanceof HTMLCanvasElement) {
        const source = shard.source;
        el.width = Math.max(1, Math.round(bitmap.width * source.width));
        el.height = Math.max(1, Math.round(bitmap.height * source.height));
        el.getContext('2d')?.drawImage(
          bitmap,
          bitmap.width * source.x,
          bitmap.height * source.y,
          bitmap.width * source.width,
          bitmap.height * source.height,
          0,
          0,
          el.width,
          el.height,
        );
      }
    }
    record.el.append(el);
  }
  record.el.style.font = record.target.font;
  record.el.style.letterSpacing = record.target.letterSpacing;
  record.el.style.setProperty('--scar', record.color);
}
function progress(record: Projection, i: number): number {
  const stagger = record.effect === 'peel' ? 0 : (i / Math.max(1, record.shards.length - 1)) * 0.19;
  const release = 0.42 + stagger * 0.4;
  // Brief tension lets the reaching claw arrive before the break.
  if (record.progress < release) return -Math.sin((record.progress / release) * Math.PI) * 0.035;
  const t = ease(clamp((record.progress - release) / (1 - release), 0, 1));
  const settle = record.settleProgress ?? 1;
  // Only three pieces drift or hang briefly. Every offset returns to its seeded
  // persistent scar; no perpetual fragment loop or additional animation clock.
  const drift =
    record.progress === 1 && i < 3
      ? Math.sin(settle * Math.PI) * (1 - settle) * (i % 2 ? -0.09 : 0.12)
      : 0;
  return t + drift;
}
/** The reaching claw and material share this one projection, including tension. */
export function gripPosition(record: Projection): { x: number; y: number } {
  const impact = record.impact ?? { x: 0, y: record.target.rect.height / 2 };
  const candidates = record.shards.filter(
    (s) => s.kind !== 'thread' || record.target.material === 'rule',
  );
  const shard = candidates.reduce<Shard | undefined>(
    (best, s) =>
      !best ||
      Math.hypot(s.x + s.width / 2 - impact.x, s.y + s.height / 2 - impact.y) <
        Math.hypot(best.x + best.width / 2 - impact.x, best.y + best.height / 2 - impact.y)
        ? s
        : best,
    undefined,
  );
  if (!shard) return { x: record.target.rect.x + impact.x, y: record.target.rect.y + impact.y };
  const t = progress(record, record.shards.indexOf(shard));
  const originY = shard.kind && shard.kind !== 'text' ? 0 : shard.height / 2;
  const y = (impact.y - shard.y - originY) * (1 + (shard.scaleY - 1) * t);
  const x =
    (impact.x - shard.x) * (1 + (shard.scaleX - 1) * t) +
    Math.tan((shard.skew * t * Math.PI) / 180) * y;
  const angle = (shard.rotation * t * Math.PI) / 180;
  return {
    x: record.target.rect.x + shard.x + shard.dx * t + x * Math.cos(angle) - y * Math.sin(angle),
    y:
      record.target.rect.y +
      shard.y +
      shard.dy * t +
      originY +
      x * Math.sin(angle) +
      y * Math.cos(angle),
  };
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
  const active = record.progress < 1 || (record.settleProgress ?? 1) < 1;
  record.el.dataset.phase = record.progress < 1 ? 'strike' : active ? 'settle' : 'aftermath';
  record.el.style.willChange = active ? 'transform' : 'auto';
  for (let i = 0; i < record.shards.length; i++) {
    const shard = record.shards[i];
    const el = record.el.children[i] as HTMLElement;
    if (!el) continue;
    const t = progress(record, i);
    el.style.transform = `translate(${shard.x + shard.dx * t}px,${shard.y + shard.dy * t}px) rotate(${shard.rotation * t}deg) skewX(${shard.skew * t}deg) scale(${1 + (shard.scaleX - 1) * t},${1 + (shard.scaleY - 1) * t})`;
    const opacity = shard.initialOpacity ?? 1;
    el.style.opacity = String(clamp(opacity + (shard.opacity - opacity) * t, 0, 1));
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
      rect.y +
        shard.y +
        shard.dy * t +
        (shard.kind && shard.kind !== 'text' ? 0 : shard.height * 0.5),
    );
    ctx.rotate((shard.rotation * t * Math.PI) / 180);
    ctx.transform(1, 0, Math.tan((shard.skew * t * Math.PI) / 180), 1, 0, 0);
    ctx.scale(1 + (shard.scaleX - 1) * t, 1 + (shard.scaleY - 1) * t);
    const opacity = shard.initialOpacity ?? 1;
    ctx.globalAlpha = clamp(opacity + (shard.opacity - opacity) * t, 0, 1);
    ctx.fillStyle = shard.color;
    const bitmap = record.materialPaint?.bitmap;
    if (shard.kind === 'tile' && bitmap && shard.source) {
      const source = shard.source;
      ctx.drawImage(
        bitmap,
        bitmap.width * source.x,
        bitmap.height * source.y,
        bitmap.width * source.width,
        bitmap.height * source.height,
        0,
        0,
        shard.width,
        shard.height,
      );
    } else if (shard.kind === 'thread') ctx.fillRect(0, 0, shard.width, shard.height);
    else {
      const metrics = ctx.measureText(shard.text);
      ctx.fillText(
        shard.text,
        0,
        (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2,
      );
    }
    ctx.restore();
  }
  ctx.restore();
}
