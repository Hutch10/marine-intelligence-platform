import { beforeEach, expect, test, vi } from "vitest";

const { mockAuth, mockLogUsage, mockFeedbackRoute } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogUsage: vi.fn(),
  mockFeedbackRoute: vi.fn(),
}));

vi.mock("../../_auth", () => ({
  requireApiKeyAuth: mockAuth,
  logApiUsageSafely: mockLogUsage,
}));

vi.mock("../../../../../../api/src/routes/validation", () => ({
  postValidationFeedbackRoute: {
    handler: mockFeedbackRoute,
  },
}));

import { POST } from "./route";

const AUTH = {
  actorId: "api-key:APIKEY-1",
  role: "admin",
  permissions: ["station.view_admin"],
  csrfToken: "api-key:mrk_test",
};

const EVALUATION = {
  id: "MVAL-1",
  stationId: "46042",
  route: "/api/v1/risk/score",
  apiKeyId: "APIKEY-1",
  predictedAt: "2026-03-24T11:30:00.000Z",
  predictedRiskLevel: "high",
  recommendationAction: "Storm risk advisory",
  recommendationUrgency: "high",
  confidenceScore: 0.82,
  calibrationAdjustedConfidenceScore: 0.76,
  operatorSummary: "Storm-like pattern",
  warningMessages: [],
  contributingSignals: [],
  triggeredRules: [],
  feedbackUseful: false,
  feedbackNote: "Recommendation was directionally right but late.",
  feedbackCount: 1,
  actualOutcome: null,
  createdAt: "2026-03-24T11:30:00.000Z",
  updatedAt: "2026-03-24T12:00:00.000Z",
};

beforeEach(() => {
  mockAuth.mockReset();
  mockLogUsage.mockReset();
  mockFeedbackRoute.mockReset();

  mockAuth.mockResolvedValue({
    ok: true,
    key: { id: "APIKEY-1" },
    auth: AUTH,
    rateLimit: {
      tier: "free",
      limit: 60,
      remaining: 59,
      requestsUsed: 0,
      windowSeconds: 60,
      resetAt: "2026-03-24T12:01:00.000Z",
    },
  });

  mockFeedbackRoute.mockReturnValue({
    status: 200,
    json: { evaluation: EVALUATION },
  });
});

test("feedback route returns 401 when API key is missing", async () => {
  mockAuth.mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ message: "API key required" }), { status: 401 }),
  });

  const response = await POST(
    new Request("http://localhost/api/v1/validation/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evaluationId: "MVAL-1", useful: false }),
    }),
  );

  expect(response.status).toBe(401);
  expect(mockFeedbackRoute).not.toHaveBeenCalled();
});

test("feedback route attaches feedback and logs usage", async () => {
  const body = {
    evaluationId: "MVAL-1",
    useful: false,
    note: "Recommendation was directionally right but late.",
  };

  const response = await POST(
    new Request("http://localhost/api/v1/validation/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  expect(response.status).toBe(200);
  expect(mockFeedbackRoute).toHaveBeenCalledWith({
    auth: AUTH,
    body,
  });
  await expect(response.json()).resolves.toMatchObject({
    evaluation: { id: "MVAL-1", feedbackUseful: false, feedbackCount: 1 },
  });
  expect(mockLogUsage).toHaveBeenCalledOnce();
});

test("feedback route forwards not-found responses from handler", async () => {
  mockFeedbackRoute.mockReturnValue({
    status: 404,
    json: { message: "evaluationId was not found" },
  });

  const response = await POST(
    new Request("http://localhost/api/v1/validation/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evaluationId: "MISSING", useful: true }),
    }),
  );

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    code: "validation_feedback_invalid_request",
    message: "evaluationId was not found",
    retryable: false,
  });
  expect(mockLogUsage).toHaveBeenCalledOnce();
});
