import { db } from "../../db/index";
import * as schema from "../../db/schema";
import { ensureRunnerRunning } from "./runner";

/**
 * Create a new job and insert it into the queue.
 * Automatically starts the runner if it isn't already running.
 */
export function createJob(
  workspaceId: number,
  type: string,
  payload: Record<string, any>,
) {
  const result = db
    .insert(schema.jobs)
    .values({
      workspaceId,
      type,
      status: "queued",
      progress: 0,
      message: "",
      payload: JSON.stringify(payload),
    })
    .returning()
    .get();

  // Start the runner if it isn't already running
  ensureRunnerRunning();

  return result;
}
