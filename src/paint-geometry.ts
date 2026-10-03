/** Shared conservative paint guards; these read styles, never page content or actions. */
export const radiusFor = (style: CSSStyleDeclaration): number | null => {
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
export const paintClipped = (style: CSSStyleDeclaration): boolean =>
  style.clipPath !== 'none' ||
  (style.getPropertyValue('mask-image') || 'none') !== 'none' ||
  (style.getPropertyValue('-webkit-mask-image') || 'none') !== 'none' ||
  (style.getPropertyValue('mask-border-source') || 'none') !== 'none' ||
  (style.getPropertyValue('-webkit-mask-box-image-source') || 'none') !== 'none' ||
  style.clip !== 'auto';

export const materialExtent = (rect: DOMRect, rule = false): boolean =>
  rect.width <= (rule ? 480 : 360) && rect.height <= (rule ? 8 : 220);

/** Snapshots require untransformed, unfiltered rectangular coordinate systems.
 * Straight scrollers remain supported; curved/paint-clipped ancestors do not. */
export function materialGeometry(
  element: HTMLElement,
  styleFor: (element: HTMLElement) => CSSStyleDeclaration = getComputedStyle,
): boolean {
  let ancestor: HTMLElement | null = element;
  for (let depth = 0; ancestor; depth++, ancestor = ancestor.parentElement) {
    if (depth === 24) return false;
    const css = styleFor(ancestor);
    if (
      css.display === 'none' ||
      css.visibility !== 'visible' ||
      css.opacity !== '1' ||
      css.transform !== 'none' ||
      ['rotate', 'scale', 'translate'].some((key) => {
        const value = css.getPropertyValue(key);
        return value && value !== 'none';
      }) ||
      css.filter !== 'none' ||
      css.mixBlendMode !== 'normal' ||
      paintClipped(css) ||
      (/auto|scroll|hidden|clip/.test(`${css.overflowX} ${css.overflowY}`) && radiusFor(css) !== 0)
    )
      return false;
  }
  return true;
}
