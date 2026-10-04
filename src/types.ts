export type Personality = 'curious' | 'feral' | 'dreamy';
export interface Settings {
  personality: Personality;
  intensity: number;
  followMouse: boolean;
}
export interface Status extends Settings {
  active: boolean;
  paused: boolean;
  reducedMotion: boolean;
  fragments: number;
  visibleFragments?: number;
  recordLimitReached?: boolean;
  phase?:
    | 'arrive'
    | 'scan'
    | 'notice'
    | 'investigate'
    | 'lock'
    | 'prepare'
    | 'strike'
    | 'settle'
    | 'aftermath'
    | 'limit'
    | 'quiet'
    | 'paused'
    | 'recover';
}
export type Command = {
  type: 'CR4WLER';
  action: 'summon' | 'pause' | 'restore' | 'status' | 'configure';
  settings?: Partial<Settings>;
  firstUse?: boolean;
};
export const defaults: Settings = { personality: 'curious', intensity: 0.55, followMouse: false };
export const touchOnlyMedia = '(any-hover: none) and (any-pointer: coarse)';
export function settingsFrom(value: Partial<Settings> | null = {}): Settings {
  value ??= {};
  return {
    personality: ['curious', 'feral', 'dreamy'].includes(value.personality ?? '')
      ? value.personality!
      : 'curious',
    followMouse: value.followMouse === true,
    intensity: Math.max(0, Math.min(1, Number.isFinite(value.intensity) ? value.intensity! : 0.55)),
  };
}
