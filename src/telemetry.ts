import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import type { EvaluationResult } from './core/types.js';

/** Process-local FIFO TTL identity cache; retention is bounded by TTL AND capacity. */
export class IdentityWindow {
  private readonly entries = new Map<string, number>();
  constructor(private readonly size: number, private readonly ttlMs: number, private readonly now: () => number = Date.now) {}
  claim(key: string): boolean {
    const now = this.now();
    for (const [id, expiry] of this.entries) {
      if (expiry > now) break;
      this.entries.delete(id);
    }
    if (this.entries.has(key)) return false;
    while (this.entries.size >= this.size) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, now + this.ttlMs);
    return true;
  }
}

export class Telemetry {
  readonly registry = new Registry();
  readonly inflight = new Gauge({ name: 'openspanguard_inflight', help: 'Active OTLP export requests', registers: [this.registry] });
  readonly duplicates = new Counter({ name: 'openspanguard_deduplicated_total', help: 'Repeated generation span IDs in the bounded local window', registers: [this.registry] });
  readonly exportFailures = new Counter({ name: 'openspanguard_export_failures_total', help: 'Downstream export failures', registers: [this.registry] });
  private readonly evaluations = new Counter({ name: 'openspanguard_evaluations_total', help: 'Unique generation evaluation outcomes', labelNames: ['cohort', 'status'], registers: [this.registry] });
  private readonly spans = new Counter({ name: 'openspanguard_spans_total', help: 'Unique generation spans observed', labelNames: ['cohort'], registers: [this.registry] });
  private readonly tokens = new Counter({ name: 'openspanguard_token_usage_total', help: 'Unique generation token usage', labelNames: ['cohort', 'type'], registers: [this.registry] });
  private readonly duration = new Histogram({ name: 'openspanguard_evaluation_duration_seconds', help: 'Evaluation latency including queue wait for unique generation spans', buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 60], registers: [this.registry] });
  private readonly quality = new Histogram({ name: 'openspanguard_quality_score', help: 'Normalized relevance of unique evaluated generations', labelNames: ['cohort'], buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], registers: [this.registry] });
  private readonly confidence = new Histogram({ name: 'openspanguard_confidence', help: 'Evaluator confidence of unique generations', labelNames: ['cohort'], buckets: [0.1, 0.25, 0.5, 0.75, 0.9, 1], registers: [this.registry] });
  private readonly nonsense = new Histogram({ name: 'openspanguard_nonsense_probability', help: 'Evaluator nonsense probability of unique generations', labelNames: ['cohort'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1], registers: [this.registry] });
  constructor(cohorts: readonly string[]) {
    for (const cohort of cohorts) {
      this.spans.inc({ cohort }, 0);
      for (const status of ['ok', 'skipped', 'error', 'timeout']) this.evaluations.inc({ cohort, status }, 0);
      for (const type of ['input', 'output']) this.tokens.inc({ cohort, type }, 0);
    }
  }
  record(cohort: string, result: EvaluationResult, seconds: number, input?: number, output?: number): void {
    this.spans.inc({ cohort });
    this.evaluations.inc({ cohort, status: result.status });
    this.duration.observe(seconds);
    if (input !== undefined) this.tokens.inc({ cohort, type: 'input' }, input);
    if (output !== undefined) this.tokens.inc({ cohort, type: 'output' }, output);
    if (result.status === 'ok') {
      this.quality.observe({ cohort }, result.relevanceScore);
      this.confidence.observe({ cohort }, result.confidence);
      this.nonsense.observe({ cohort }, result.nonsenseProbability);
    }
  }
}
