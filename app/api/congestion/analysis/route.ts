import { getCongestionAnalysis } from "@/backend/services/congestion-analysis-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  return Response.json(await getCongestionAnalysis());
}
