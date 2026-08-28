/**
 * app/api/_lib/respond.ts — the one response envelope for every /api route.
 *
 * Success   200 { data, mode?, fetchedAt? }
 *           `mode`/`fetchedAt` mirror SPEC §4's dep result so the UI can render
 *           ProvenanceChips: LIVE / COLLATED HH:MM (from fetchedAt) / FROM THE
 *           RECORD. `data` always zod-parses against a SPEC §3 output type.
 * Lacuna    200 { data: null, lacuna: { dep, reason } }
 *           LACUNA is a state, not a crash (CLAUDE.md eng rule 5) — the UI
 *           renders the LacunaState component, never a hanging spinner.
 * Invalid   400 { error: "invalid_request", issues: [{ path, message }] }
 *
 * No route ever answers 500 with a stack: guard() converts unexpected throws
 * into the lacuna state and logs server-side.
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { DepMode } from "@/lib/engine/schemas";

export function ok(
  data: unknown,
  provenance?: { mode: DepMode; fetchedAt?: string },
): NextResponse {
  return NextResponse.json({
    data,
    ...(provenance ? { mode: provenance.mode } : {}),
    ...(provenance?.fetchedAt ? { fetchedAt: provenance.fetchedAt } : {}),
  });
}

export function lacuna(depName: string, reason: string): NextResponse {
  return NextResponse.json({ data: null, lacuna: { dep: depName, reason } });
}

export function badRequest(issues: { path: string; message: string }[]): NextResponse {
  return NextResponse.json({ error: "invalid_request", issues }, { status: 400 });
}

export function zodIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export function invalidJson(): NextResponse {
  return badRequest([{ path: "", message: "request body must be valid JSON" }]);
}

export async function readJson(
  req: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: (await req.json()) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Top-level safety net: errors are states, never a 500 with a stack. */
export function guard(
  handler: (req: Request) => Promise<NextResponse>,
): (req: Request) => Promise<NextResponse> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      console.error("route error (answered as LACUNA state):", err);
      return lacuna("route", err instanceof Error ? err.message : "unexpected condition");
    }
  };
}
