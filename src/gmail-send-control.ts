// Match only the primary Send control, never schedule/send-options menus.
export function isGmailSendLabel(value: string): boolean {
  const label = value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return /^send(?:$|\s*\(|\s+(?:ctrl|command|⌘))/i.test(label);
}

export function findGmailSendButton(root: ParentNode = document): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(
    '[role="button"], button, input[type="submit"], input[type="button"]',
  )).filter((element) => {
    if (element.getAttribute("aria-disabled") === "true" || element.hasAttribute("disabled") ||
      element.closest('[hidden], [aria-hidden="true"]') || !element.getClientRects().length) return false;
    const labels = [element.getAttribute("data-tooltip"), element.getAttribute("aria-label"),
      element.getAttribute("title"), element.getAttribute("value"), element.textContent ?? ""];
    return labels.some((label) => label !== null && isGmailSendLabel(label));
  });
  // Never guess which draft to send when more than one compose window is open.
  return candidates.length === 1 ? candidates[0] : null;
}
