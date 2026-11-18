import type { ChangeEvent } from '../shared/types.js';

declare global {
  interface Window {
    renderMathInElement?: (el: Element, options: Record<string, unknown>) => void;
  }
  interface WindowEventMap {
    'live:change': CustomEvent<ChangeEvent[]>;
  }
}

export {};
