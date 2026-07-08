import { getRouteScenarios, type RouteScenarioRequest } from "@/backend/services/route-scenarios-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const data = body && typeof body === "object" ? (body as Partial<RouteScenarioRequest>) : {};
  return Response.json(
    await getRouteScenarios({
      mode: data.mode,
      congestionMode: data.congestionMode,
      scenarioShips: data.scenarioShips ?? [],
    })
  );
}
