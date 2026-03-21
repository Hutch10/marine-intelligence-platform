export { ingestDatasetWorker } from "./ingest-dataset";
export { computeAnomaliesWorker } from "./compute-anomalies";
export { generateReportWorker } from "./generate-report";
export { ingestLiveFeeds, runIngestLiveFeedsCli } from "./ingest-live-feeds";

import { computeAnomaliesWorker } from "./compute-anomalies";
import { generateReportWorker } from "./generate-report";
import { ingestDatasetWorker } from "./ingest-dataset";

export const workerStubs = [
  ingestDatasetWorker,
  computeAnomaliesWorker,
  generateReportWorker,
] as const;
