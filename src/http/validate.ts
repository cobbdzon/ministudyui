import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import type { Context, ValidationTargets } from 'hono';
import { AppError } from '../boxes/errors.js';

// Keeps zValidator's input inference intact while producing the same
// {code, message, field} error shape the app has always returned.
export function v<S extends ZodType, K extends keyof ValidationTargets>(target: K, schema: S) {
  return zValidator(target, schema, (result, c: Context) => {
    if (target === 'json') {
      const ct = c.req.header('content-type') ?? '';
      if (!/^application\/json(?:\s*;|$)/i.test(ct)) {
        throw new AppError('VALIDATION', 'content-type must be application/json', 'content-type');
      }
    }
    if (!result.success) {
      const issue = result.error.issues[0];
      const raw = issue && issue.path.length ? issue.path.map(String).join('.') : undefined;
      // Format array indices as [n] to match the box validators' field paths.
      const field = raw?.replace(/\.(\d+)(?=\.|$)/g, '[$1]');
      throw new AppError('VALIDATION', issue?.message ?? 'validation failed', field);
    }
  });
}
