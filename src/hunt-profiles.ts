import type { Personality } from './types';
import type { Effect } from './effects';

/** Seconds. Deliberately separate decision rhythms from Spider's physical gait. */
export interface HuntProfile {
  hoverDwell: number;
  retarget: number;
  approachMin: number;
  approachMax: number;
  notice: number;
  lock: number;
  /** Measured pause / crouch / tension before source commitment, in seconds. */
  anticipation: number;
  strike: number;
  settle: number;
  rest: number;
  arrive: number;
  choice: number;
  effects: readonly Effect[];
}
export const huntProfiles: Record<Personality, HuntProfile> = {
  dreamy: {
    hoverDwell: 0.14,
    retarget: 0.12,
    approachMin: 0.48,
    approachMax: 1.35,
    notice: 0.1,
    lock: 0.05,
    anticipation: 0.42,
    strike: 0.42,
    settle: 0.36,
    rest: 0.8,
    arrive: 1.5,
    choice: 0.65,
    effects: ['peel', 'erase', 'shear', 'peel', 'disassemble'],
  },
  curious: {
    hoverDwell: 0.075,
    retarget: 0.065,
    approachMin: 0.2,
    approachMax: 0.72,
    notice: 0.06,
    lock: 0.05,
    anticipation: 0.2,
    strike: 0.3,
    settle: 0.24,
    rest: 0.28,
    arrive: 0.9,
    choice: 0.35,
    effects: ['scatter', 'peel', 'disassemble', 'shear', 'erase'],
  },
  feral: {
    hoverDwell: 0.035,
    retarget: 0.025,
    approachMin: 0.08,
    approachMax: 0.3,
    notice: 0.03,
    lock: 0.025,
    anticipation: 0.09,
    strike: 0.18,
    settle: 0.18,
    rest: 0.09,
    arrive: 0.35,
    choice: 0.12,
    effects: ['shear', 'scatter', 'erase', 'scatter', 'disassemble'],
  },
};
