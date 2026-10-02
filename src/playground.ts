import { Cr4wler } from './engine';
import type { Settings } from './types';

if (new URLSearchParams(location.search).get('theme') === 'night') {
  document.documentElement.dataset.theme = 'night';
  const themeLink = document.querySelector<HTMLAnchorElement>('#archive-theme');
  if (themeLink) {
    themeLink.href = 'reference.html';
    themeLink.textContent = 'Daylight archive ↗';
  }
}

// An intentionally large, ordinary document exercises progressive discovery.
// All fixture content is synthetic and built locally before activation.
const appendix = document.querySelector('#reference-appendix');
if (appendix) {
  const fragment = document.createDocumentFragment();
  const topics = [
    'Glass architecture',
    'A theory of small disturbances',
    'Footnotes for a passing comet',
    'The geometry of wandering',
    'Letters with an independent life',
    'An atlas of borrowed colors',
  ];
  for (let volume = 1; volume <= 60; volume++) {
    const section = document.createElement('section');
    section.id = `reference-volume-${volume}`;
    const heading = document.createElement('h2');
    heading.textContent = `Collected observations · volume ${String(volume).padStart(2, '0')}`;
    section.append(heading);
    const list = document.createElement('ol');
    list.start = (volume - 1) * 30 + 1;
    for (let item = 0; item < 30; item++) {
      const li = document.createElement('li');
      const author = document.createElement('span');
      author.textContent = `Vale, M.; Thread, E. (${2000 + (item % 26)}). `;
      const link = document.createElement('a');
      link.id = `reference-target-${volume}-${item + 1}`;
      link.href = `#reference-volume-${volume === 60 ? 1 : volume + 1}`;
      link.textContent = topics[(item + volume) % topics.length];
      const journal = document.createElement('i');
      journal.textContent = ` Journal of Digital Wildlife ${volume} (${item + 1}), `;
      const doi = document.createElement('a');
      doi.href = '#reference-top';
      doi.textContent = `doi:10.0000/thread.${volume}.${item + 1}`;
      const note = document.createElement('span');
      note.textContent = ' · Archive copy. Retrieved from a perfectly fictional library.';
      li.append(author, link, journal, doi, note);
      list.append(li);
    }
    section.append(list);
    fragment.append(section);
  }
  appendix.append(fragment);
}

const engine = new Cr4wler();
const summon = document.querySelector<HTMLButtonElement>('#demo-summon')!,
  pause = document.querySelector<HTMLButtonElement>('#demo-pause')!,
  restore = document.querySelector<HTMLButtonElement>('#demo-restore')!,
  personality = document.querySelector<HTMLSelectElement>('#demo-personality')!,
  intensity = document.querySelector<HTMLInputElement>('#demo-intensity')!,
  follow = document.querySelector<HTMLInputElement>('#demo-follow')!;
const settings = (): Settings => ({
  personality: personality.value as Settings['personality'],
  intensity: Number(intensity.value) / 100,
  followMouse: follow.checked,
});
function paint() {
  const s = engine.status();
  summon.disabled = s.active;
  pause.disabled = restore.disabled = !s.active;
  pause.textContent = s.paused ? 'Resume' : 'Pause';
  summon.innerHTML = s.active
    ? 'A visitor has arrived <span>✦</span>'
    : 'Summon your spider <span>↗</span>';
  document.querySelector('#demo-status')!.textContent =
    s.reducedMotion && s.active
      ? 'Reduced motion: quiet company, no new strikes.'
      : s.recordLimitReached
        ? '512 fragments. A complete composition. Reset for a fresh start.'
        : s.active
          ? s.followMouse
            ? `${s.fragments} traces. Hover chooses the next word. Edges scroll. Esc resets.`
            : `${s.fragments} traces left behind. Enable cursor following to take the lead.`
          : 'A growing trail. A completely fresh start with Esc.';
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
follow.addEventListener('change', () => engine.configure(settings()));
intensity.addEventListener('input', () => {
  document.querySelector('#demo-level')!.textContent = `${intensity.value}%`;
  engine.configure(settings());
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setTimeout(paint, 0);
});
document.querySelector('#fixture-form')?.addEventListener('submit', (e) => e.preventDefault());
new MutationObserver(() => paint()).observe(document.documentElement, { childList: true });
// Low-frequency status updates touch only the opted-out control surface.
setInterval(() => {
  if (!document.hidden) paint();
}, 1000);
