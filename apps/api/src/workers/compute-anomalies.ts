import type {
  ComputeAnomaliesJobInput,
  ComputeAnomaliesJobPayload,
} from "../types";
import { createStubWorkerResult, type WorkerDefinition } from "./shared";

export const computeAnomaliesWorker: WorkerDefinition<
  ComputeAnomaliesJobInput,
  ComputeAnomaliesJobPayload
> = {
  name: "compute-anomalies",
  async run(input) {
    return createStubWorkerResult(
      "compute-anomalies",
      "Anomaly computation job accepted for future worker execution.",
      {
        regionId: input.regionId,
        datasetIds: input.datasetIds,
        window: input.window,
        analysisQueuedAt: new Date().toISOString(),
      },
    );
  },
};
