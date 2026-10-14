import type { SiteAdapter } from "../core/types";

const MIC = '[role="button"][aria-label*="microphone" i]';
const LEAVE = '[role="button"][aria-label*="leave call" i]';

export const meetAdapter: SiteAdapter = {
  id: "meet",
  version: "1",
  hosts: ["meet.google.com"],
  matches: (url) => url.hostname === "meet.google.com",
  tools: [
    {
      name: "meet_toggle_mic",
      description:
        "Mute or unmute the microphone in the current Meet call. Reversible.",
      risk: "write",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "meet_leave_call",
      description:
        "Leave the current Meet call. Irreversible: the user must approve.",
      risk: "irreversible",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  snapshot: () => `Google Meet. In call: ${!!document.querySelector(LEAVE)}`,
  preview: (tool) =>
    tool === "meet_leave_call" ? "Leave the current call" : "",
  health: () => [
    { name: "mic_button", ok: !!document.querySelector(MIC) },
    { name: "leave_button", ok: !!document.querySelector(LEAVE) },
  ],
  async execute(tool) {
    const sel =
      tool === "meet_toggle_mic"
        ? MIC
        : tool === "meet_leave_call"
          ? LEAVE
          : null;
    if (!sel) throw new Error("Unknown tool " + tool);
    const btn = document.querySelector<HTMLElement>(sel);
    if (!btn) return { ok: false, reason: "control_not_found" };
    btn.click();
    return { ok: true };
  },
};
