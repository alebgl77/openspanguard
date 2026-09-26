import type { Span } from '@opentelemetry/api';
export { StreamAccumulator } from './core/stream.js';

export interface GenerationAnnotation { prompt: string; response: string; context?: string; cohort?: string; inputTokens?: number; outputTokens?: number }

/** Explicit content capture. Call before span.end(); the gateway removes these content attributes before export. */
export function annotateGeneration(span: Span, value: GenerationAnnotation): void {
  if (typeof value.prompt !== 'string' || typeof value.response !== 'string' || value.prompt.length > 32768 || value.response.length > 32768 || (value.context !== undefined && (typeof value.context !== 'string' || value.context.length > 32768))) throw new TypeError('Generation text must contain at most 32768 characters per field');
  for (const tokens of [value.inputTokens, value.outputTokens]) if (tokens !== undefined && (!Number.isSafeInteger(tokens) || tokens < 0 || tokens > 1000000000)) throw new TypeError('Token usage must be a nonnegative integer at most 1000000000');
  if (value.cohort !== undefined && !/^[a-zA-Z0-9_-]{1,32}$/.test(value.cohort)) throw new TypeError('Invalid cohort');
  span.setAttributes({
    'gen_ai.operation.name': 'chat', 'openspanguard.input': value.prompt, 'openspanguard.output': value.response,
    ...(value.context !== undefined ? { 'openspanguard.context': value.context } : {}),
    ...(value.cohort !== undefined ? { 'openspanguard.cohort': value.cohort } : {}),
    ...(value.inputTokens !== undefined ? { 'gen_ai.usage.input_tokens': value.inputTokens } : {}),
    ...(value.outputTokens !== undefined ? { 'gen_ai.usage.output_tokens': value.outputTokens } : {}),
  });
}
