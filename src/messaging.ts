import type { Personality, Status } from './types';
import { activities, copy, intensityWords, temperamentActivities } from './vocabulary';

export function intensityLabel(intensity: number): string {
  return `${Math.round(intensity * 100)}% · ${intensityWords[intensity < 0.33 ? 0 : intensity < 0.7 ? 1 : 2]}`;
}
export function statusLabel(s: Status, touchOnly = false): string {
  if (!s.active) return copy.inactive;
  if (s.paused) return copy.paused;
  if (s.reducedMotion) return copy.reducedMotion;
  if (s.recordLimitReached) return copy.limit;
  if (touchOnly) return copy.touch;
  return s.followMouse ? copy.following : copy.exploring;
}

// Advance only when activity/personality changes. No timers, random draws, or
// per-frame phrase churn; separate engines own separate, bounded counters.
export function createActivityVoice() {
  const visits = new Map<string, number>();
  let previous = '',
    phrase = '';
  return (
    activity: keyof typeof activities | 'scan' | 'prepare' | 'strike',
    personality: Personality,
  ) => {
    const key = `${personality}:${activity}`;
    if (key !== previous) {
      const pool =
        activity === 'scan' || activity === 'prepare' || activity === 'strike'
          ? temperamentActivities[personality][activity]
          : activities[activity];
      const index = visits.get(key) ?? 0;
      phrase = pool[index];
      visits.set(key, (index + 1) % pool.length);
      previous = key;
    }
    return phrase;
  };
}

export function paintCopy(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-copy]').forEach((element) => {
    const key = element.dataset.copy as keyof typeof copy;
    if (Object.hasOwn(copy, key)) element.textContent = copy[key];
  });
}

export function paintSummon(button: HTMLButtonElement, active: boolean) {
  const icon = document.createElement('span');
  icon.textContent = active ? '✦' : '↗';
  button.replaceChildren(`${active ? copy.summoned : copy.summon} `, icon);
}
