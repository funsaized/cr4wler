import { defaults, settingsFrom, type Settings } from './types';

// Extension pages share their own origin; demo pages share only the demo origin.
// Never call these helpers from an injected content script on someone else's page.
const settingsKey = 'cr4wler.preferences.v1';
const hintKey = 'cr4wler.first-use.v1';
export function loadPreferences(): Settings {
  try {
    return settingsFrom(JSON.parse(localStorage.getItem(settingsKey) ?? '{}'));
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(settings: Settings) {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(settingsFrom(settings)));
  } catch {
    // A denied/full store must not prevent local play or restoration.
  }
}
export function needsHint(): boolean {
  try {
    return localStorage.getItem(hintKey) !== 'shown';
  } catch {
    return false;
  }
}
export function rememberHint() {
  try {
    localStorage.setItem(hintKey, 'shown');
  } catch {
    // The in-document engine still shows at most one hint.
  }
}
