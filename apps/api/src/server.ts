console.log('[server] TOP OF FILE');
process.on('exit', (code) => {
  console.log(`[server] process exit event, code=`, code);
});

// --- Global error handlers for root cause tracing ---
process.on('uncaughtException', (err) => {
  console.error('[GLOBAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[GLOBAL] Unhandled Rejection:', reason);
});

console.log('[server] Starting Marine API server...');
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import {
  getAnomaliesRoute,
  getRiskScoreRoute,
  postRiskEvaluateRoute,
} from "./routes/risk";
import { getSignalsRoute } from "./routes/signals";
import { getLiveConditionsRoute } from "./routes/live-conditions";
import { getReefAlertsRoute } from "./routes/reef-alerts";
import { getV1RiskRoute } from "./routes/v1-risk";
import { getV1RegionRiskRoute } from "./routes/v1-region-risk";
import { getV1RegionRiskTrendRoute } from "./routes/v1-region-risk-trend";
import v1ExplorerHandler from "./routes/v1-explorer";
import v1ExplorerExportHandler from "./routes/v1-explorer-export";
import { getValidationSummaryRoute } from "./routes/validation";
import { getFeedHealthRoute } from "./routes/feed-health";
import { getOperationalAlertsRoute } from "./routes/operational-alerts";
import { hasDatabasePath, openReadOnlyDatabase } from "./db/client";
import { isDatabaseConfigured } from "./db/async-client";
import type { RouteResponse } from "./types";
import type { SignalSeverity, SignalStatus, SignalType } from "@marine/shared";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface ServerRoute {
  method: "GET" | "POST";
  path: string;
  handler: (input: {
    body: unknown;
    query?: Record<string, string | undefined>;
    params?: Record<string, string>;
  }) => { status: number; json?: unknown; text?: string; headers?: Record<string, string> } | Promise<{ status: number; json?: unknown; text?: string; headers?: Record<string, string> }>;
}

const SERVER_STARTED_AT = Date.now();
const DEFAULT_PORT = 4000;

const VALID_SIGNAL_TYPES = new Set<SignalType>([
  "thermal_anomaly",
  "oxygen_depletion",
  "migration_anomaly",
  "chlorophyll_bloom",
  "current_shear",
  "station_health",
]);

const VALID_SIGNAL_SEVERITIES = new Set<SignalSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);

const VALID_SIGNAL_STATUSES = new Set<SignalStatus>([
  "open",
  "monitoring",
  "promoted",
  "dismissed",
]);

function asSignalType(value: string | undefined): SignalType | undefined {
  if (value && VALID_SIGNAL_TYPES.has(value as SignalType)) {
    return value as SignalType;
  }

  return undefined;
}

function asSignalSeverity(value: string | undefined): SignalSeverity | undefined {
  if (value && VALID_SIGNAL_SEVERITIES.has(value as SignalSeverity)) {
    return value as SignalSeverity;
  }

  return undefined;
}

function asSignalStatus(value: string | undefined): SignalStatus | undefined {
  if (value && VALID_SIGNAL_STATUSES.has(value as SignalStatus)) {
    return value as SignalStatus;
  }

  return undefined;
}

const serverRoutes: ServerRoute[] = [
    // ── Data Explorer (real backend) ──────────────────────────────────────────
    {
      method: "POST",
      path: "/v1/explorer/query",
      handler: async ({ body }) => {
        // Adapt Next.js-style handler to custom server contract
        let status = 200;
        let json: any = undefined;
        let headers: Record<string, string> = {};
        let ended = false;
        // Fake req/res objects
        const req = { method: "POST", body };
        const res = {
          status(code: number) { status = code; return this; },
          json(obj: any) { json = obj; ended = true; return this; },
          setHeader(key: string, value: string) { headers[key] = value; },
          end() { ended = true; },
        };
        await (v1ExplorerHandler as any)(req, res);
        return { status, json, headers };
      },
    },
    {
      method: "POST",
      path: "/v1/explorer/export",
      handler: async ({ body }) => {
        let status = 200;
        let json: any = undefined;
        let headers: Record<string, string> = {};
        let ended = false;
        let text: string | undefined;
        // Fake req/res objects
        const req = { method: "POST", body };
        const res = {
          status(code: number) { status = code; return this; },
          json(obj: any) { json = obj; ended = true; return this; },
          setHeader(key: string, value: string) { headers[key] = value; },
          send(val: any) { text = val; ended = true; return this; },
          end() { ended = true; },
        };
        await (v1ExplorerExportHandler as any)(req, res);
        if (headers["Content-Type"] === "text/csv" && text !== undefined) {
          return { status, text, headers };
        }
        return { status, json: json ?? text, headers };
      },
    },
  // ── Legacy internal routes ────────────────────────────────────────────────
  {
    method: "GET",
    path: "/risk/score",
    handler: ({ query }) => getRiskScoreRoute.handler({
      body: undefined,
      query: {
        stationId: query?.stationId,
        window: query?.window,
      },
    }),
  },
  {
    method: "POST",
    path: "/risk/evaluate",
    handler: ({ body }) => postRiskEvaluateRoute.handler({
      body: body as Parameters<typeof postRiskEvaluateRoute.handler>[0]["body"],
    }),
  },
  {
    method: "GET",
    path: "/anomalies",
    handler: ({ query }) => getAnomaliesRoute.handler({
      body: undefined,
      query: {
        stationId: query?.stationId,
        since: query?.since,
        limit: query?.limit,
      },
    }),
  },

  // ── Live data feeds ───────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/live-conditions",
    handler: () => getLiveConditionsRoute.handler({ body: undefined }),
  },
  {
    method: "GET",
    path: "/reef-alerts",
    handler: () => getReefAlertsRoute.handler({ body: undefined }),
  },
  {
    method: "GET",
    path: "/signals",
    handler: ({ query }) => getSignalsRoute.handler({
      body: undefined,
      query: {
        signalType: asSignalType(query?.signalType),
        severity: asSignalSeverity(query?.severity),
        status: asSignalStatus(query?.status),
        region: query?.region,
        stationId: query?.stationId,
        limit: query?.limit,
      },
    }),
  },

  // ── Validation ────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/validation/summary",
    handler: ({ query }) => getValidationSummaryRoute.handler({
      body: undefined,
      query: {
        stationId: query?.stationId,
        since: query?.since,
      },
    }),
  },

  // ── Health ────────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/health",
    handler: async () => {
      let dbReachable = false;
      try {
        if (isDatabaseConfigured()) {
          const db = openReadOnlyDatabase();
          db.prepare("SELECT 1").all();
          db.close();
          dbReachable = true;
        }
      } catch {
        dbReachable = false;
      }

      const feedHealthResponse = await getFeedHealthRoute.handler({ body: undefined, query: {} });

      return {
        status: 200,
        json: {
          status: "ok",
          uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
          dbReachable,
          feedHealth: feedHealthResponse.status === 200 ? feedHealthResponse.json : null,
        },
        headers: {},
      };
    },
  },

  {
    method: "GET",
    path: "/feed-health",
    handler: ({ query }) => getFeedHealthRoute.handler({
      body: undefined,
      query: query as Record<string, string | undefined>,
    }),
  },
  {
    method: "GET",
    path: "/operational-alerts",
    handler: ({ query }) => getOperationalAlertsRoute.handler({
      body: undefined,
      query: query as Record<string, string | undefined>,
    }),
  },

  // ── Public v1 routes ──────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/v1/risk/:stationId",
    handler: ({ params }) => getV1RiskRoute.handler({
      body: {
        stationId: params?.stationId ?? "",
      },
    }),
  },
  {
    method: "GET",
    path: "/v1/regions/:regionId/risk",
    handler: ({ params }) => getV1RegionRiskRoute.handler({
      body: {
        regionId: params?.regionId ?? "",
      },
    }),
  },
  {
    method: "GET",
    path: "/v1/regions/:regionId/risk/trend",
    handler: ({ params }) => getV1RegionRiskTrendRoute.handler({
      body: {
        regionId: params?.regionId ?? "",
      },
    }),
  },
];

function getPort(): number {
  const raw = process.env.PORT?.trim();

  if (!raw) {
    return DEFAULT_PORT;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PORT;
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function parseJsonBody(source: string): unknown {
  const trimmed = source.trim();

  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed) as JsonValue;
}

function matchPath(routePath: string, requestPath: string): Record<string, string> | null {
  const routeParts = routePath.split("/").filter(Boolean);
  const requestParts = requestPath.split("/").filter(Boolean);

  if (routeParts.length !== requestParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < routeParts.length; index += 1) {
    const routePart = routeParts[index]!;
    const requestPart = requestParts[index]!;

    if (routePart.startsWith(":")) {
      params[routePart.slice(1)] = decodeURIComponent(requestPart);
      continue;
    }

    if (routePart !== requestPart) {
      return null;
    }
  }

  return params;
}

function findRoute(method: string, pathname: string): { route: ServerRoute; params: Record<string, string> } | null {
  for (const route of serverRoutes) {
    if (route.method !== method) {
      continue;
    }

    const params = matchPath(route.path, pathname);

    if (params) {
      return { route, params };
    }
  }

  return null;
}

function sendJson(
  response: ServerResponse<IncomingMessage>,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  const body = JSON.stringify(payload);

  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body).toString(),
    ...headers,
  });
  response.end(body);
}

export async function handleRequest(request: IncomingMessage, response: ServerResponse<IncomingMessage>): Promise<void> {
  const method = request.method === "POST" ? "POST" : request.method === "GET" ? "GET" : null;

  if (!method) {
    sendJson(response, 405, { message: "Method not allowed" });
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const match = findRoute(method, requestUrl.pathname);

  if (!match) {
    sendJson(response, 404, { message: "Not found" });
    return;
  }

  console.log('[server] received request:', request.method, request.url);
  try {
    const rawBody = method === "POST" ? await readRequestBody(request) : "";
    const parsedBody = method === "POST" ? parseJsonBody(rawBody) : undefined;
    const query = Object.fromEntries(requestUrl.searchParams.entries());

    const routeResponse = await match.route.handler({
      body: parsedBody,
      query,
      params: match.params,
    });

    sendJson(response, routeResponse.status, routeResponse.json, routeResponse.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    sendJson(response, 500, { message });
  }
}

const server = createServer(handleRequest);

if (!process.env.VERCEL) {
  const port = getPort();

  server.listen(port, () => {
    process.stdout.write(`Marine API server listening on http://localhost:${port}\n`);
    console.log('[server] listen callback reached, event loop alive');
    setInterval(() => {}, 1000); // Keep event loop alive for debugging
  });
}

console.log('[server] END OF FILE');
