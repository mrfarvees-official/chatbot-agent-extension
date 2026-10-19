# Site Agent

Site Agent is a Chrome MV3 extension that lets the portfolio chatbot perform a small, explicitly allowlisted set of browser actions.

## Build

```bash
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the generated `dist` directory. After source changes, run `npm run build` and use **Reload** on the extension card.

## Site connection and approvals

When the public chatbot first requests tools on a trusted site, the extension opens a **Allow this site to use Site Agent?** connection popup. Allowing stores the site origin in extension storage. The console's **Connected sites** section lists approved origins and provides a **Revoke** button.

Irreversible actions open a separate approval popup showing the action preview. Denying or closing that popup does not run the action. Gmail compose and calendar/Meet draft tools open drafts only; sending or saving remains a user-controlled step.

The public bridge exposes only the site allowlist: Gmail compose/send, calendar draft/compose, and Meet schedule/invite compose. The extension console retains full tool access for the attached tab.

## Manual checks

1. Load the unpacked `dist` build and open the portfolio chatbot.
2. Confirm the first tool request shows the site connection popup.
3. Confirm denying it returns `site_not_connected` and does not run a tool.
4. Confirm the console lists the connected origin and can revoke it.
5. Confirm a Gmail compose request opens a draft and a send request shows the approval popup.
6. Confirm a site bridge request for a read, delete, archive, or generic tool is rejected.

Gmail and Google Meet DOM selectors must be checked against the live sites before relying on automation.
