import { Cr4wler } from './engine';
import type { Settings } from './types';
const engine = new Cr4wler();
const summon = document.querySelector<HTMLButtonElement>('#demo-summon')!,
  pause = document.querySelector<HTMLButtonElement>('#demo-pause')!,
  restore = document.querySelector<HTMLButtonElement>('#demo-restore')!,
  personality = document.querySelector<HTMLSelectElement>('#demo-personality')!,
  intensity = document.querySelector<HTMLInputElement>('#demo-intensity')!;
const settings = (): Settings => ({
  personality: personality.value as Settings['personality'],
  intensity: Number(intensity.value) / 100,
});
function paint() {
  const s = engine.status();
  summon.disabled = s.active;
  pause.disabled = restore.disabled = !s.active;
  pause.textContent = s.paused ? 'Resume' : 'Pause';
  summon.innerHTML = s.active
    ? 'A visitor has arrived <span>✦</span>'
    : 'Summon your spider <span>↗</span>';
  document.querySelector('#demo-status')!.textContent = s.reducedMotion
    ? 'Reduced motion: quiet company, no text grabs.'
    : s.active
      ? 'Move your cursor. It’s a curious little thing.'
      : 'Your words will come back. Promise.';
}
summon.addEventListener('click', () => {
  engine.summon(settings());
  paint();
});
pause.addEventListener('click', () => {
  engine.pause();
  paint();
});
restore.addEventListener('click', () => {
  engine.restore();
  paint();
});
personality.addEventListener('change', () => engine.configure(settings()));
intensity.addEventListener('input', () => {
  document.querySelector('#demo-level')!.textContent = `${intensity.value}%`;
  engine.configure(settings());
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setTimeout(paint, 0);
});
// Keep the fixture inert even if a human deliberately presses its button.
document.querySelector('#fixture-form')?.addEventListener('submit', (e) => e.preventDefault());
// Dock restore also updates the lab controls. Nothing is persisted.
new MutationObserver(() => paint()).observe(document.documentElement, { childList: true });
