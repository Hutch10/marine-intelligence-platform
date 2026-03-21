import type {
  IngestDatasetJobInput,
  IngestDatasetJobPayload,
} from "../types";
import { createStubWorkerResult, type WorkerDefinition } from "./shared";

export const ingestDatasetWorker: WorkerDefinition<
  IngestDatasetJobInput,
  IngestDatasetJobPayload
> = {
  name: "ingest-dataset",
  async run(input) {
    return createStubWorkerResult(
      "ingest-dataset",
      "Dataset ingest job accepted for future worker execution.",
      {
        datasetId: input.datasetId,
        source: input.source,
        receivedAt: new Date().toISOString(),
      },
    );
  },
};
