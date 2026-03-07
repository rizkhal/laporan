/**
 * Commit parser
 * @param msg
 * @returns
 */
export function commitParser(msg: string): {
  type: string;
  scope: string | null;
  subject: string;
} {
  const m = msg.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.*)/);
  if (m) return { type: m[1], scope: m[2] ?? null, subject: m[3] };
  return { type: "other", scope: null, subject: msg };
}
