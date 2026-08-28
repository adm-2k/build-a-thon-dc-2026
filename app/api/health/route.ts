/**
 * GET /api/health — the apparatus registration check (ORCHESTRATION §3 item 6).
 *
 * Reports the resolved DEP_<X>_MODE map (ruling §8 T5) and whether Supabase
 * is configured — never any key material. Lexicon (DESIGN-BRIEF §8): a
 * healthy apparatus is IN REGISTER.
 */
import { z } from "zod";
import { DepModeSchema } from "@/lib/engine/schemas";
import { env } from "@/lib/env";
import { resolvedDepModes } from "../_lib/adapter";
import { guard, ok } from "../_lib/respond";

export const maxDuration = 60;

const ModeMapSchema = z.record(z.string(), DepModeSchema);

export const GET = guard(async () => {
  const modes = ModeMapSchema.safeParse(resolvedDepModes());
  return ok({
    status: "IN REGISTER",
    modes: modes.success ? modes.data : {},
    supabaseConfigured: env.supabaseConfigured,
    at: new Date().toISOString(),
  });
});
