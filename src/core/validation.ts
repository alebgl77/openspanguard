import type { EvaluationInput } from './types.js';

export const MAX_CONTENT_CHARACTERS = 32_768;

export function validEvaluationInput(input: unknown): input is EvaluationInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<EvaluationInput>;
  return typeof value.prompt === 'string' && value.prompt.length <= MAX_CONTENT_CHARACTERS &&
    typeof value.response === 'string' && value.response.length <= MAX_CONTENT_CHARACTERS &&
    (value.context === undefined || (typeof value.context === 'string' && value.context.length <= MAX_CONTENT_CHARACTERS));
}
