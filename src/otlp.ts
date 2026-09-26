import type { EvaluationInput, EvaluationResult } from './core/types.js';

export type JsonObject = Record<string, unknown>;
export interface Attribute { key: string; value: JsonObject }
export interface OtlpSpan extends JsonObject { traceId: string; spanId: string; attributes?: Attribute[]; events?: JsonObject[] }
export class InvalidOtlpError extends Error {}
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Bound the entire JSON tree before interpreting any OTLP fields. */
export function validateBatch(value: unknown, limits: { maxSpans: number; maxDepth: number }): OtlpSpan[] {
  if (!object(value)) throw new InvalidOtlpError('invalid_batch');
  let visited = 0;
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (pending.length) {
    const item = pending.pop()!;
    if (++visited > 50000 || item.depth > limits.maxDepth) throw new InvalidOtlpError('structure_limit');
    if (typeof item.value === 'string' && item.value.length > 262144) throw new InvalidOtlpError('field_limit');
    if (Array.isArray(item.value)) {
      for (const child of item.value) pending.push({ value: child, depth: item.depth + 1 });
    } else if (object(item.value)) {
      for (const [key, child] of Object.entries(item.value)) {
        if (key.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new InvalidOtlpError('invalid_field');
        pending.push({ value: child, depth: item.depth + 1 });
      }
      if ('attributes' in item.value) validateAttributes(item.value.attributes);
    }
  }
  const spans: OtlpSpan[] = [];
  if (value.resourceSpans === undefined) return spans;
  if (!Array.isArray(value.resourceSpans)) throw new InvalidOtlpError('invalid_resource_spans');
  for (const resource of value.resourceSpans) {
    if (!object(resource) || (resource.resource !== undefined && !object(resource.resource))) throw new InvalidOtlpError('invalid_resource');
    if (resource.scopeSpans === undefined) continue;
    if (!Array.isArray(resource.scopeSpans)) throw new InvalidOtlpError('invalid_scope_spans');
    for (const scope of resource.scopeSpans) {
      if (!object(scope) || (scope.scope !== undefined && !object(scope.scope))) throw new InvalidOtlpError('invalid_scope');
      if (scope.spans === undefined) continue;
      if (!Array.isArray(scope.spans)) throw new InvalidOtlpError('invalid_spans');
      for (const span of scope.spans) {
        if (!object(span) || !validId(span.traceId, 32) || !validId(span.spanId, 16)) throw new InvalidOtlpError('invalid_identity');
        if (span.parentSpanId !== undefined && span.parentSpanId !== '' && !validId(span.parentSpanId, 16)) throw new InvalidOtlpError('invalid_parent_identity');
        if (span.events !== undefined && (!Array.isArray(span.events) || span.events.some(event => !object(event)))) throw new InvalidOtlpError('invalid_events');
        spans.push(span as OtlpSpan);
        if (spans.length > limits.maxSpans) throw new InvalidOtlpError('span_limit');
      }
    }
  }
  return spans;
}

function validateAttributes(attributes: unknown): asserts attributes is Attribute[] {
  if (!Array.isArray(attributes) || attributes.length > 256) throw new InvalidOtlpError('invalid_attributes');
  const keys = new Set<string>();
  for (const attribute of attributes) {
    if (!object(attribute) || typeof attribute.key !== 'string' || attribute.key.length > 256 || !object(attribute.value) || keys.has(attribute.key)) throw new InvalidOtlpError('invalid_attribute');
    keys.add(attribute.key);
  }
}

function validId(id: unknown, length: number): id is string {
  return typeof id === 'string' && id.length === length && /^[0-9a-f]+$/i.test(id) && !/^0+$/.test(id);
}

export function spanKey(span: OtlpSpan): string { return `${span.traceId.toLowerCase()}:${span.spanId.toLowerCase()}`; }
export function attributeValue(span: OtlpSpan, name: string): unknown {
  return anyValue(span.attributes?.find(attribute => attribute.key === name)?.value);
}

function anyValue(value: unknown): unknown {
  if (!object(value)) return undefined;
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.intValue === 'string' || typeof value.intValue === 'number') return value.intValue;
  if (typeof value.doubleValue === 'number') return value.doubleValue;
  if (typeof value.boolValue === 'boolean') return value.boolValue;
  if (object(value.arrayValue) && Array.isArray(value.arrayValue.values)) return value.arrayValue.values.map(anyValue);
  if (object(value.kvlistValue) && Array.isArray(value.kvlistValue.values)) {
    return Object.fromEntries(value.kvlistValue.values.filter(object).filter(entry => typeof entry.key === 'string').map(entry => [entry.key, anyValue(entry.value)]));
  }
  return undefined;
}

export function isGeneration(span: OtlpSpan): boolean {
  const operation = attributeValue(span, 'gen_ai.operation.name');
  if (typeof operation === 'string') return ['chat', 'generate_content', 'text_completion'].includes(operation);
  return span.attributes?.some(attribute => ['openspanguard.input', 'openspanguard.output', 'gen_ai.input.messages', 'gen_ai.output.messages'].includes(attribute.key)) ?? false;
}

/** Only textual message parts are sent to the evaluator; image/tool payloads are excluded. */
function messagesText(raw: unknown): string | undefined {
  let messages = raw;
  if (typeof messages === 'string') {
    try { messages = JSON.parse(messages); } catch { return undefined; }
  }
  if (!Array.isArray(messages)) return undefined;
  const parts: string[] = [];
  for (const message of messages) {
    if (!object(message)) continue;
    const content = message.parts ?? message.content;
    if (typeof content === 'string') parts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        if (!object(part) || (part.type !== undefined && part.type !== 'text')) continue;
        const text = part.content ?? part.text;
        if (typeof text === 'string') parts.push(text);
      }
    }
  }
  const result = parts.join('\n');
  return result.trim() ? result : undefined;
}

export function evaluationInput(span: OtlpSpan): EvaluationInput | undefined {
  const input = attributeValue(span, 'openspanguard.input');
  const output = attributeValue(span, 'openspanguard.output');
  const evidence = attributeValue(span, 'openspanguard.context');
  const prompt = typeof input === 'string' && input.trim() ? input : messagesText(attributeValue(span, 'gen_ai.input.messages'));
  const response = typeof output === 'string' && output.trim() ? output : messagesText(attributeValue(span, 'gen_ai.output.messages'));
  if (!prompt || !response) return undefined;
  return { prompt, response, ...(typeof evidence === 'string' && evidence.trim() ? { context: evidence } : {}) };
}

export function cohortFor(span: OtlpSpan, allowlist: readonly string[]): string {
  const value = attributeValue(span, 'openspanguard.cohort');
  return typeof value === 'string' && allowlist.includes(value) ? value : 'default';
}

export function tokenUsage(span: OtlpSpan, kind: 'input' | 'output'): number | undefined {
  const raw = attributeValue(span, `gen_ai.usage.${kind}_tokens`);
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^\d+$/.test(raw))) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= 1000000000 ? value : undefined;
}

const sensitive = /^(openspanguard\.(input|output|context)(\.|$)|gen_ai\.(input\.messages|output\.messages|system_instructions|prompt|completion|request\.messages|response\.messages|tool\.definitions|tool\.call\.(arguments|result))(\.|$))|(^|[._-])(authorization|password|secret|api[_-]?key|access[_-]?token)([._-]|$)/i;
const contentEvent = /^gen_ai\.(user|assistant|system|tool)\.message$|^gen_ai\.(content|input|output)(\.|$)/i;
function isSensitiveKey(key: string): boolean {
  if (key === 'gen_ai.prompt.name' || key === 'gen_ai.prompt.version') return false;
  return sensitive.test(key);
}
function redactKeyValues(values: unknown[]): unknown[] {
  return values.filter(attribute => object(attribute) && typeof attribute.key === 'string' && !isSensitiveKey(attribute.key));
}

/** Content policy applies recursively to resources, scopes, spans, links and events. */
export function redactBatch(value: unknown): void {
  if (Array.isArray(value)) { for (const child of value) redactBatch(child); return; }
  if (!object(value)) return;
  if (Array.isArray(value.attributes)) value.attributes = redactKeyValues(value.attributes);
  if (object(value.kvlistValue) && Array.isArray(value.kvlistValue.values)) value.kvlistValue.values = redactKeyValues(value.kvlistValue.values);
  if (Array.isArray(value.events)) value.events = value.events.filter(event => !object(event) || typeof event.name !== 'string' || !contentEvent.test(event.name));
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) delete value[key];
    else redactBatch(child);
  }
}

function stringAttribute(key: string, value: string): Attribute { return { key, value: { stringValue: value } }; }
function numberAttribute(key: string, value: number): Attribute { return { key, value: { doubleValue: value } }; }

export function enrichSpan(span: OtlpSpan, result: EvaluationResult): void {
  // Replace existing annotations so retries cannot accumulate evaluation events.
  span.attributes = (span.attributes ?? []).filter(attribute => !attribute.key.startsWith('openspanguard.evaluation.') && !['openspanguard.relevance.score', 'jev.confidence.score', 'openspanguard.nonsense.probability'].includes(attribute.key));
  span.events = (span.events ?? []).filter(event => event.name !== 'gen_ai.evaluation.result' || !Array.isArray(event.attributes) || !event.attributes.some(attribute => object(attribute) && attribute.key === 'openspanguard.evaluation.source' && anyValue(attribute.value) === 'openspanguard'));
  span.attributes.push(stringAttribute('openspanguard.evaluation.status', result.status));
  if (result.status !== 'ok') return;
  span.attributes.push(
    stringAttribute('openspanguard.evaluation.provider', result.provider), stringAttribute('openspanguard.evaluation.model', result.model),
    stringAttribute('openspanguard.evaluation.rubric_version', result.rubricVersion), numberAttribute('openspanguard.relevance.score', result.relevanceScore),
    numberAttribute('jev.confidence.score', result.confidence), numberAttribute('openspanguard.nonsense.probability', result.nonsenseProbability),
  );
  const responseId = attributeValue(span, 'gen_ai.response.id');
  for (const [name, value] of [['relevance', result.relevanceScore], ['confidence', result.confidence], ['nonsense', result.nonsenseProbability]] as const) {
    span.events.push({
      name: 'gen_ai.evaluation.result',
      ...(typeof span.endTimeUnixNano === 'string' ? { timeUnixNano: span.endTimeUnixNano } : {}),
      attributes: [stringAttribute('openspanguard.evaluation.source', 'openspanguard'), stringAttribute('gen_ai.evaluation.name', name), numberAttribute('gen_ai.evaluation.score.value', value), ...(typeof responseId === 'string' ? [stringAttribute('gen_ai.response.id', responseId)] : [])],
    });
  }
}
