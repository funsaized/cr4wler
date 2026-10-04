import { copy, spiderTypes } from './vocabulary';
import { intensityLabel, statusLabel, paintCopy, paintSummon } from './messaging';
import { Spider } from './spider';
import { touchOnlyMedia, type Command, type Settings, type Status } from './types';
import { loadPreferences, savePreferences, needsHint, rememberHint } from './preferences';
paintCopy();
const settings: Settings = loadPreferences();
let targetId: number | undefined;
let live = false;
let revision = 0;
let summoning = false,
  popupCloseRequested = false;
const summon = document.querySelector<HTMLButtonElement>('#summon')!,
  pause = document.querySelector<HTMLButtonElement>('#pause')!,
  restore = document.querySelector<HTMLButtonElement>('#restore')!,
  status = document.querySelector<HTMLElement>('#status')!,
  slider = document.querySelector<HTMLInputElement>('#intensity')!,
  follow = document.querySelector<HTMLInputElement>('#follow-mouse')!;
const preview = new Spider(document.querySelector<HTMLCanvasElement>('#specimen-preview')!);
preview.resize(318, 146, devicePixelRatio);
function paintSettings() {
  const type = spiderTypes[settings.personality];
  document.querySelector('#specimen-type')!.textContent = type.name.toUpperCase();
  document.querySelector('#type-description')!.textContent = type.description;
  preview.update(0, 0, { x: 185, y: 72 }, { ...settings, reducedMotion: true });
  preview.render();
  document
    .querySelectorAll<HTMLButtonElement>('[data-personality]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.personality === settings.personality)),
    );
  slider.value = String(Math.round(settings.intensity * 100));
  follow.checked = settings.followMouse;
  document.querySelector('#level')!.textContent = intensityLabel(settings.intensity);
}
function paint(s: Status) {
  // An inactive document has defaults, not the next-launch preferences.
  if (s.active) {
    settings.personality = s.personality;
    settings.intensity = s.intensity;
    settings.followMouse = s.followMouse;
  }
  live = s.active;
  summon.disabled = s.active || summoning;
  paintSummon(summon, s.active);
  pause.disabled = restore.disabled = !s.active;
  pause.textContent = s.paused ? copy.resume : copy.pause;
  status.textContent = statusLabel(s, matchMedia(touchOnlyMedia).matches);
  paintSettings();
}
function failed(message: string) {
  live = false;
  pause.disabled = restore.disabled = true;
  summon.disabled = false;
  paintSummon(summon, false);
  status.textContent = message;
}
let commands: Promise<Status | undefined> = Promise.resolve(undefined);
function send(action: Command['action'], inject = false) {
  const request = ++revision;
  const snapshot = { ...settings };
  commands = commands.then(() => perform(action, inject, request, snapshot));
  return commands;
}
async function perform(
  action: Command['action'],
  inject: boolean,
  request: number,
  snapshot: Settings,
) {
  let injected = false;
  try {
    await tabReady;
    if (targetId === undefined) throw Error('No tab');
    if (inject) {
      await chrome.scripting.executeScript({ target: { tabId: targetId }, files: ['content.js'] });
      injected = true;
    }
    const s = (await chrome.tabs.sendMessage(targetId, {
      type: 'CR4WLER',
      action,
      settings: snapshot,
      ...(action === 'summon' ? { firstUse: needsHint() } : {}),
    } satisfies Command)) as Status;
    if (typeof s?.active !== 'boolean') throw Error('Missing status');
    if (action === 'summon' && !s.active) throw Error('Launch was not acknowledged');
    if (request === revision) paint(s);
    if (action === 'summon' && s.active) rememberHint();
    return s;
  } catch {
    if (request !== revision) return;
    if (action === 'status' || (action === 'configure' && !live)) return;
    failed(action === 'summon' && !injected ? copy.unavailable : copy.failed);
  }
}
async function launch() {
  if (summoning || popupCloseRequested) return;
  summoning = true;
  summon.disabled = true;
  document
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      '[data-personality], #intensity, #follow-mouse',
    )
    .forEach((control) => {
      control.disabled = true;
    });
  const result = await send('summon', true);
  summoning = false;
  document
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      '[data-personality], #intensity, #follow-mouse',
    )
    .forEach((control) => {
      control.disabled = false;
    });
  if (result?.active && chrome.extension.getViews({ type: 'popup' }).includes(window)) {
    popupCloseRequested = true;
    window.close();
  }
}
function changed() {
  savePreferences(settings);
  paintSettings();
  void send('configure');
}
summon.addEventListener('click', () => void launch());
pause.addEventListener('click', () => void send('pause'));
restore.addEventListener('click', () => void send('restore'));
document.querySelectorAll<HTMLButtonElement>('[data-personality]').forEach((b) =>
  b.addEventListener('click', () => {
    settings.personality = b.dataset.personality as Settings['personality'];
    changed();
  }),
);
slider.addEventListener('input', () => {
  // A pending opening/command reply must not replace an uncommitted slider draft.
  revision++;
  settings.intensity = Number(slider.value) / 100;
  savePreferences(settings);
  paintSettings();
});
slider.addEventListener('change', changed);
follow.addEventListener('change', () => {
  settings.followMouse = follow.checked;
  changed();
});
paintSettings();
const openingRevision = revision;
const tabReady = chrome.tabs
  .query({ active: true, currentWindow: true })
  .then(([tab]) => {
    targetId = tab?.id;
  })
  .catch(() => failed(copy.noTab));
void tabReady.then(() => {
  if (revision === openingRevision) return send('status');
});
