import type { SiteAdapter } from "../core/types";

const button = (...terms: string[]) => {
  const wanted = terms.map((x) => x.toLowerCase());
  return Array.from(document.querySelectorAll<HTMLElement>('[role="button"], button, [aria-label], [data-tooltip]')).find((el) => {
    const text = [el.getAttribute("aria-label"), el.getAttribute("data-tooltip"), el.textContent].filter(Boolean).join(" ").toLowerCase();
    return wanted.some((term) => text.includes(term));
  });
};
const click = (...terms: string[]) => { const el = button(...terms); if (!el) return false; el.click(); return true; };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pageText = () => (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
const inCall = () => !!button("leave call", "hang up");
const input = (terms: string[]) => Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>('input, textarea, [contenteditable="true"]')).find((el) => {
  const label = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("data-placeholder")].filter(Boolean).join(" ").toLowerCase();
  return terms.some((term) => label.includes(term));
});
const fill = (el: HTMLElement | undefined, value: string) => {
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = value;
  else el.innerText = value;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  return true;
};
const calendarStamp = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date; use an ISO date/time");
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

export const meetAdapter: SiteAdapter = {
  id: "meet", version: "2", hosts: ["meet.google.com"], matches: (url) => url.hostname === "meet.google.com",
  tools: [
    { name: "meet_join_meeting", description: "Join or request access to the current Google Meet. Requires approval.", risk: "irreversible", inputSchema: { type: "object", properties: {} } },
    { name: "meet_toggle_mic", description: "Mute or unmute the microphone.", risk: "write", inputSchema: { type: "object", properties: {} } },
    { name: "meet_toggle_camera", description: "Turn the camera on or off.", risk: "write", inputSchema: { type: "object", properties: {} } },
    { name: "meet_share_screen", description: "Open Meet's screen-sharing picker. The browser picker may still require user selection.", risk: "write", inputSchema: { type: "object", properties: { source: { type: "string", enum: ["screen", "window", "tab"] } } } },
    { name: "meet_leave_call", description: "Leave the current Meet call. Requires approval.", risk: "irreversible", inputSchema: { type: "object", properties: {} } },
    { name: "meet_list_participants", description: "Open the participant panel and return visible participant names.", risk: "read", inputSchema: { type: "object", properties: {} } },
    { name: "meet_manage_participant", description: "Mute or remove a participant by visible name. Removal requires approval.", risk: "irreversible", inputSchema: { type: "object", properties: { name: { type: "string" }, action: { type: "string", enum: ["mute", "remove"] } }, required: ["name", "action"] } },
    { name: "meet_read_chat", description: "Open Meet chat and return visible chat messages.", risk: "read", inputSchema: { type: "object", properties: {} } },
    { name: "meet_send_chat", description: "Send a message to the current Meet chat.", risk: "irreversible", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
    { name: "meet_toggle_captions", description: "Turn live captions on or off.", risk: "write", inputSchema: { type: "object", properties: {} } },
    { name: "meet_read_captions", description: "Return captions currently visible in Meet; not a full historical transcript.", risk: "read", inputSchema: { type: "object", properties: {} } },
    { name: "meet_toggle_recording", description: "Start or stop Meet recording through More options. Requires approval.", risk: "irreversible", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["start", "stop"] } }, required: ["action"] } },
    { name: "meet_raise_hand", description: "Raise or lower the hand.", risk: "write", inputSchema: { type: "object", properties: { raised: { type: "boolean" } }, required: ["raised"] } },
    { name: "meet_send_reaction", description: "Open reactions and select an emoji.", risk: "write", inputSchema: { type: "object", properties: { emoji: { type: "string" } }, required: ["emoji"] } },
    { name: "meet_get_summary", description: "Collect visible participants, chat, captions, and page text for the assistant to summarize.", risk: "read", inputSchema: { type: "object", properties: {} } },
    { name: "meet_schedule_meeting", description: "Open a prefilled Google Calendar event draft with dates and details.", risk: "write", inputSchema: { type: "object", properties: { title: { type: "string" }, start: { type: "string", description: "ISO date/time" }, end: { type: "string", description: "ISO date/time" }, details: { type: "string" } }, required: ["title", "start", "end"] } },
    { name: "meet_compose_invite_email", description: "Open a prefilled Gmail invite draft containing a Meet link. Does NOT send.", risk: "write", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, message: { type: "string" }, meetLink: { type: "string" } }, required: ["to", "meetLink"] } },
  ],
  snapshot: () => `Google Meet. In call: ${inCall()}. Visible text: ${pageText().slice(0, 1200)}`,
  preview: (tool, args) => tool === "meet_leave_call" ? "Leave the current call" : tool === "meet_join_meeting" ? "Join/request access to the current meeting" : tool === "meet_toggle_recording" ? `${args?.action ?? "toggle"} Meet recording` : tool === "meet_manage_participant" && args?.action === "remove" ? `Remove participant: ${args.name}` : "",
  health: () => [
    { name: "microphone_control", ok: !!button("microphone", "mute") },
    { name: "camera_control", ok: !!button("camera") },
    { name: "leave_button", ok: inCall() },
  ],
  async execute(tool, args, ctx) {
    if (tool === "meet_join_meeting") return click("join now", "ask to join") ? { ok: true } : { ok: false, reason: "join_button_not_found" };
    if (tool === "meet_toggle_mic") return click("microphone", "mute") ? { ok: true } : { ok: false, reason: "microphone_button_not_found" };
    if (tool === "meet_toggle_camera") return click("camera") ? { ok: true } : { ok: false, reason: "camera_button_not_found" };
    if (tool === "meet_leave_call") return click("leave call", "hang up") ? { ok: true } : { ok: false, reason: "leave_button_not_found" };
    if (tool === "meet_share_screen") {
      if (!click("present now", "share screen")) return { ok: false, reason: "present_button_not_found" };
      await sleep(300);
      const source = args.source === "window" ? "a window" : args.source === "tab" ? "a tab" : "your entire screen";
      return click(source) ? { ok: true, source } : { ok: true, source, note: "Browser source picker may require manual selection" };
    }
    if (tool === "meet_list_participants") {
      click("people", "participants"); await sleep(300);
      const names = Array.from(document.querySelectorAll<HTMLElement>('[role="listitem"], [data-participant-id]')).map((el) => (el.innerText || el.getAttribute("aria-label") || "").trim()).filter(Boolean);
      return { ok: true, participants: [...new Set(names)] };
    }
    if (tool === "meet_manage_participant") {
      click("people", "participants"); await sleep(300);
      const target = Array.from(document.querySelectorAll<HTMLElement>('[role="listitem"], [data-participant-id]')).find((el) => (el.innerText || "").toLowerCase().includes(String(args.name).toLowerCase()));
      if (!target) return { ok: false, reason: "participant_not_found" };
      target.click(); await sleep(200);
      const ok = args.action === "remove" ? click("remove from the meeting", "remove") : click("mute");
      return ok ? { ok: true, action: args.action, name: args.name } : { ok: false, reason: "participant_action_not_found" };
    }
    if (tool === "meet_read_chat") { click("chat", "conversation"); await sleep(300); return { ok: true, chat: pageText().slice(-6000) }; }
    if (tool === "meet_send_chat") {
      click("chat", "conversation"); await sleep(300);
      if (!fill(input(["send a message", "chat"]), String(args.message))) return { ok: false, reason: "chat_input_not_found" };
      return click("send") ? { ok: true } : { ok: false, reason: "chat_send_button_not_found" };
    }
    if (tool === "meet_toggle_captions") return click("captions", "turn on captions", "turn off captions") ? { ok: true } : { ok: false, reason: "captions_button_not_found" };
    if (tool === "meet_read_captions") return { ok: true, captions: pageText().slice(-6000), note: "Only captions currently rendered in the page are available" };
    if (tool === "meet_toggle_recording") {
      if (!click("more options", "more")) return { ok: false, reason: "more_options_button_not_found" };
      await sleep(300);
      return click(args.action === "start" ? "start recording" : "stop recording") ? { ok: true, action: args.action } : { ok: false, reason: "recording_control_not_found" };
    }
    if (tool === "meet_raise_hand") return (args.raised ? click("raise hand") : click("lower hand", "raise hand")) ? { ok: true, raised: args.raised } : { ok: false, reason: "hand_control_not_found" };
    if (tool === "meet_send_reaction") {
      if (!click("reactions", "send a reaction")) return { ok: false, reason: "reaction_button_not_found" };
      await sleep(300);
      return click(String(args.emoji)) ? { ok: true, emoji: args.emoji } : { ok: false, reason: "reaction_not_found" };
    }
    if (tool === "meet_get_summary") return { ok: true, content: pageText().slice(0, 12000), note: "The assistant should summarize visible meeting context; no historical transcript is retained" };
    if (tool === "meet_schedule_meeting") {
      const dates = `${calendarStamp(args.start)}/${calendarStamp(args.end)}`;
      const params = new URLSearchParams({ text: String(args.title), dates });
      if (args.details) params.set("details", String(args.details));
      await ctx.openUrl(`https://calendar.google.com/calendar/r/eventedit?${params}`);
      return { ok: true, note: "Calendar event draft opened; add Google Meet conferencing and save it" };
    }
    if (tool === "meet_compose_invite_email") {
      const body = `${args.message ? `${args.message}\n\n` : ""}Google Meet link: ${args.meetLink}`;
      const params = new URLSearchParams({ view: "cm", fs: "1", to: String(args.to), su: String(args.subject || "Google Meet invitation"), body });
      await ctx.openUrl(`https://mail.google.com/mail/?${params}`);
      return { ok: true, note: "Gmail invite draft opened, not sent" };
    }
    throw new Error("Unknown tool " + tool);
  },
};
