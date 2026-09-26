import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { EvaluationInput, EvaluationResult, Scorer } from './types.js';
import { validEvaluationInput } from './validation.js';

export interface EvaluationEngineOptions {
  scorer: Scorer;
  timeoutMs?: number;
  concurrency?: number;
  maxQueue?: number;
  cacheSize?: number;
  cacheTtlMs?: number;
}

interface CacheEntry {
  digest: string;
  result: EvaluationResult;
  expires: number;
}

interface Job {
  key: string;
  digest: string;
  input?: EvaluationInput;
  controller: AbortController;
  promise: Promise<EvaluationResult>;
  resolve: (result: EvaluationResult) => void;
  timer?: ReturnType<typeof setTimeout>;
  deadline: number;
  settled: boolean;
  started: boolean;
}

function integerOption(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`invalid_${name}`);
  }
  return value;
}

/** Process-local deduplication. Cache entries never retain prompt, response, or context. */
export class EvaluationEngine {
  #scorer: Scorer;
  #timeoutMs: number;
  #concurrency: number;
  #maxQueue: number;
  #cacheSize: number;
  #cacheTtlMs: number;
  #cache = new Map<string, CacheEntry>();
  #pending = new Map<string, Job>();
  #running = new Set<Job>();
  #queue: Job[] = [];
  #closed = false;

  constructor(options: EvaluationEngineOptions) {
    this.#scorer = options.scorer;
    this.#timeoutMs = integerOption('timeout_ms', options.timeoutMs ?? 1_000, 1, 300_000);
    this.#concurrency = integerOption('concurrency', options.concurrency ?? 8, 1, 1_024);
    this.#maxQueue = integerOption('max_queue', options.maxQueue ?? 128, 0, 100_000);
    this.#cacheSize = integerOption('cache_size', options.cacheSize ?? 10_000, 0, 1_000_000);
    this.#cacheTtlMs = integerOption('cache_ttl_ms', options.cacheTtlMs ?? 600_000, 1, 86_400_000);
  }

  async evaluate(key: string, input: EvaluationInput): Promise<{ result: EvaluationResult; reused: boolean }> {
    if (this.#closed) return { result: { status: 'skipped', reason: 'engine_closed' }, reused: false };
    if (typeof key !== 'string' || key.length === 0 || key.length > 256 || !validEvaluationInput(input)) {
      return { result: { status: 'error', reason: 'invalid_input' }, reused: false };
    }
    // Copy at admission: caller mutation must not change the content evaluated for this identity.
    const snapshot: EvaluationInput = { prompt: input.prompt, response: input.response };
    if (input.context !== undefined) snapshot.context = input.context;
    const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const existing = this.#pending.get(key);
    if (existing) {
      return existing.digest === digest
        ? { result: await existing.promise, reused: true }
        : { result: { status: 'error', reason: 'identity_conflict' }, reused: true };
    }
    const cached = this.#cache.get(key);
    if (cached && cached.expires > performance.now()) {
      this.#cache.delete(key);
      this.#cache.set(key, cached);
      return {
        result: cached.digest === digest ? cached.result : { status: 'error', reason: 'identity_conflict' },
        reused: true,
      };
    }
    if (cached) this.#cache.delete(key);
    if (this.#running.size >= this.#concurrency && this.#queue.length >= this.#maxQueue) {
      return { result: { status: 'skipped', reason: 'queue_full' }, reused: false };
    }

    let resolve!: Job['resolve'];
    const promise = new Promise<EvaluationResult>((done) => { resolve = done; });
    const job: Job = {
      key, digest, input: snapshot, controller: new AbortController(), promise, resolve,
      deadline: performance.now() + this.#timeoutMs, settled: false, started: false,
    };
    this.#pending.set(key, job);
    job.timer = setTimeout(() => {
      this.#settle(job, { status: 'timeout', reason: 'evaluation_timeout' });
      job.controller.abort();
      this.#drain();
    }, this.#timeoutMs);
    if (this.#running.size < this.#concurrency) this.#start(job);
    else this.#queue.push(job);
    return { result: await promise, reused: false };
  }

  #start(job: Job): void {
    if (job.settled || this.#closed) return;
    if (performance.now() >= job.deadline) {
      this.#settle(job, { status: 'timeout', reason: 'evaluation_timeout' });
      job.controller.abort();
      return;
    }
    job.started = true;
    this.#running.add(job);
    const input = job.input!;
    delete job.input;
    // Synchronous exceptions and rejected promises both become a fixed, non-content error.
    Promise.resolve().then(() => {
      if (job.controller.signal.aborted || performance.now() >= job.deadline) {
        return { status: 'timeout', reason: 'evaluation_timeout' } as const;
      }
      return this.#scorer.evaluate(input, job.controller.signal);
    }).then((result) => {
      if (performance.now() >= job.deadline) {
        this.#settle(job, { status: 'timeout', reason: 'evaluation_timeout' });
        job.controller.abort();
      } else {
        this.#settle(job, result);
      }
    }, () => {
      if (performance.now() >= job.deadline) {
        this.#settle(job, { status: 'timeout', reason: 'evaluation_timeout' });
        job.controller.abort();
      } else {
        this.#settle(job, { status: 'error', reason: 'evaluation_failed' });
      }
    }).finally(() => {
      this.#running.delete(job);
      this.#drain();
    });
    // An evaluator ignoring abort retains its slot until it settles; new orphan calls cannot grow unbounded.
  }

  #settle(job: Job, result: EvaluationResult): void {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(job.timer);
    delete job.input;
    this.#pending.delete(job.key);
    if (!job.started) this.#queue = this.#queue.filter((queued) => queued !== job);
    const immutableResult = Object.freeze({ ...result }) as EvaluationResult;
    if (!this.#closed && this.#cacheSize > 0) {
      // Briefly cache failures too, reducing retries against an unavailable upstream.
      const ttl = result.status === 'ok' ? this.#cacheTtlMs : Math.min(this.#cacheTtlMs, 1_000);
      this.#cache.set(job.key, { digest: job.digest, result: immutableResult, expires: performance.now() + ttl });
      while (this.#cache.size > this.#cacheSize) this.#cache.delete(this.#cache.keys().next().value!);
    }
    job.resolve(immutableResult);
  }

  #drain(): void {
    while (!this.#closed && this.#running.size < this.#concurrency && this.#queue.length > 0) {
      this.#start(this.#queue.shift()!);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const job of [...this.#pending.values(), ...this.#running]) {
      this.#settle(job, { status: 'skipped', reason: 'engine_closed' });
      job.controller.abort();
    }
    this.#queue = [];
    this.#pending.clear();
    this.#running.clear();
    this.#cache.clear();
  }
}
