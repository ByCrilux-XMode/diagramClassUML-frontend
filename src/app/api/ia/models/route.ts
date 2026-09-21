import { NextRequest } from "next/server";
import { IA_DEFAULT_PROVIDER } from "@/lib/ia/config";
import type { IAProvider } from "@/lib/ia/types";
import { getAdapter, isValidProvider } from "@/lib/ia/adapters";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("provider") ?? IA_DEFAULT_PROVIDER;
  const provider = isValidProvider(raw) ? (raw as IAProvider) : IA_DEFAULT_PROVIDER;

  try {
    const models = await getAdapter(provider).listModels();
    return Response.json({ provider, models });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ provider, error: message, models: [] }, { status: 502 });
  }
}