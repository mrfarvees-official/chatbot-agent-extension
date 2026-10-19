# Site Agent

Site Agent is a Chrome MV3 extension that lets the portfolio chatbot perform a small, explicitly allowlisted set of browser actions.

## Build

```bash
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the generated `dist` directory. After source changes, run `npm run build` and use **Reload** on the extension card.

Run `npm test` for extension-only contract tests. They verify the public
allowlist, Gmail argument validation, and the exact prefilled Gmail compose
URL without calling a model or opening Chrome.

## Public site tools and approvals

During the public demo phase, trusted chatbot origins can request the site allowlist without a separate site-login or connection popup. Origin authentication can be enabled later. The console may still show stored connected origins from older builds, but those records are not required for public tool calls.

Irreversible actions open a separate approval popup showing the action preview. Denying or closing that popup does not run the action. Gmail compose and calendar/Meet draft tools open drafts only; sending or saving remains a user-controlled step.

The public bridge exposes only the site allowlist: Gmail compose/send, calendar draft/compose, and Meet schedule/invite compose. The extension console retains full tool access for the attached tab.

## Manual checks

1. Load the unpacked `dist` build and open the portfolio chatbot.
2. Confirm the page reports the extension as connected without a site-consent popup.
3. Confirm a Gmail compose request opens a draft and a send request shows the approval popup.
4. Confirm denying the action approval performs no send.
5. Confirm a site bridge request for a read, delete, archive, or generic tool is rejected.

The final browser smoke test must be done with Chrome, a signed-in Gmail tab,
the unpacked `dist` folder reloaded, and the chatbot open on a trusted origin.
Ask the chatbot to draft an email, confirm Gmail opens with the recipient,
subject, and body, then ask to send and approve the extension popup. Unit tests
cannot verify live Gmail selectors or NVIDIA tool-calling behavior.

Gmail and Google Meet DOM selectors must be checked against the live sites before relying on automation.
