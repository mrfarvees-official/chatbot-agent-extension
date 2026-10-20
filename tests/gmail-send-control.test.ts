import { describe, expect, it } from "vitest";
import { findGmailSendButton, isGmailSendLabel } from "../src/gmail-send-control";

// Exercise the DOM-facing selector with representative Gmail control attributes.
function control(attributes: Record<string, string>, text = "", visible = true): HTMLElement {
  return {
    getAttribute: (key: string) => attributes[key] ?? null,
    hasAttribute: (key: string) => key in attributes,
    closest: () => attributes.hidden !== undefined || attributes["aria-hidden"] === "true" ? {} : null,
    getClientRects: () => visible ? [{}] : [],
    textContent: text,
  } as unknown as HTMLElement;
}
const root = (...elements: HTMLElement[]) => ({ querySelectorAll: () => elements }) as unknown as ParentNode;

describe("Gmail Send control", () => {
  it("recognizes tooltip, accessible label, visible text, and native submit controls", () => {
    for (const button of [control({ "data-tooltip": "Send (Ctrl-Enter)" }),
      control({ "aria-label": "Send \u202a(Ctrl-Enter)\u202c" }), control({}, "Send"),
      control({ type: "submit", value: "Send" })]) {
      expect(findGmailSendButton(root(button))).toBe(button);
    }
  });
  it("rejects schedule and send-options controls", () => {
    for (const label of ["Schedule send", "Send options", "Send later", "Resend", "Send feedback"]) {
      expect(isGmailSendLabel(label)).toBe(false);
    }
  });
  it("ignores hidden and disabled controls", () => {
    const button = control({}, "Send");
    expect(findGmailSendButton(root(control({ disabled: "" }, "Send"),
      control({ "aria-disabled": "true" }, "Send"), control({}, "Send", false), button))).toBe(button);
  });
  it("fails rather than guessing between two drafts", () => {
    expect(findGmailSendButton(root(control({}, "Send"), control({}, "Send")))).toBeNull();
  });
});
