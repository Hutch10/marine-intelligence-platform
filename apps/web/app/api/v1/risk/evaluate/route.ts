export async function POST(request: Request) {
  void request;
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: "risk_evaluate_disabled",
        message: "Risk evaluate endpoint is disabled in this deployment.",
        retryable: false,
      },
    }),
    {
      status: 503,
      headers: { "content-type": "application/json" },
    },
  );
}
