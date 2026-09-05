import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { domainResponse } from "@/lib/api/domainResponse";
import { developmentService } from "@/domain/services/development.service";

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => developmentService.overview(auth.data.userId));
}
