export interface StreamEvent {
  textDelta?: string;
  textSnapshot?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  eventId?: string;
}

export interface StreamResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Accept decoded text. Limits count UTF-16 code units, preserving split surrogate-pair deltas verbatim. */
export class StreamAccumulator {
  #text = '';
  #inputTokens?: number;
  #outputTokens?: number;
  #ids = new Set<string>();
  #events = 0;
  #maxCharacters: number;
  #maxEvents: number;
  #finished?: StreamResult;

  constructor(options: { maxCharacters?: number; maxEvents?: number } = {}) {
    this.#maxCharacters = options.maxCharacters ?? 1_000_000;
    this.#maxEvents = options.maxEvents ?? 10_000;
    if (!Number.isSafeInteger(this.#maxCharacters) || this.#maxCharacters < 1 ||
        !Number.isSafeInteger(this.#maxEvents) || this.#maxEvents < 1) {
      throw new RangeError('invalid_stream_limits');
    }
  }

  push(event: StreamEvent): void {
    if (this.#finished) throw new Error('stream_finished');
    if (!event || typeof event !== 'object') throw new TypeError('invalid_stream_event');
    if (event.eventId !== undefined && (typeof event.eventId !== 'string' || event.eventId.length > 256)) {
      throw new TypeError('invalid_event_id');
    }
    if (event.eventId !== undefined && this.#ids.has(event.eventId)) return;
    if (this.#events >= this.#maxEvents) throw new RangeError('stream_event_limit');
    if ((event.textDelta !== undefined && typeof event.textDelta !== 'string') ||
        (event.textSnapshot !== undefined && typeof event.textSnapshot !== 'string')) {
      throw new TypeError('invalid_stream_text');
    }
    if (event.usage !== undefined && (!event.usage || typeof event.usage !== 'object')) {
      throw new TypeError('invalid_stream_usage');
    }
    const inputTokens = event.usage?.inputTokens;
    const outputTokens = event.usage?.outputTokens;
    for (const value of [inputTokens, outputTokens]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw new RangeError('invalid_stream_usage');
      }
    }
    const base = event.textSnapshot ?? this.#text;
    const delta = event.textDelta ?? '';
    if (base.length + delta.length > this.#maxCharacters) throw new RangeError('stream_character_limit');
    // Validate everything before committing; failed events neither consume IDs nor partially update usage/text.
    this.#text = base + delta;
    if (inputTokens !== undefined) this.#inputTokens = Math.max(this.#inputTokens ?? 0, inputTokens);
    if (outputTokens !== undefined) this.#outputTokens = Math.max(this.#outputTokens ?? 0, outputTokens);
    if (event.eventId !== undefined) this.#ids.add(event.eventId);
    this.#events += 1;
  }

  finish(): StreamResult {
    if (!this.#finished) {
      const result: StreamResult = { text: this.#text };
      if (this.#inputTokens !== undefined) result.inputTokens = this.#inputTokens;
      if (this.#outputTokens !== undefined) result.outputTokens = this.#outputTokens;
      this.#finished = Object.freeze(result);
      this.#ids.clear();
    }
    return this.#finished;
  }
}
