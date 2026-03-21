import type { WorkerResult } from "../types";

export interface WorkerDefinition<TInput, TPayload> {
  name: string;
  run: (input: TInput) => Promise<WorkerResult<TPayload>>;
}

export function createStubWorkerResult<TPayload>(
  worker: string,
  message: string,
  payload: TPayload,
): WorkerResult<TPayload> {
  return {
    worker,
    status: "queued",
    message,
    payload,
  };
}
