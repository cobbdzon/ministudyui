import type { ErrorCode } from '../../shared/types.js';

export type { ErrorCode } from '../../shared/types.js';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, field?: string, hint?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = field;
    this.hint = hint;
  }
}

export function asAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  return new AppError('ERROR', e instanceof Error ? e.message : String(e));
}
