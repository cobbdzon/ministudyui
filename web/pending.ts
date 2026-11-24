// Stall feedback state machine. Kept DOM-free so the timing rules can be unit
// tested; the chip renderer lives in ui.ts and subscribes to this singleton.

export type PendingPhase = 'idle' | 'busy' | 'stalled' | 'long';

export interface PendingState {
  phase: PendingPhase;
  visible: boolean;
  label: string;
  count: number;
  elapsedMs: number;
}

export interface PendingClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PendingTask {
  end(): void;
}

export interface PendingOptions {
  label?: string;
  /** An explicit user action wins the label when several requests are in flight. */
  action?: boolean;
  /** Fire-and-forget work (e.g. ui_context writes) is not shown. */
  silent?: boolean;
}

interface Entry {
  id: number;
  label: string;
  startedAt: number;
  action: boolean;
}

const REVEAL_MS = 250;
const STALLED_MS = 8_000;
const LONG_MS = 20_000;

export function createPending(clock: PendingClock) {
  let nextId = 0;
  const entries = new Map<number, Entry>();
  const listeners = new Set<(state: PendingState) => void>();
  let timers: unknown[] = [];
  let tickTimer: unknown = null;
  let dismissed = false;

  function oldest(): Entry | undefined {
    let best: Entry | undefined;
    for (const entry of entries.values()) {
      if (!best || entry.startedAt < best.startedAt) best = entry;
    }
    return best;
  }

  function currentLabel(): string {
    let best: Entry | undefined;
    for (const entry of entries.values()) {
      if (!best) { best = entry; continue; }
      if (entry.action !== best.action) {
        if (entry.action) best = entry;
      } else if (entry.startedAt < best.startedAt) {
        best = entry;
      }
    }
    return best?.label ?? 'Working…';
  }

  function state(): PendingState {
    const first = oldest();
    const elapsedMs = first ? Math.max(0, clock.now() - first.startedAt) : 0;
    const phase: PendingPhase = !first ? 'idle'
      : elapsedMs >= LONG_MS ? 'long'
      : elapsedMs >= STALLED_MS ? 'stalled'
      : elapsedMs >= REVEAL_MS ? 'busy'
      : 'idle';
    return {
      phase,
      visible: !dismissed && phase !== 'idle',
      label: currentLabel(),
      count: entries.size,
      elapsedMs,
    };
  }

  function emit(): void {
    const snapshot = state();
    for (const listener of listeners) listener(snapshot);
  }

  function clearTimers(): void {
    for (const timer of timers) clock.clearTimeout(timer);
    timers = [];
    if (tickTimer !== null) {
      clock.clearTimeout(tickTimer);
      tickTimer = null;
    }
  }

  function tick(): void {
    emit();
    if (entries.size && !dismissed) tickTimer = clock.setTimeout(tick, 1_000);
  }

  function schedule(): void {
    clearTimers();
    const first = oldest();
    if (!first) {
      emit();
      return;
    }
    const now = clock.now();
    const at = (ms: number) => Math.max(0, first.startedAt + ms - now);
    timers.push(clock.setTimeout(emit, at(REVEAL_MS)));
    timers.push(clock.setTimeout(emit, at(STALLED_MS)));
    timers.push(clock.setTimeout(emit, at(LONG_MS)));
    tickTimer = clock.setTimeout(tick, 1_000);
    emit();
  }

  return {
    begin(label: string = 'Working…', opts: { action?: boolean } = {}): PendingTask {
      const id = ++nextId;
      entries.set(id, { id, label, startedAt: clock.now(), action: !!opts.action });
      schedule();
      let ended = false;
      return {
        end() {
          if (ended) return;
          ended = true;
          entries.delete(id);
          if (entries.size === 0) dismissed = false;
          schedule();
        },
      };
    },
    dismiss(): void {
      dismissed = true;
      emit();
    },
    reset(): void {
      clearTimers();
      entries.clear();
      dismissed = false;
      emit();
    },
    subscribe(listener: (state: PendingState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state,
  };
}

export const pending = createPending({
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown,
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});
