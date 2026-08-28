/**
 * /api/events — the hub ticker (SPEC §5, ruling §8 T1: polling, not Realtime).
 *
 * GET  → latest TickerEvent[], newest first ([] keyless — the hub renders
 *        its LACUNA/empty state, never a spinner).
 * POST → validated event insert; the server stamps `at`. Best-effort by
 *        design: a dropped ticker write answers 200 with persisted:false —
 *        it must never fail a pipeline.
 */
import { insertEventRow, latestEvents, stampEvent } from "../_lib/adapter";
import {
  badRequest,
  guard,
  invalidJson,
  ok,
  readJson,
  zodIssues,
} from "../_lib/respond";
import { coerceEvents, EventInputSchema } from "../_lib/wire";

export const maxDuration = 60;

export const GET = guard(async () => {
  const rows = await latestEvents(20);
  return ok(coerceEvents(rows));
});

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = EventInputSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));

  const event = stampEvent(parsed.data);
  if (event === null) {
    return badRequest([{ path: "", message: "event did not validate after stamping" }]);
  }
  const persisted = await insertEventRow(event);
  return ok({ event, persisted });
});
