import { describe, expect, it } from "vitest";
import { createGmailDraftUrl, validateGmailDraftArgs } from "../src/gmail-draft";
import {
  PUBLIC_SITE_TOOL_ALLOWLIST,
  PUBLIC_SITE_TOOL_NAMES,
} from "../src/site-tools";
import { normalizeToolOutcome } from "../src/core/outcome";

describe("public extension tool contract", () => {
  it("exposes only the intended public tools", () => {
    expect(PUBLIC_SITE_TOOL_NAMES).toContain("gmail_compose_draft");
    expect(PUBLIC_SITE_TOOL_NAMES).toContain("gmail_send_current_draft");
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("gmail_read_email")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("gmail_delete_email")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("meet_read_chat")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("meet_send_chat")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("calendar_open_availability")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("calendar_create_event")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("calendar_search_events")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("calendar_update_event")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("calendar_rsvp")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("calendar_compose_invite_email")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("meet_start_meeting")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("gmail_find_meeting_links")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("meet_join_link")).toBe(true);
    expect(PUBLIC_SITE_TOOL_NAMES).toHaveLength(42);
  });

  it("validates the Gmail draft contract without opening Chrome", () => {
    expect(
      validateGmailDraftArgs({
        to: "owner@example.com",
        subject: "Leave request",
        body: "Please approve my leave.",
      }),
    ).toBeNull();
    expect(validateGmailDraftArgs({ to: "not-an-email", subject: "x", body: "y" })).toBe(
      "invalid_to",
    );
    expect(validateGmailDraftArgs({ to: "owner@example.com", subject: "", body: "y" })).toBe(
      "missing_subject",
    );
  });

  it("builds a prefilled Gmail compose URL", () => {
    const url = createGmailDraftUrl({
      to: "owner@example.com",
      cc: "cc@example.com",
      subject: "Leave request – 23 Oct",
      body: "Please approve my leave.\nThank you.",
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://mail.google.com");
    expect(parsed.pathname).toBe("/mail/");
    expect(parsed.searchParams.get("view")).toBe("cm");
    expect(parsed.searchParams.get("to")).toBe("owner@example.com");
    expect(parsed.searchParams.get("cc")).toBe("cc@example.com");
    expect(parsed.searchParams.get("su")).toBe("Leave request – 23 Oct");
    expect(parsed.searchParams.get("body")).toContain("Please approve my leave.");
  });

  it("normalizes every tool response to an explicit outcome", () => {
    expect(normalizeToolOutcome("browser_list_tabs", [{ id: 1 }])).toEqual({
      ok: true,
      tool: "browser_list_tabs",
      result: [{ id: 1 }],
    });
    expect(normalizeToolOutcome("calendar_list_events", { ok: true, events: [] })).toEqual({
      ok: true,
      events: [],
    });
    expect(normalizeToolOutcome("broken_tool", undefined)).toEqual({
      ok: true,
      tool: "broken_tool",
      result: null,
    });
  });
});
