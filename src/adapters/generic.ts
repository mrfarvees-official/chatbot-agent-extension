import type { SiteAdapter } from "../core/types";

export const genericAdapter: SiteAdapter = {
  id: "generic",
  version: "1",
  hosts: ["*"],
  matches: () => true,
  tools: [
    {
      name: "generic_click_text",
      description:
        "Click the first button or link whose visible text contains the given text. Returns ok false if nothing matches. Does not type or submit forms.",
      risk: "write",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  ],
  snapshot() {
    return Array.from(
      document.querySelectorAll<HTMLElement>("a, button, input, textarea"),
    )
      .slice(0, 80)
      .map((el, i) => {
        const label = (el.innerText || el.getAttribute("aria-label") || "")
          .trim()
          .slice(0, 60);
        return `[${i}] ${el.tagName.toLowerCase()} "${label}"`;
      })
      .join("\n");
  },
  async execute(tool, args) {
    if (tool !== "generic_click_text") throw new Error("Unknown tool " + tool);
    const needle = String(args.text).toLowerCase();
    const el = Array.from(
      document.querySelectorAll<HTMLElement>("a, button"),
    ).find((e) => e.innerText?.toLowerCase().includes(needle));
    if (!el) return { ok: false, reason: "not_found" };
    el.click();
    return { ok: true };
  },
};
