import { describe, expect, it } from "vitest";
import { createGmailDraftUrl, validateGmailDraftArgs } from "../src/gmail-draft";
import {
  PUBLIC_SITE_TOOL_ALLOWLIST,
  PUBLIC_SITE_TOOL_NAMES,
} from "../src/site-tools";

describe("public extension tool contract", () => {
  it("exposes only the intended public tools", () => {
    expect(PUBLIC_SITE_TOOL_NAMES).toContain("gmail_compose_draft");
    expect(PUBLIC_SITE_TOOL_NAMES).toContain("gmail_send_current_draft");
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("gmail_read_email")).toBe(true);
    expect(PUBLIC_SITE_TOOL_ALLOWLIST.has("gmail_delete_email")).toBe(true);
    expect(PUBLIC_SITE_TOOL_NAMES).toHaveLength(16);
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
});
