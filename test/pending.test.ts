import { describe, expect, test } from 'bun:test';
import { createPending, type PendingClock, type PendingState } from '../web/pending.js';

function fakeClock(): PendingClock & { advance(ms: number): void } {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(handle) { timers.delete(handle as number); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let nextId = -1;
        let nextAt = Infinity;
        for (const [id, timer] of timers) {
          if (timer.at <= target && timer.at < nextAt) {
            nextId = id;
            nextAt = timer.at;
          }
        }
        if (nextId < 0) break;
        const timer = timers.get(nextId)!;
        timers.delete(nextId);
        now = nextAt;
        timer.fn();
      }
      now = target;
    },
  };
}

function recorder() {
  const states: PendingState[] = [];
  return { states, listener: (s: PendingState) => states.push(s) };
}

describe('stall feedback state machine', () => {
  test('stays hidden for fast replies', () => {
    const clock = fakeClock();
    const pending = createPending(clock);
    const rec = recorder();
    pending.subscribe(rec.listener);
    const task = pending.begin('Saving answer…', { action: true });

    expect(pending.state().visible).toBe(false);
    clock.advance(249);
    expect(pending.state().visible).toBe(false);
    clock.advance(1);
    expect(pending.state().visible).toBe(true);
    expect(pending.state().phase).toBe('busy');
    expect(pending.state().label).toBe('Saving answer…');

    task.end();
    expect(pending.state()).toMatchObject({ phase: 'idle', visible: false, count: 0 });
    expect(rec.states.length).toBeGreaterThan(0);
  });

  test('escalates at 8s and 20s from the oldest pending request', () => {
    const clock = fakeClock();
    const pending = createPending(clock);
    const task = pending.begin('Importing…', { action: true });

    clock.advance(250);
    expect(pending.state().phase).toBe('busy');
    clock.advance(7_750);
    expect(pending.state().phase).toBe('stalled');
    clock.advance(12_000);
    expect(pending.state().phase).toBe('long');
    expect(pending.state().elapsedMs).toBe(20_000);
    task.end();
  });

  test('counts concurrent work and prefers an explicit action label', () => {
    const clock = fakeClock();
    const pending = createPending(clock);
    const background = pending.begin('Loading stats…');
    clock.advance(100);
    const action = pending.begin('Saving review…', { action: true });

    const state = pending.state();
    expect(state.count).toBe(2);
    expect(state.label).toBe('Saving review…');
    clock.advance(250);
    expect(pending.state().visible).toBe(true);

    action.end();
    expect(pending.state().label).toBe('Loading stats…');
    expect(pending.state().count).toBe(1);
    background.end();
  });

  test('ending a task twice is harmless', () => {
    const clock = fakeClock();
    const pending = createPending(clock);
    const task = pending.begin('Saving card…', { action: true });
    clock.advance(1_000);
    task.end();
    task.end();
    expect(pending.state().count).toBe(0);
    expect(pending.state().visible).toBe(false);
  });

  test('dismiss hides the chip until every request settles', () => {
    const clock = fakeClock();
    const pending = createPending(clock);
    const first = pending.begin('Importing…', { action: true });
    clock.advance(20_000);
    expect(pending.state().phase).toBe('long');

    pending.dismiss();
    expect(pending.state().visible).toBe(false);
    const second = pending.begin('Saving answer…', { action: true });
    clock.advance(250);
    expect(pending.state().visible).toBe(false);

    first.end();
    second.end();
    expect(pending.state().visible).toBe(false);
    const third = pending.begin('Deleting deck…', { action: true });
    clock.advance(250);
    expect(pending.state().visible).toBe(true);
    third.end();
  });

  test('reset clears everything', () => {
    const clock = fakeClock();
    const pending = createPending(clock);
    pending.begin('Working…', { action: true });
    clock.advance(1_000);
    pending.reset();
    expect(pending.state()).toMatchObject({ phase: 'idle', visible: false, count: 0 });
  });
});
