export const PUBLIC_SITE_TOOL_NAMES = [
  "gmail_compose_draft",
  "gmail_send_current_draft",
  "calendar_create_event",
  "calendar_compose_invite_email",
  "meet_schedule_meeting",
  "meet_compose_invite_email",
] as const;

export const PUBLIC_SITE_TOOL_ALLOWLIST = new Set<string>(PUBLIC_SITE_TOOL_NAMES);
