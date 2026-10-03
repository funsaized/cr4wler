import type { Target } from './targets';
import { materialGeometry } from './paint-geometry';

export const BITMAP_PIXEL_LIMIT = 1024 * 1024;
export interface MaterialPaint {
  bitmap?: HTMLCanvasElement;
  border: string;
  thickness: number;
  radius: number;
  tear?: { x: number; y: number; width: number; height: number };
  fallback?: 'origin' | 'appearance' | 'budget';
}
/** No fetching, HTML cloning or page writes. Only the active material is sampled.
 * Cross-origin images (even CORS-enabled ones) get an honest outline treatment. */
export function readMaterial(
  target: Target,
  availablePixels: number,
  impact?: { x: number; y: number },
): MaterialPaint {
  const element = target.element;
  const style = getComputedStyle(element);
  const thickness = Math.max(1, parseFloat(style.borderTopWidth) || 1);
  const paint: MaterialPaint = {
    border: parseFloat(style.borderTopWidth) ? style.borderTopColor : style.color,
    thickness,
    radius: parseFloat(style.borderTopLeftRadius) || 0,
  };
  if (!materialGeometry(element, (node) => (node === element ? style : getComputedStyle(node))))
    return { ...paint, fallback: 'appearance' };
  if (target.material === 'rule') return paint;
  const { width, height } = target.rect;
  const scale = Math.min(1, 256 / width, 192 / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  if (canvas.width * canvas.height > availablePixels) return { ...paint, fallback: 'budget' };
  const ctx = canvas.getContext('2d');
  const uniformBorder = ['right', 'bottom', 'left'].every(
    (side) =>
      style.getPropertyValue(`border-${side}-width`) === style.borderTopWidth &&
      style.getPropertyValue(`border-${side}-color`) === style.borderTopColor &&
      style.getPropertyValue(`border-${side}-style`) === style.borderTopStyle,
  );
  const uniformRadius =
    /^\d+(?:\.\d+)?px$/.test(style.borderTopLeftRadius) &&
    ['borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].every(
      (key) => style[key as keyof CSSStyleDeclaration] === style.borderTopLeftRadius,
    );
  if (
    !ctx ||
    style.backgroundImage !== 'none' ||
    style.boxShadow !== 'none' ||
    style.borderImageSource !== 'none' ||
    !uniformBorder ||
    !uniformRadius ||
    !['none', 'solid'].includes(style.borderTopStyle)
  )
    return { ...paint, fallback: 'appearance' };
  ctx.scale(canvas.width / width, canvas.height / height);
  if (element instanceof HTMLImageElement) {
    let url: URL;
    try {
      url = new URL(element.currentSrc, location.href);
    } catch {
      return { ...paint, fallback: 'origin' };
    }
    if (
      url.origin !== location.origin ||
      !/^https?:$/.test(url.protocol) ||
      !element.complete ||
      !element.naturalWidth ||
      !/\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(url.href)
    ) {
      return { ...paint, fallback: 'origin' };
    }
    // Padded/rounded images and arbitrary object positioning need richer raster geometry.
    if (
      paint.radius ||
      ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'].some((key) =>
        parseFloat(style[key as keyof CSSStyleDeclaration] as string),
      ) ||
      style.objectPosition !== '50% 50%' ||
      !['fill', 'cover', 'contain'].includes(style.objectFit)
    ) {
      return { ...paint, fallback: 'appearance' };
    }
    const inset = parseFloat(style.borderLeftWidth) || 0;
    const w = width - inset * 2,
      h = height - inset * 2;
    const ratio =
      style.objectFit === 'cover'
        ? Math.max(w / element.naturalWidth, h / element.naturalHeight)
        : Math.min(w / element.naturalWidth, h / element.naturalHeight);
    const dw = style.objectFit === 'fill' ? w : element.naturalWidth * ratio;
    const dh = style.objectFit === 'fill' ? h : element.naturalHeight * ratio;
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, w, h);
    ctx.clip();
    try {
      ctx.drawImage(element, inset + (w - dw) / 2, inset + (h - dh) / 2, dw, dh);
      // Reading one pixel detects any unexpected taint; never export unsafe pixels.
      ctx.getImageData(0, 0, 1, 1);
    } catch {
      return { ...paint, fallback: 'origin' };
    }
    ctx.restore();
  } else {
    const parts = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
    let part: Node | null = element;
    while (part) {
      const css = part === element ? style : getComputedStyle(part as Element);
      if (
        part !== element &&
        (css.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          parseFloat(css.borderTopWidth) > 0 ||
          /absolute|fixed|sticky/.test(css.position))
      ) {
        return { ...paint, fallback: 'appearance' };
      }
      for (const pseudo of ['::before', '::after']) {
        if (!['none', 'normal'].includes(getComputedStyle(part as Element, pseudo).content))
          return { ...paint, fallback: 'appearance' };
      }
      part = parts.nextNode();
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const labels: { text: string; rect: DOMRect; style: CSSStyleDeclaration }[] = [];
    let node: Node | null;
    for (let visited = 0; (node = walker.nextNode()); visited++) {
      if (visited >= 16) return { ...paint, fallback: 'appearance' };
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement!;
      const css = parent === element ? style : getComputedStyle(parent);
      if (
        css.transform !== 'none' ||
        css.textShadow !== 'none' ||
        css.visibility !== 'visible' ||
        css.display === 'none' ||
        css.opacity !== '1' ||
        /absolute|fixed|sticky/.test(css.position) ||
        (parent !== element && (css.backgroundImage !== 'none' || css.filter !== 'none')) ||
        css.textTransform !== 'none' ||
        (parent !== element && css.backgroundColor !== 'rgba(0, 0, 0, 0)')
      ) {
        return { ...paint, fallback: 'appearance' };
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      if (rects.length !== 1) return { ...paint, fallback: 'appearance' };
      labels.push({ text: node.textContent, rect: rects[0], style: css });
    }
    if (
      !['none', 'solid'].includes(style.borderTopStyle) ||
      ['Right', 'Bottom', 'Left'].some(
        (side) =>
          style.getPropertyValue(`border-${side.toLowerCase()}-color`) !== style.borderTopColor ||
          style.getPropertyValue(`border-${side.toLowerCase()}-width`) !== style.borderTopWidth,
      )
    ) {
      return { ...paint, fallback: 'appearance' };
    }
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, paint.radius);
    ctx.fill();
    for (const label of labels) {
      ctx.font = label.style.font;
      ctx.fillStyle = label.style.color;
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = label.style.letterSpacing;
      ctx.fillText(
        label.text,
        label.rect.x - target.rect.x,
        label.rect.y - target.rect.y + label.rect.height / 2,
      );
    }
  }
  if (parseFloat(style.borderTopWidth)) {
    ctx.strokeStyle = paint.border;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.roundRect(
      thickness / 2,
      thickness / 2,
      width - thickness,
      height - thickness,
      Math.max(0, paint.radius - thickness / 2),
    );
    ctx.stroke();
    if (target.material === 'panel' && impact) {
      const horizontal = impact.y < 6 || impact.y > height - 6;
      const length = Math.min(30, (horizontal ? width : height) - paint.radius * 2 - 4);
      if (length > 6) {
        paint.tear = horizontal
          ? {
              x: Math.max(
                paint.radius + 2,
                Math.min(width - paint.radius - length - 2, impact.x - length / 2),
              ),
              y: impact.y < height / 2 ? 0 : height - thickness,
              width: length,
              height: thickness,
            }
          : {
              x: impact.x < width / 2 ? 0 : width - thickness,
              y: Math.max(
                paint.radius + 2,
                Math.min(height - paint.radius - length - 2, impact.y - length / 2),
              ),
              width: thickness,
              height: length,
            };
        const tear = paint.tear;
        ctx.clearRect(tear.x, tear.y, tear.width, tear.height);
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(tear.x, tear.y, tear.width, tear.height);
      }
    }
  }
  return { ...paint, bitmap: canvas };
}
