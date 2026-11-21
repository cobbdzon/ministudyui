import type { Api } from './api.js';
import type { ChangeEvent } from '../shared/types.js';
import type { icon } from './icons.js';
import type { escapeHtml } from './math.js';
import type { toast } from './ui.js';

export type ViewId = 'home' | 'review' | 'deck' | 'quizzes' | 'quiz' | 'attempt' | 'grading' | 'stats' | 'import';
export type RoutedViewId = Exclude<ViewId, 'import'>;

export interface AppContext {
  api: Api;
  icon: typeof icon;
  esc: typeof escapeHtml;
  toast: typeof toast;
  go(hash: string): void;
  onChange(handler: (changes: ChangeEvent[]) => void): () => void;
  params: string[];
  viewId: ViewId;
}

export type Mount = (el: HTMLElement, ctx: AppContext) => Promise<void | (() => void)>;
export interface ViewModule { mount: Mount; openImport?(ctx: AppContext): void }

declare global {
  interface WindowEventMap {
    'auth:locked': CustomEvent;
  }
}
