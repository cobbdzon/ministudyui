import type { Rating, SrsPreview, SrsResult, SrsState } from '../../../shared/types.js';

const Q = [0, 3, 4, 5];

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + days * 86400000);
  return d.toISOString();
}

function fmt(days: number): string {
  if (days <= 0) return '10m';
  if (days < 1) return Math.round(days * 1440) + 'm';
  return Math.round(days) + 'd';
}

export function schedule(state: SrsState, rating: Rating, now?: string): SrsResult {
  const at = now || new Date().toISOString();
  const s = {
    ease: state.ease ?? 2.5,
    interval_days: state.interval_days ?? 0,
    reps: state.reps ?? 0,
    lapses: state.lapses ?? 0,
  };
  if (rating === 0) {
    return {
      ease: Math.max(1.3, s.ease - 0.2),
      interval_days: 0,
      reps: 0,
      lapses: s.reps > 0 ? s.lapses + 1 : s.lapses,
      due_at: new Date(new Date(at).getTime() + 10 * 60000).toISOString(),
      last_reviewed_at: at,
    };
  }
  const q = Q[rating];
  let interval: number;
  if (s.reps === 0) {
    // A single 1-day base rounds hard/good/easy to the same value, so the
    // rating buttons all read "1d". Give a new card a distinct first interval
    // per passing rating; the ease adjustment below still applies.
    interval = rating === 1 ? 1 : rating === 2 ? 3 : 7;
  } else {
    interval = s.reps === 1 ? 6 : Math.round(s.interval_days * s.ease);
    if (rating === 1) interval = Math.max(1, Math.round(interval * 0.8));
    if (rating === 3) interval = Math.round(interval * 1.3);
  }
  const ef = Math.max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return {
    ease: ef,
    interval_days: interval,
    reps: s.reps + 1,
    lapses: s.lapses,
    due_at: addDays(at, interval),
    last_reviewed_at: at,
  };
}

export function preview(state: SrsState, now?: string): SrsPreview {
  const at = now || new Date().toISOString();
  const res: Partial<SrsPreview> = {};
  const labels = ['again', 'hard', 'good', 'easy'] as const;
  for (let r = 0; r < 4; r++) {
    const ns = schedule(state, r as Rating, at);
    res[labels[r]] = r === 0 ? '10m' : fmt(ns.interval_days);
  }
  return res as SrsPreview;
}
