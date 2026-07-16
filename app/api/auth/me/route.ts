import { getCurrentUser } from "@/lib/auth";
import { apiHandler, ok } from "@/lib/http";

export async function GET() {
  return apiHandler(async () => ok(await getCurrentUser()));
}

