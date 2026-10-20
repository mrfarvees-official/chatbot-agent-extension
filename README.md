# Site Agent

Site Agent is a Chrome Manifest V3 extension that lets a trusted portfolio chatbot use Gmail, Google Calendar, and Google Meet through the browser. Its extension console also lets you run tools, select tabs, manage permissions, and review activity.

The extension operates on the signed-in Google web interfaces. Chatbot hosting and model calls belong to the consuming application; this repository contains no chatbot server, model client, or Google API/OAuth integration.

## Requirements

- Node.js 22.13+ on the 22.x line, or Node.js 24.x, with npm, for the installed development toolchain.
- Chrome with Manifest V3 support. Bundles target Chrome 110; live Google applications may require a newer browser.
- A signed-in Google account for Gmail, Calendar, and Meet operations.
- A chatbot on a trusted origin, or the built-in extension console.

## Installation

```bash
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's generated `dist` directory.
3. Pin **Site Agent** to the toolbar for access to the console.
4. Open or refresh the trusted chatbot page after loading the extension.

After source changes, rebuild and click **Reload** on the extension card. Refresh chatbot pages to reconnect their bridges. Refresh automated Google tabs if they still contain an older injected adapter.

For development, run `npm run watch`. Watch mode rebuilds JavaScript bundles, but Chrome still requires an extension reload. Changes to static assets listed in `build.mjs` require restarting the build/watch command because those files are copied only at startup.

## Usage

### From the chatbot

Open the chatbot on `https://chatbot.farvees.xyz` or a supported local development origin. The page can discover tools without a separate site connection popup. Google site access is requested separately when automation first needs it.

Example requests depend on the consuming chatbot's integration:

- Draft an email with recipients, subject, and body, then review it in Gmail.
- Search Gmail and read a selected result.
- Open a Calendar event draft with dates and guests.
- Open a Meet link, join with approval, or read currently visible chat and captions.

Gmail compose and invitation tools open drafts without sending. `calendar_create_event` and `meet_schedule_meeting` open event drafts for manual review and saving. Meet scheduling also requires adding Google Meet conferencing in Calendar.

Other tools can act immediately: Calendar updates and guest additions click **Save**, and RSVP tools click the selected response. These are classified as `write` and do not open the extension's action approval popup.

### From the extension console

Click the Site Agent toolbar icon to open the console in a tab.

1. Run `browser_list_tabs` to find a target tab ID.
2. Run `browser_attach_tab` with that ID, or `browser_open_tab` with an HTTPS URL.
3. Run `browser_snapshot` or `browser_health` to request access and inspect the attached page.
4. Fill in a tool's generated fields and click **Run**. Required fields have an asterisk.

Gmail, Calendar, and Meet tools reuse the attached tab when its hostname matches their service. Otherwise, they open and attach a new service tab; they do not search all open tabs for an existing session. The attached tab ID is stored in session storage so it survives service worker restarts.

The console provides a pause switch for tool execution, per-tool enable switches, optional site permission revocation, and the latest 50 audit entries. Storage retains the latest 200 audit entries. Disabled tools are blocked at execution and omitted from chatbot discovery.

The connected-origins list contains legacy records. They are not required for current bridge access; revoking a record does not remove an origin from the trusted-origin configuration.

## Tool catalog

The public bridge exposes **42 allowlisted tools**: 13 Gmail, 10 Calendar, and 19 Meet tools. Discovery does not require a live Google tab or wait for an attached page to respond. Each discovered tool provides `name`, `description`, `risk`, and `inputSchema`; use that schema as the argument contract.

| Risk | Execution behavior |
| --- | --- |
| `read` | Reads visible content; may navigate or open panels. No extension action approval. |
| `write` | Changes page state, opens drafts, or performs an action classified as reversible. No extension action approval. |
| `irreversible` | Requires an extension-owned action approval popup before execution. |

### Gmail

| Tool | Risk | Purpose |
| --- | --- | --- |
| `gmail_compose_draft` | write | Open and attach a prefilled compose tab with `to`, `subject`, `body`, and optional `cc`/`bcc`. |
| `gmail_send_current_draft` | irreversible | Click the unique visible Send control on the current draft after approval. |
| `gmail_search` | read | Search using a query or sender, recipient, subject, label, unread, attachment, and date filters; return up to 20 visible results. |
| `gmail_read_email` | read | Open a search result by index, or read the currently open thread. |
| `gmail_reply_draft` | write | Open a reply draft, optionally filling the body. |
| `gmail_forward_draft` | write | Open a forward draft, optionally filling recipients and body. |
| `gmail_archive_email` | write | Archive the current thread or indexed result. |
| `gmail_delete_email` | irreversible | Move the current thread or indexed result to Trash after approval. |
| `gmail_mark_email` | write | Mark the current thread or indexed result as read or unread. |
| `gmail_modify_labels` | write | Add or remove comma-separated labels. |
| `gmail_list_attachments` | read | List matching attachment links in the open thread. |
| `gmail_open_attachment` | write | Open an indexed attachment link in a new tab. |
| `gmail_find_meeting_links` | read | Search messages for a date and extract visible Meet or Calendar links. |

Compose recipients must be comma-separated email addresses. `to`, `subject`, and `body` must be nonempty. Bodies are plain text and may contain newline characters.

Mailbox operations need a normal Gmail mailbox tab rather than a standalone `view=cm` compose tab. Attach a mailbox tab through the console when needed. Result indexes refer to the current rendered list; search again after navigation or changes. Thread reads return at most the newest six nonempty messages, capped at 2,500 characters each.

The Send selector rejects hidden, disabled, schedule-send, and send-options controls. If multiple matching Send controls exist, it fails rather than choosing a draft. A successful Send click does not prove delivery; verify the message in Sent from a mailbox tab.

### Google Calendar

| Tool | Risk | Purpose |
| --- | --- | --- |
| `calendar_create_event` | write | Open an event draft with title, start/end, and optional details, location, guests, or Meet link. |
| `calendar_search_events` | read | Navigate to Calendar search and return a page snapshot. |
| `calendar_list_events` | read | List event titles and labels currently rendered in the Calendar view. |
| `calendar_read_event` | read | Read page text for the currently open event. |
| `calendar_update_event` | write | Edit supported fields in the open event and click Save. |
| `calendar_delete_event` | irreversible | Click Delete for the open event after approval. |
| `calendar_rsvp` | write | Respond `yes`, `no`, or `maybe` to the open event. |
| `calendar_add_guests` | write | Add comma-separated guests to the open event and click Save. |
| `calendar_compose_invite_email` | write | Open a Gmail invitation draft containing a Calendar or Meet link. |
| `calendar_open_availability` | read | Navigate to a day view and return a snapshot for review. |

Use ISO date/time strings with an explicit timezone offset or `Z` for event start and end. Availability dates use `YYYY-MM-DD`. Availability tools show rendered Calendar information; they do not calculate guaranteed free/busy slots.

### Google Meet

| Tool | Risk | Purpose |
| --- | --- | --- |
| `meet_join_meeting` | irreversible | Click Join now or Ask to join on the current page after approval. |
| `meet_join_link` | irreversible | Navigate to an HTTPS `meet.google.com` link and attempt to join after approval. |
| `meet_start_meeting` | write | Open and attach a new Meet meeting page. |
| `meet_toggle_mic` | write | Toggle the microphone. |
| `meet_toggle_camera` | write | Toggle the camera. |
| `meet_share_screen` | write | Open sharing controls for a screen, window, or tab; browser selection may remain manual. |
| `meet_leave_call` | irreversible | Leave the current call after approval. |
| `meet_list_participants` | read | Open the participant panel and collect visible names. |
| `meet_manage_participant` | irreversible | Mute or remove a named participant; both actions require approval. |
| `meet_read_chat` | read | Open chat and collect visible page text. |
| `meet_send_chat` | irreversible | Send a chat message after approval. |
| `meet_toggle_captions` | write | Toggle captions. |
| `meet_read_captions` | read | Collect currently rendered text for caption context. |
| `meet_toggle_recording` | irreversible | Start or stop recording through Meet controls after approval. |
| `meet_raise_hand` | write | Raise or lower the hand. |
| `meet_send_reaction` | write | Open reactions and select an emoji. |
| `meet_get_summary` | read | Collect visible page context for the consuming assistant to summarize. |
| `meet_schedule_meeting` | write | Open a Calendar draft with dates, guests, details, and optional recurrence. |
| `meet_compose_invite_email` | write | Open a Gmail invitation draft containing a Meet link. |

Meet controls depend on the current call state, account capabilities, and host permissions. Chat and caption reads collect visible page text and can include surrounding interface text. The extension does not retain a historical transcript or generate a summary itself.

### Console-only browser and generic tools

These tools are excluded from the public site allowlist:

| Tool | Risk | Purpose |
| --- | --- | --- |
| `browser_list_tabs` | read | List tab IDs, titles, and origins. |
| `browser_open_tab` | write | Open an HTTPS URL and attach the new tab. |
| `browser_attach_tab` | write | Select an existing tab by numeric ID. |
| `browser_snapshot` | read | Return the attached adapter's compact page view. |
| `browser_health` | read | Report the attached adapter's selector checks. |
| `generic_click_text` | irreversible | On a fallback page, click the first matching button or link after approval. |

The generic tool appears when an accessible attached page uses the fallback adapter.

## Chatbot bridge integration

The bridge accepts same-window, same-origin `window.postMessage` messages from trusted chatbot pages. Requests use `source: "portfolio-chat"`; responses use `source: "portfolio-ext"` and echo the request `id`.

| Request `type` | Additional fields | Reply |
| --- | --- | --- |
| `PING` | None | `{ ok: true, version, apiVersion: 2 }` |
| `LIST_TOOLS` | None | Array of enabled public tool specifications. |
| `CALL_TOOL` | `name`, `args` | Tool outcome with an explicit `ok` boolean. |

Example helper for a trusted chatbot page:

```js
function siteAgentRequest(type, payload = {}, timeoutMs = 120_000) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    const onMessage = (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const message = event.data;
      if (message?.source !== "portfolio-ext" || message.id !== id) return;
      cleanup();
      resolve(message.reply);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Site Agent request timed out"));
    }, timeoutMs);
    window.addEventListener("message", onMessage);
    window.postMessage(
      { ...payload, source: "portfolio-chat", id, type },
      location.origin,
    );
  });
}

const status = await siteAgentRequest("PING", {}, 5_000);
const tools = await siteAgentRequest("LIST_TOOLS", {}, 5_000);
const draft = await siteAgentRequest("CALL_TOOL", {
  name: "gmail_compose_draft",
  args: {
    to: "owner@example.com",
    subject: "Meeting follow-up",
    body: "Hello,\n\nHere are the meeting notes.",
  },
});
```

Calls can take longer than discovery because of tab loading, permission prompts, and action approvals. A client timeout does not cancel execution. Check the browser and audit log before retrying a state-changing call.

Tool outcomes preserve adapter objects that already contain `ok`. Other values are wrapped as `{ ok: true, tool, result }`. Failures generally return `{ ok: false, reason }`, sometimes with `errors`, `hint`, or `error`. Discovery returns an array rather than an outcome wrapper. Unknown bridge request types return `unknown_message`.

## Permissions, approvals, and configuration

The manifest declares `storage`, `scripting`, and `tabs`, required host access for chatbot origins, and optional `<all_urls>` access. Automation requests individual origins on demand through an extension popup. Revoke optional grants in the console.

Trusted chatbot origins are currently:

- `https://chatbot.farvees.xyz`
- HTTP or HTTPS on `localhost` and `127.0.0.1`, on any port.

To change the chatbot deployment, update both `TRUSTED_ORIGINS`/`isTrustedOrigin` in [src/background.ts](src/background.ts) and `host_permissions`/`content_scripts.matches` in [manifest.json](manifest.json), then rebuild and reload. There is no `.env` configuration or model API key to set in this repository.

The public demo uses origin trust without a separate login or connection consent gate. Any script running on a trusted page can access the public bridge, including read tools and write tools without action approval. Keep untrusted HTML and scripts out of that page. The service worker checks extension sender metadata and enforces the public allowlist; browser and generic tools are restricted to extension pages.

For tools classified as `irreversible`, the service worker opens an action approval popup before execution. Denying, closing, or allowing the 60-second timer to expire prevents the requested action. Popup creation failure also denies the request. Previews are adapter-specific and capped at 1,500 characters; some actions provide only a short or empty preview. Gmail Send previews place recipients before the subject and body.

Audit entries store timestamps, tool names, source (`site` or `console`), outcomes, and argument key names, not argument values. Read tool responses can contain email, event, or meeting content and are returned to the requesting chatbot. Gmail read results explicitly mark message content as untrusted data; consuming assistants must treat page content as data rather than instructions.

## Development and validation

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies from the committed lockfile. |
| `npm run build` | Copy extension assets and bundle five entry points into `dist`. |
| `npm run watch` | Watch and rebuild JavaScript bundles. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run lint` | Run ESLint; the current configuration excludes TypeScript files. |
| `npm run lint:fix` | Apply supported ESLint fixes. |
| `npm test` | Run the Vitest suite once. |

Tests cover the 42-tool public contract, Gmail draft validation and URL generation, outcome normalization, discovery without a responsive attached tab, disabled-tool filtering, and Send-control matching. They use mocks and do not open Chrome, call a model, or verify live Google selectors.

### Manual browser checks

1. Build, load or reload `dist`, and refresh the trusted chatbot page.
2. Confirm `PING` reports API version 2 and discovery returns the enabled public catalog without a site connection popup.
3. Draft an email and confirm recipients, subject, and body in Gmail. Grant Gmail access when prompted.
4. Request Send, deny or close the approval popup, and confirm the draft remains unsent. Repeat with approval only for an intended test email, then verify Sent.
5. Attach a normal mailbox tab and check search/read behavior against visible messages.
6. Open a Calendar event draft and confirm it remains unsaved until reviewed. Check event reads and intended updates against the live UI.
7. Check Meet controls in a suitable test meeting, including approval for join, leave, and chat sending.
8. Confirm public calls to `browser_list_tabs` or `generic_click_text` return `tool_not_allowed_for_site`.
9. Disable a tool and confirm it disappears from discovery. Enable pause and confirm calls return `paused`.

### Troubleshooting

| Symptom or reason | What to check |
| --- | --- |
| No bridge reply / extension disconnected | Load `dist`, confirm the page origin is trusted, reload the extension, and refresh the page. |
| `forbidden` | Check trusted-origin configuration and the calling context; the sender was rejected. |
| `tool_not_allowed_for_site` | Use a public tool or run the browser/generic tool from the console. |
| `paused` / `tool_disabled` | Check the console pause switch and tool enable checkbox. |
| `permission_denied` | Allow access to the target Google origin when prompted; inspect optional permissions. |
| `no_attached_tab` / `no_such_tab` | Attach an existing tab or open a new one. The previous tab may have closed. |
| `unsupported_page` | Use a normal HTTP/HTTPS page; Chrome internal pages cannot be automated. |
| `open_mailbox_first` | Attach a normal Gmail inbox tab instead of a standalone compose tab. |
| `invalid_args` / `missing_*` / `invalid_to` | Match the discovered schema and Gmail recipient requirements. |
| `denied_by_user` | The approval was denied, closed, or expired. |
| `send_button_not_found` | Wait for compose to load, keep one draft open, and check the live Send control. |
| `tab_message_timeout` / selector failures | Check sign-in, readiness, locale, and selectors using `browser_health` and DevTools. |

Gmail, Calendar, and Meet selectors depend on the live DOM, often using English labels. UI changes, localization, account variants, and delayed rendering can break automation. Health checks are limited selector checks, not proof that every tool will work. Check successful click results against the resulting Google UI.

## Project structure

```text
manifest.json                 Permissions, origins, and extension entry points
build.mjs                     esbuild bundles and static asset copying
console.html / approve.html   Console and approval popup
src/
  background.ts               Sender checks, routing, tabs, approvals, audit
  bridge.ts                   Chatbot window-message bridge
  content.ts                  Injected adapter message handler
  console.ts / approve.ts     Extension UI behavior
  site-tools.ts               Public tool allowlist
  gmail-draft.ts              Compose validation and URL generation
  gmail-send-control.ts       Visible, unambiguous Send-control selection
  core/                       Adapter contracts, registry, validation, outcomes
  adapters/                   Gmail, Calendar, Meet, and generic implementations
tests/                        Vitest contracts and regression tests
dist/                         Generated unpacked extension (gitignored)
```

To add an adapter, implement `SiteAdapter` in `src/adapters`, register it in `src/adapters/index.ts`, and declare its schemas, risk levels, execution, and optional health/preview functions. For discovery before a target tab exists, add its catalog to `listAllTools` in `src/background.ts`. Public exposure also requires an entry in `src/site-tools.ts` and updated contract tests. Keep released tool names stable and bump adapter versions when tools or selectors change.

## Version and license metadata

### Appearance and approval windows

The approval pages and console follow Chatbot's current light or dark theme, defaulting to dark. The trusted bridge synchronizes changes to `data-theme`; open extension pages update automatically. Theme synchronization only changes appearance and does not grant tool permissions.

Connection, site-permission, and action approvals open centered over the last focused normal browser window. Long previews scroll inside the card; closing the window or pressing Escape declines the request. Chrome's own permission dialogs and native window frames use browser/OS styling.

After updating, run `npm run build`, reload the unpacked extension, and refresh Chatbot. Check both themes, open an approval, toggle Chatbot's theme while the approval is open, and test positioning on a second monitor. Actual browser placement and native permission prompts require manual verification.

`manifest.json` includes a description, author (`mrfarvees-official`), 16/32/48/128px PNG icons, and toolbar icons. The vector source is `icons/icon.svg`; generated PNGs are committed so builds need no image-generation dependency. The build copies icons and the shared `theme.css` into `dist`.

The installed extension version comes from `manifest.json`; `package.json` maintains separate package version metadata. The bridge protocol is API version 2. `package.json` declares ISC; this repository currently has no standalone license file.
