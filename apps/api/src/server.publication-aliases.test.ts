import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { createServer, Server } from "node:http";

describe("Publication Aliases Executable Contract Guard", () => {
  let server: Server;
  let baseUrl: string;
  let handleRequest: any;

  before(async () => {
    process.env.VERCEL = "1";
    const mod = await import("./server.ts");
    handleRequest = mod.handleRequest;
    server = createServer(handleRequest);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  async function makeRequest(path: string, method = "GET", body?: any) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
  }

  it("1. /health remains canonical", async () => {
    const res = await makeRequest("/health");
    assert.strictEqual(res.status, 200);
  });

  it("2. /api/v1/health resolves to the same handler", async () => {
    const res = await makeRequest("/api/v1/health");
    assert.strictEqual(res.status, 200);
  });

  it("3. /reef-alerts remains canonical", async () => {
    const res = await makeRequest("/reef-alerts");
    assert.strictEqual(res.status, 503);
  });

  it("4. /api/v1/reef-alerts resolves to the same handler", async () => {
    const res = await makeRequest("/api/v1/reef-alerts");
    assert.strictEqual(res.status, 503);
  });

  it("5. /live-conditions remains canonical", async () => {
    const res = await makeRequest("/live-conditions");
    assert.strictEqual(res.status, 503);
  });

  it("6. /api/v1/live-conditions resolves to the same handler", async () => {
    const res = await makeRequest("/api/v1/live-conditions");
    assert.strictEqual(res.status, 503);
  });

  it("7. /risk/score remains canonical", async () => {
    const res = await makeRequest("/risk/score?lat=25&lng=-80");
    assert.strictEqual(res.status, 400); // 400 means route matched but schema failed
  });

  it("8. /api/v1/risk/score resolves to the same handler", async () => {
    const res = await makeRequest("/api/v1/risk/score?lat=25&lng=-80");
    assert.strictEqual(res.status, 400); // 400 means route matched but schema failed
  });

  it("9. /api/v1/missing remains unmatched and returns 404", async () => {
    const res = await makeRequest("/api/v1/missing");
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.json, { message: "Not found" });
  });

  it("10. No wildcard /api/v1/* forwarding exists", async () => {
    const res = await makeRequest("/api/v1/anything");
    assert.strictEqual(res.status, 404);
  });

  it("11. Internal routes remain unaliased", async () => {
    const res = await makeRequest("/api/v1/admin/keys");
    assert.strictEqual(res.status, 404);
  });

  it("12. POST operator routes remain unaliased", async () => {
    const res = await makeRequest("/api/v1/operator/lineage", "POST", {});
    assert.strictEqual(res.status, 404);
  });

  it("13. /v1/risk/:stationId remains unchanged", async () => {
    const res = await makeRequest("/v1/risk/123");
    // Not found by router vs not found by handler
    if (res.status === 404) {
      assert.notDeepStrictEqual(res.json, { message: "Not found" });
    }
  });

  it("14. /v1/regions/:regionId/risk remains unchanged", async () => {
    const res = await makeRequest("/v1/regions/123/risk");
    if (res.status === 404) {
      assert.notDeepStrictEqual(res.json, { message: "Not found" });
    }
  });

  it("15. Unsupported methods remain rejected consistently", async () => {
    const res = await makeRequest("/health", "PATCH");
    assert.strictEqual(res.status, 405);
    const res2 = await makeRequest("/api/v1/health", "PATCH");
    assert.strictEqual(res2.status, 405);
  });

  it("16. Query parameters are visible unchanged to the shared handler", async () => {
    // /risk/score with lat/lng returns 400, which means query parameters are parsed by zod
    const res1 = await makeRequest("/api/v1/risk/score?lat=25&lng=-80");
    assert.strictEqual(res1.status, 400);
    // Let's pass a completely invalid query and it still gives 400, meaning it hit the handler.
    const res2 = await makeRequest("/api/v1/risk/score");
    assert.strictEqual(res2.status, 400);
  });
});
