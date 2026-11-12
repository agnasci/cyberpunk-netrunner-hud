import type { ActionResult, ProcessOutcome, SheetEffect } from "./requests";
import type { PublicSession } from "./session-state";

export interface CommitDeps {
  applyEffect(effect: SheetEffect): Promise<void>;
  write(session: PublicSession | null): Promise<void>;
}

export interface CommitResult {
  result: ActionResult;
  remember: boolean;
  written: PublicSession | null | undefined;
}

export async function commitOutcome(
  outcome: ProcessOutcome,
  deps: CommitDeps,
): Promise<CommitResult> {
  const fail = (error: "effect-failed" | "write-failed"): CommitResult => ({
    result: {
      requestId: outcome.result.requestId,
      ok: false,
      error,
      revision: outcome.result.revision,
    },
    remember: false,
    written: undefined,
  });
  try {
    for (const effect of outcome.effects) await deps.applyEffect(effect);
  } catch {
    return fail("effect-failed");
  }
  const next = outcome.ended ? null : outcome.session;
  if (next === null && !outcome.ended) {
    return { result: outcome.result, remember: true, written: undefined };
  }
  try {
    await deps.write(next);
  } catch {
    return fail("write-failed");
  }
  return { result: outcome.result, remember: true, written: next };
}
