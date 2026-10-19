const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type GmailDraftArgs = {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  body?: unknown;
};

export function splitEmailList(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateGmailDraftArgs(args: GmailDraftArgs): string | null {
  const required = ["to", "subject", "body"] as const;
  for (const key of required) {
    if (typeof args[key] !== "string" || !String(args[key]).trim())
      return `missing_${key}`;
  }

  for (const key of ["to", "cc", "bcc"] as const) {
    const values = splitEmailList(args[key]);
    if (key === "to" || values.length) {
      if (!values.length || !values.every((email) => EMAIL.test(email)))
        return `invalid_${key}`;
    }
  }
  return null;
}

export function createGmailDraftUrl(args: GmailDraftArgs): string {
  const error = validateGmailDraftArgs(args);
  if (error) throw new Error(error);

  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: splitEmailList(args.to).join(","),
    su: String(args.subject),
    body: String(args.body),
  });
  for (const key of ["cc", "bcc"] as const) {
    const values = splitEmailList(args[key]);
    if (values.length) params.set(key, values.join(","));
  }
  return `https://mail.google.com/mail/?${params}`;
}
