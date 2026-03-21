import type {
  GenerateReportJobInput,
  GenerateReportJobPayload,
} from "../types";
import { createStubWorkerResult, type WorkerDefinition } from "./shared";

export const generateReportWorker: WorkerDefinition<
  GenerateReportJobInput,
  GenerateReportJobPayload
> = {
  name: "generate-report",
  async run(input) {
    return createStubWorkerResult(
      "generate-report",
      "Report generation job accepted for future worker execution.",
      {
        investigationId: input.investigationId,
        reportType: input.reportType,
        requestedAt: new Date().toISOString(),
      },
    );
  },
};
