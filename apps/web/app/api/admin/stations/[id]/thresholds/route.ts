import { NextResponse } from "next/server";
import {
  buildGetStationThresholdsRouteResponse,
  buildPutStationThresholdsRouteResponse,
} from "../../../../../../../api/src/routes/station-thresholds";
import { requireMarineIntelligenceAdminSession } from "../../../../marine-intelligence/_utils";

interface StationThresholdsPutRequestBody {
  seaSurfaceTempC?: number | null;
  waveHeightM?: number | null;
  windSpeedMps?: number | null;
  pressureHpa?: number | null;
  csrfToken?: string;
}

function jsonResponse(payload: unknown, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  const routeResponse = buildGetStationThresholdsRouteResponse(params.id, authResult.auth);
  return jsonResponse(routeResponse.json, routeResponse.status);
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: StationThresholdsPutRequestBody;

  try {
    payload = await request.json() as StationThresholdsPutRequestBody;
  } catch {
    return jsonResponse({ message: "Invalid JSON body" }, 400);
  }

  if ((payload.csrfToken ?? "").trim() !== authResult.auth.csrfToken) {
    return jsonResponse({ message: "Forbidden" }, 403);
  }

  const routeResponse = buildPutStationThresholdsRouteResponse(params.id, authResult.auth, {
    seaSurfaceTempC: payload.seaSurfaceTempC,
    waveHeightM: payload.waveHeightM,
    windSpeedMps: payload.windSpeedMps,
    pressureHpa: payload.pressureHpa,
  });
  return jsonResponse(routeResponse.json, routeResponse.status);
}
