import { Spider } from './spider';
import { spiderTypes, defaults, type Command, type Settings, type Status } from './types';
const settings: Settings = { ...defaults };
let targetId: number | undefined;
const summon = document.querySelector<HTMLButtonElement>('#summon')!,
  pause = document.querySelector<HTMLButtonElement>('#pause')!,
  restore = document.querySelector<HTMLButtonElement>('#restore')!,
  status = document.querySelector<HTMLElement>('#status')!,
  slider = document.querySelector<HTMLInputElement>('#intensity')!,
  follow = document.querySelector<HTMLInputElement>('#follow-mouse')!;
function paint(s: Status) {
  settings.personality = s.personality;
  settings.intensity = s.intensity;
  settings.followMouse = s.followMouse;
  follow.checked = s.followMouse;
  summon.disabled = s.active;
  summon.innerHTML = s.active
    ? 'Your spider is here <span>✦</span>'
    : 'Summon your spider <span>↗</span>';
  pause.disabled = restore.disabled = !s.active;
  pause.textContent = s.paused ? 'Resume' : 'Pause';
  status.textContent = s.reducedMotion
    ? 'Reduced motion is on. Enjoy some quiet company.'
    : s.recordLimitReached
      ? 'Trail is full. Reset for a fresh composition.'
      : s.active
        ? s.followMouse
          ? 'Hover chooses the next word. Page edges scroll. Esc resets.'
          : 'Your trail stays as you scroll. Esc resets everything.'
        : 'Only this tab. Reset or Esc brings every word back.';
  slider.value = String(Math.round(s.intensity * 100));
  paintSettings();
}
const preview = new Spider(document.querySelector<HTMLCanvasElement>('#specimen-preview')!);
preview.resize(318, 132, devicePixelRatio);
function paintSettings() {
  const type = spiderTypes[settings.personality];
  document.querySelector('#specimen-type')!.textContent = type.name.toUpperCase();
  document.querySelector('#type-description')!.textContent = type.description;
  preview.update(0, 0, { x: 185, y: 57 }, { ...settings, reducedMotion: true });
  preview.render();
  document
    .querySelectorAll<HTMLButtonElement>('[data-personality]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.personality === settings.personality)),
    );
  document.querySelector('#level')!.textContent =
    settings.intensity < 0.33 ? 'Gentle' : settings.intensity < 0.7 ? 'Playful' : 'Unsupervised';
}
async function send(action: Command['action'], inject = false) {
  try {
    if (targetId === undefined) throw Error('No tab');
    if (inject)
      await chrome.scripting.executeScript({ target: { tabId: targetId }, files: ['content.js'] });
    const s = (await chrome.tabs.sendMessage(targetId, {
      type: 'CR4WLER',
      action,
      settings,
    } satisfies Command)) as Status;
    paint(s);
  } catch {
    if (action === 'status' || action === 'configure') return;
    status.textContent = 'This page is off limits. Try a regular website or the playground.';
    summon.disabled = false;
  }
}
summon.addEventListener('click', () => void send('summon', true));
pause.addEventListener('click', () => void send('pause'));
restore.addEventListener('click', () => void send('restore'));
document.querySelectorAll<HTMLButtonElement>('[data-personality]').forEach((b) =>
  b.addEventListener('click', () => {
    settings.personality = b.dataset.personality as Settings['personality'];
    paintSettings();
    void send('configure');
  }),
);
slider.addEventListener('input', () => {
  settings.intensity = Number(slider.value) / 100;
  paintSettings();
});
slider.addEventListener('change', () => void send('configure'));
follow.addEventListener('change', () => {
  settings.followMouse = follow.checked;
  void send('configure');
});
paintSettings();
void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  targetId = tab?.id;
  return send('status');
});
