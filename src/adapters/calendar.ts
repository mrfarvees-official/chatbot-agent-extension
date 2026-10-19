import type { SiteAdapter } from "../core/types";

const findControl = (...terms: string[]) => {
  const wanted = terms.map((x) => x.toLowerCase());
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[role="button"], button, input, textarea, [aria-label], [data-tooltip]',
  )).find((el) => {
    const value = [el.getAttribute("aria-label"), el.getAttribute("data-tooltip"), el.getAttribute("placeholder"), el.textContent]
      .filter(Boolean).join(" ").toLowerCase();
    return wanted.some((term) => value.includes(term));
  });
};

const click = (...terms: string[]) => {
  const el = findControl(...terms);
  if (!el) return false;
  el.click();
  return true;
};

const fill = (terms: string[], value: string) => {
  const el = findControl(...terms);
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = value;
  else el.innerText = value;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  return true;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pageText = () => (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
const calendarStamp = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date; use an ISO date/time");
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

function visibleEvents() {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-eventid], [data-eventchip], [role="gridcell"] [role="button"]',
  ));
  return elements.map((el, index) => ({
    index,
    eventId: el.getAttribute("data-eventid") || el.getAttribute("data-eventchip") || "",
    text: (el.innerText || el.getAttribute("aria-label") || "").trim(),
    ariaLabel: el.getAttribute("aria-label") || "",
  })).filter((event) => event.text);
}

export const calendarAdapter: SiteAdapter = {
  id: "calendar",
  version: "1",
  hosts: ["calendar.google.com"],
  matches: (url) => url.hostname === "calendar.google.com",
  tools: [
    {
      name: "calendar_create_event",
      description: "Open a prefilled Google Calendar event draft. It does not save the event automatically.",
      risk: "write",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" }, start: { type: "string", description: "ISO date/time" },
          end: { type: "string", description: "ISO date/time" }, details: { type: "string" },
          location: { type: "string" }, guests: { type: "string", description: "Comma-separated email addresses" },
          meetLink: { type: "string" },
        },
        required: ["title", "start", "end"],
      },
    },
    {
      name: "calendar_search_events",
      description: "Open Google Calendar search for a query and return visible matching event text.",
      risk: "read",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
    {
      name: "calendar_list_events",
      description: "Return event titles and labels currently visible in the attached Calendar view.",
      risk: "read",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "calendar_read_event",
      description: "Read the currently open Google Calendar event details from the page.",
      risk: "read",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "calendar_update_event",
      description: "Update fields in the currently open Calendar event and save after user approval in Calendar.",
      risk: "write",
      inputSchema: { type: "object", properties: { title: { type: "string" }, details: { type: "string" }, location: { type: "string" }, guests: { type: "string" } } },
    },
    {
      name: "calendar_delete_event",
      description: "Delete the currently open Calendar event. Requires approval.",
      risk: "irreversible",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "calendar_rsvp",
      description: "Respond Yes, No, or Maybe to the currently open event.",
      risk: "write",
      inputSchema: { type: "object", properties: { response: { type: "string", enum: ["yes", "no", "maybe"] } }, required: ["response"] },
    },
    {
      name: "calendar_add_guests",
      description: "Add comma-separated guests to the currently open event and save it.",
      risk: "write",
      inputSchema: { type: "object", properties: { guests: { type: "string" } }, required: ["guests"] },
    },
    {
      name: "calendar_compose_invite_email",
      description: "Open a prefilled Gmail invitation draft for a Calendar/Meet link. Does not send.",
      risk: "write",
      inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, message: { type: "string" }, link: { type: "string" } }, required: ["to", "link"] },
    },
    {
      name: "calendar_open_availability",
      description: "Open a Google Calendar day or availability view so the visitor can review free and busy times.",
      risk: "read",
      inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
    },
  ],
  snapshot: () => `Google Calendar. ${pageText().slice(0, 1600)}`,
  preview: (tool) => tool === "calendar_delete_event" ? "Delete the currently open calendar event" : "",
  health: () => [
    { name: "calendar_page", ok: location.hostname === "calendar.google.com" },
    { name: "main_content", ok: !!document.body },
  ],
  async execute(tool, args, ctx) {
    if (tool === "calendar_create_event") {
      const params = new URLSearchParams({
        action: "TEMPLATE",
        text: String(args.title),
        dates: `${calendarStamp(args.start)}/${calendarStamp(args.end)}`,
      });
      if (args.details || args.meetLink) params.set("details", [args.details, args.meetLink].filter(Boolean).join("\n\n"));
      if (args.location) params.set("location", String(args.location));
      if (args.guests) params.set("add", String(args.guests));
      await ctx.openUrl(`https://calendar.google.com/calendar/render?${params}`);
      return { ok: true, note: "Calendar event draft opened; review and save it" };
    }
    if (tool === "calendar_search_events") {
      await ctx.openUrl(`https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(String(args.query))}`);
      await sleep(500);
      return { ok: true, query: args.query, visible: visibleEvents() };
    }
    if (tool === "calendar_list_events") return { ok: true, events: visibleEvents(), page: location.href };
    if (tool === "calendar_read_event") return { ok: true, content: pageText().slice(0, 10000) };
    if (tool === "calendar_update_event") {
      if (!click("edit event", "edit")) return { ok: false, reason: "edit_button_not_found" };
      await sleep(300);
      if (args.title && !fill(["event title", "title"], String(args.title))) return { ok: false, reason: "title_field_not_found" };
      if (args.details && !fill(["description", "details"], String(args.details))) return { ok: false, reason: "details_field_not_found" };
      if (args.location && !fill(["location"], String(args.location))) return { ok: false, reason: "location_field_not_found" };
      if (args.guests && !fill(["add guests", "guests"], String(args.guests))) return { ok: false, reason: "guest_field_not_found" };
      return click("save") ? { ok: true, note: "Event saved" } : { ok: false, reason: "save_button_not_found" };
    }
    if (tool === "calendar_delete_event") return click("delete", "trash") ? { ok: true, note: "Delete clicked" } : { ok: false, reason: "delete_button_not_found" };
    if (tool === "calendar_rsvp") {
      const label = args.response === "yes" ? "yes" : args.response === "no" ? "no" : "maybe";
      return click(label) ? { ok: true, response: args.response } : { ok: false, reason: "rsvp_button_not_found" };
    }
    if (tool === "calendar_add_guests") {
      if (!click("edit event", "edit")) return { ok: false, reason: "edit_button_not_found" };
      await sleep(300);
      if (!fill(["add guests", "guests"], String(args.guests))) return { ok: false, reason: "guest_field_not_found" };
      return click("save") ? { ok: true, note: "Guests added and event saved" } : { ok: false, reason: "save_button_not_found" };
    }
    if (tool === "calendar_compose_invite_email") {
      const body = `${args.message ? `${args.message}\n\n` : ""}Meeting link: ${args.link}`;
      const params = new URLSearchParams({ view: "cm", fs: "1", to: String(args.to), su: String(args.subject || "Calendar invitation"), body });
      await ctx.openUrl(`https://mail.google.com/mail/?${params}`);
      return { ok: true, note: "Gmail invite draft opened, not sent" };
    }
    if (tool === "calendar_open_availability") {
      const date = String(args.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: "date_must_be_YYYY_MM_DD" };
      const [year, month, day] = date.split("-");
      await ctx.openUrl(`https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`);
      await sleep(700);
      return { ok: true, date, visible: visibleEvents(), note: "Review visible Calendar events before choosing an available time" };
    }
    throw new Error("Unknown tool " + tool);
  },
};
