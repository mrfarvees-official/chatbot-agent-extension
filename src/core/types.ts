export type Risk = "read" | "write" | "irreversible";

export interface ToolSpec {
  name: string; // plugin_action, letters/digits/_/- only (LLM API rule). Never rename after release.
  description: string; // written for an LLM: when to use it, what it returns, what it does NOT do
  risk: Risk; // read = no state change, write = reversible, irreversible = always needs approval
  inputSchema: object; // JSON Schema (flat objects with string/number/boolean/enum)
}

export interface ToolContext {
  openUrl(url: string): Promise<void>; // provided by the background script
}

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface SiteAdapter {
  id: string;
  version: string; // bump when selectors or tools change
  hosts: string[];
  matches(url: URL): boolean;
  tools: ToolSpec[];
  snapshot(): string | Promise<string>; // compact page view, keep under a few thousand chars
  preview?(tool: string, args: any): string | Promise<string>; // shown in the approval popup
  health?(): HealthCheck[]; // which selectors resolve right now
  execute(tool: string, args: any, ctx: ToolContext): Promise<unknown>;
}
