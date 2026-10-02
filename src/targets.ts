/** No HTML cloning: text is copied into an inert visual fragment only. */
export interface Target {
  range: Range;
  element: HTMLElement;
  text: string;
  rect: DOMRect;
  font: string;
  letterSpacing: string;
}
const excluded =
  'input,textarea,select,option,button,form,fieldset,label,iframe,canvas,video,audio,script,style,noscript,svg,math,dialog,[popover],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="dialog"],[role="combobox"],[role="menu"],[aria-hidden="true"],[aria-live],[hidden],[inert],[data-cr4wler-ignore]';
const sensitive =
  /(?:password|payment|checkout|credit.?card|billing|signin|sign-in|log-in|login|auth|captcha|account|private|secret|token)/i;
export function eligible(element: HTMLElement): boolean {
  if (element.closest(excluded) || element.getRootNode() !== document) return false;
  // Ancestor names provide a conservative extra boundary around sensitive widgets.
  let ancestor: HTMLElement | null = element;
  for (let n = 0; ancestor && n < 14; n++, ancestor = ancestor.parentElement) {
    if (
      sensitive.test(
        `${ancestor.id} ${ancestor.className} ${ancestor.getAttribute('autocomplete') ?? ''}`,
      )
    )
      return false;
  }
  return true;
}
export function fresh(target: Target): boolean {
  if (
    !target.element.isConnected ||
    !eligible(target.element) ||
    target.range.toString() !== target.text
  )
    return false;
  const r = target.range.getBoundingClientRect();
  target.rect = r;
  return (
    r.width > 12 &&
    r.height > 5 &&
    r.top > 35 &&
    r.bottom < innerHeight - 88 &&
    r.left >= 0 &&
    r.right <= innerWidth
  );
}
/** 1,800 nodes maximum per pass, at most 80 useful ranges, ~2 ms slices.
 * The walker prunes unsafe subtrees before ever reading their text. */
export function scanTargets(signal: AbortSignal): Promise<Target[]> {
  return new Promise((resolve) => {
    const result: Target[] = [];
    if (!document.body || signal.aborted) {
      resolve(result);
      return;
    }
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE)
            return eligible(node as HTMLElement)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    let seen = 0;
    const slice = () => {
      if (signal.aborted) {
        resolve([]);
        return;
      }
      const start = performance.now();
      while (seen++ < 1800 && result.length < 80) {
        if (seen % 16 === 0 && performance.now() - start > 2) {
          setTimeout(slice, 16);
          return;
        }
        const node = walker.nextNode();
        if (!node) {
          resolve(result);
          return;
        }
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const raw = node.textContent ?? '';
        const trimmed = raw.trim();
        const element = node.parentElement;
        if (!element || trimmed.length < 4 || trimmed.length > 450 || !eligible(element)) continue;
        // The first short phrase makes a readable, bounded piece of type.
        const offset = raw.indexOf(trimmed);
        let length = Math.min(trimmed.length, 64);
        if (length < trimmed.length) {
          const space = trimmed.lastIndexOf(' ', length);
          if (space > 12) length = space;
        }
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + length);
        const rects = range.getClientRects();
        if (rects.length !== 1) continue;
        const rect = rects[0];
        if (
          rect.width < 22 ||
          rect.width > innerWidth * 0.7 ||
          rect.top < 60 ||
          rect.bottom > innerHeight - 100 ||
          rect.left < 0 ||
          rect.right > innerWidth ||
          rect.height > 100
        )
          continue;
        const style = getComputedStyle(element);
        if (
          style.visibility !== 'visible' ||
          style.opacity === '0' ||
          style.display === 'none' ||
          style.color === 'rgba(0, 0, 0, 0)'
        )
          continue;
        result.push({
          range,
          element,
          text: range.toString(),
          rect,
          font: style.font,
          letterSpacing: style.letterSpacing,
        });
        if (performance.now() - start > 2) {
          setTimeout(slice, 16);
          return;
        }
      }
      resolve(result);
    };
    slice();
  });
}
