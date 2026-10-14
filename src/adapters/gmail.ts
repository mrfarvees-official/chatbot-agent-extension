import type { SiteAdapter } from "../core/types";

const SEND_BUTTON = 'div[role="button"][data-tooltip^="Send"]';
const TO = 'textarea[name="to"], input[name="to"]';
const SUBJECT = 'input[name="subjectbox"]';
const BODY = 'div[aria-label="Message Body"]';

const val = (sel: string) =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)?.value ??
  "";

export const gmailAdapter: SiteAdapter = {
  id: "gmail",
  version: "1",
  hosts: ["mail.google.com"],
  matches: (url) => url.hostname === "mail.google.com",
  tools: [
    {
      name: "gmail_compose_draft",
      description:
        "Open a prefilled Gmail compose window in a new tab and attach to it. Does NOT send. Use before gmail_send_current_draft.",
      risk: "write",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "gmail_send_current_draft",
      description:
        "Click Send on the open compose window. Irreversible: the user is shown the draft and must approve.",
      risk: "irreversible",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  snapshot() {
    return `Gmail. Open email subject: ${document.querySelector("h2.hP")?.textContent ?? "(none)"}`;
  },
  preview(tool) {
    if (tool !== "gmail_send_current_draft") return "";
    const body = document.querySelector<HTMLElement>(BODY)?.innerText ?? "";
    return `To: ${val(TO)}\nSubject: ${val(SUBJECT)}\n\n${body}`;
  },
  health() {
    return [
      { name: "compose_to", ok: !!document.querySelector(TO) },
      { name: "compose_subject", ok: !!document.querySelector(SUBJECT) },
      { name: "compose_body", ok: !!document.querySelector(BODY) },
      { name: "send_button", ok: !!document.querySelector(SEND_BUTTON) },
    ];
  },
  async execute(tool, args, ctx) {
    if (tool === "gmail_compose_draft") {
      const q = new URLSearchParams({
        view: "cm",
        fs: "1",
        to: args.to,
        su: args.subject,
        body: args.body,
      });
      await ctx.openUrl(`https://mail.google.com/mail/?${q}`);
      return { ok: true, note: "Draft opened, not sent" };
    }
    if (tool === "gmail_send_current_draft") {
      const btn = document.querySelector<HTMLElement>(SEND_BUTTON);
      if (!btn) return { ok: false, reason: "send_button_not_found" };
      btn.click();
      return { ok: true };
    }
    throw new Error("Unknown tool " + tool);
  },
};
