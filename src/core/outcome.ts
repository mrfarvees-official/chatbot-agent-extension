export type ToolOutcome = {
  ok: boolean;
  tool?: string;
  reason?: string;
  [key: string]: unknown;
};

export function normalizeToolOutcome(tool: string, value: unknown): ToolOutcome {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as { ok?: unknown }).ok === "boolean") {
    return value as ToolOutcome;
  }
  return { ok: true, tool, result: value ?? null };
}
