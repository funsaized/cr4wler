export type Personality = 'curious' | 'feral' | 'dreamy';
export interface Settings {
  personality: Personality;
  intensity: number;
}
export interface Status extends Settings {
  active: boolean;
  paused: boolean;
  reducedMotion: boolean;
  fragments: number;
}
export type Command = {
  type: 'CR4WLER';
  action: 'summon' | 'pause' | 'restore' | 'status' | 'configure';
  settings?: Partial<Settings>;
};
export const defaults: Settings = { personality: 'curious', intensity: 0.55 };
export function settingsFrom(value: Partial<Settings> = {}): Settings {
  return {
    personality: ['curious', 'feral', 'dreamy'].includes(value.personality ?? '')
      ? value.personality!
      : 'curious',
    intensity: Math.max(0, Math.min(1, Number.isFinite(value.intensity) ? value.intensity! : 0.55)),
  };
}
