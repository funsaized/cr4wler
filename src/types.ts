export type Personality = 'curious' | 'feral' | 'dreamy';
export const spiderTypes: Record<Personality, { name: string; cue: string; description: string }> =
  {
    curious: { name: 'Widow', cue: '✦', description: 'Long legs. Precise little bites.' },
    dreamy: {
      name: 'Orb-weaver',
      cue: '☾',
      description: 'Soft round body. Slow steps and gentle peeling.',
    },
    feral: {
      name: 'Jumping spider',
      cue: '↯',
      description: 'Big front eyes. Quick pounces and local shredding.',
    },
  };
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
export function intensityLabel(intensity: number): string {
  return `${Math.round(intensity * 100)}% · ${intensity < 0.33 ? 'Gentle' : intensity < 0.7 ? 'Playful' : 'Unsupervised'}`;
}
export function statusLabel(s: Status, touchOnly = false): string {
  if (!s.active) return 'No visitor. Summon when you’re ready.';
  if (s.paused) return 'Paused. Your trail stays here. Resume any time.';
  if (s.reducedMotion) return 'Reduced motion: quiet company, no new strikes.';
  if (s.recordLimitReached) return 'Trail is full. Restore for a fresh start.';
  if (touchOnly) return 'Active · Exploring. Cursor guide needs a pointer.';
  return s.followMouse
    ? 'Active · Hover chooses the next piece. Edges scroll.'
    : 'Active · Exploring. Follow my cursor lets you guide.';
}
