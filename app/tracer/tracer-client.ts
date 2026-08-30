/**
 * app/tracer/tracer-client.ts — browser-side calls to this app's own
 * /api/extract, /api/formalize, /api/trace, and /api/documents routes.
 *
 * Claim, LogicalForm, and SourceVerdict come from lib/engine/schemas.ts and
 * are validated against those schemas here — never redeclared or widened
 * (CLAUDE.md eng rule 1). Every /api/* response follows the one envelope in
 * app/api/_lib/respond.ts: `{ data, mode?, fetchedAt? }` on success or
 * `{ data: null, lacuna: { dep, reason } }` at the ladder's bottom.
 */
import { z } from "zod";
import {
  ClaimSchema,
  DocumentSchema,
  LogicalFormSchema,
  SourceVerdictSchema,
  type Claim,
  type Document,
  type LogicalForm,
  type SourceVerdict,
} from "@/lib/engine/schemas";

export type DepMode = "live" | "cached" | "fixture";

export type Outcome<T> =
  | { ok: true; data: T; mode: DepMode; fetchedAt?: string }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function call<T>(
  url: string,
  body: unknown,
  parse: (data: unknown) => T | null,
): Promise<Outcome<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: `Could not reach ${url} (network error).` };
  }
  const json = await parseJson(res);

  if (res.status === 404) {
    return { ok: false, reason: `${url} is not wired into this build yet.` };
  }
  if (!res.ok) {
    const message =
      isRecord(json) && Array.isArray(json.issues) && json.issues[0] && isRecord(json.issues[0])
        ? readString(json.issues[0].message)
        : undefined;
    return { ok: false, reason: message ?? `${url} answered HTTP ${res.status}.` };
  }
  if (isRecord(json) && json.lacuna) {
    const reason = isRecord(json.lacuna) ? readString(json.lacuna.reason) : undefined;
    return { ok: false, reason: reason ?? "The dependency ladder bottomed out." };
  }

  const data = parse(isRecord(json) ? json.data : null);
  if (data === null) {
    return { ok: false, reason: `${url} answered a shape that failed validation.` };
  }
  const mode: DepMode =
    isRecord(json) && (json.mode === "live" || json.mode === "cached") ? json.mode : "fixture";
  const fetchedAt = isRecord(json) ? readString(json.fetchedAt) : undefined;
  return { ok: true, data, mode, fetchedAt };
}

const ClaimArray = z.array(ClaimSchema);

/** POST /api/extract {text} → Claim[] (SPEC §5, cap 8 enforced server-side). */
export async function extractClaims(text: string): Promise<Outcome<Claim[]>> {
  return call("/api/extract", { text }, (data) => {
    const parsed = ClaimArray.safeParse(data);
    return parsed.success ? parsed.data : null;
  });
}

/** POST /api/formalize {claim} → LogicalForm. */
export async function formalizeClaim(claim: Claim): Promise<Outcome<LogicalForm>> {
  return call("/api/formalize", { claim }, (data) => {
    const parsed = LogicalFormSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  });
}

/** POST /api/trace {claim} → SourceVerdict. */
export async function traceClaim(claim: Claim): Promise<Outcome<SourceVerdict>> {
  return call("/api/trace", { claim }, (data) => {
    const parsed = SourceVerdictSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  });
}

export type { Document };

/**
 * GET /api/documents → Document[] (SPEC §3: {id, text?, sourceUrl?, tool?,
 * createdAt} — validated against the real schemas.ts contract, never a
 * local duck-typed shape (CLAUDE.md eng rule 1; matches the Map/Prosopon
 * fix in #23, which is where the "Document has no title field" finding
 * that shaped this came from).
 */
export async function listCorpusDocuments(): Promise<Outcome<Document[]>> {
  let res: Response;
  try {
    res = await fetch("/api/documents");
  } catch {
    return { ok: false, reason: "Could not reach /api/documents (network error)." };
  }
  const json = await parseJson(res);

  if (res.status === 404) {
    return { ok: false, reason: "GET /api/documents is not wired into this build yet." };
  }
  if (!res.ok) {
    return { ok: false, reason: `/api/documents answered HTTP ${res.status}.` };
  }
  if (isRecord(json) && json.lacuna) {
    const reason = isRecord(json.lacuna) ? readString(json.lacuna.reason) : undefined;
    return { ok: false, reason: reason ?? "The corpus ladder bottomed out." };
  }

  const raw = isRecord(json) && Array.isArray(json.data) ? json.data : [];
  const docs: Document[] = [];
  for (const row of raw) {
    const parsed = DocumentSchema.safeParse(row);
    if (parsed.success) docs.push(parsed.data);
  }
  const mode: DepMode =
    isRecord(json) && (json.mode === "live" || json.mode === "cached") ? json.mode : "fixture";
  return { ok: true, data: docs, mode };
}
