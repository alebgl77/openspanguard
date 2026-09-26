export interface EvaluationInput {
  prompt: string;
  response: string;
  context?: string;
}

export type EvaluationResult =
  | {
      status: 'ok';
      relevanceScore: number;
      confidence: number;
      nonsenseProbability: number;
      provider: string;
      model: string;
      rubricVersion: string;
    }
  | { status: 'timeout' | 'error' | 'skipped'; reason: string };

export interface Scorer {
  evaluate(input: EvaluationInput, signal: AbortSignal): Promise<EvaluationResult>;
}
