import type { ToolSpec } from "./core/types";
import { validateArgs } from "./core/validate";
import { gmailAdapter } from "./adapters/gmail";
import { meetAdapter } from "./adapters/meet";
import { calendarAdapter } from "./adapters/calendar";
import { createGmailDraftUrl } from "./gmail-draft";
import { PUBLIC_SITE_TOOL_ALLOWLIST } from "./site-tools";
import { normalizeToolOutcome } from "./core/outcome";

const API_VERSION = 2;
const TRUSTED_ORIGINS = ["https://chatbot.farvees.xyz"];

function isTrustedOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      TRUSTED_ORIGINS.includes(url.origin) ||
      ((url.protocol === "http:" || url.protocol === "https:") &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

const SITE_TOOL_ALLOWLIST = PUBLIC_SITE_TOOL_ALLOWLIST;

const emptySchema = { type: "object", properties: {} };

export const globalTools: ToolSpec[] = [
  {
    name: "browser_list_tabs",
    description: "List open tabs (id, title, site origin). Read only.",
    risk: "read",
    inputSchema: emptySchema,
  },
  {
    name: "browser_open_tab",
    description:
      "Open an https URL in a new tab and attach to it so page tools target it.",
    risk: "write",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "browser_attach_tab",
    description: "Choose which existing tab the page tools control.",
    risk: "write",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
      required: ["tabId"],
    },
  },
  {
    name: "browser_snapshot",
    description: "Compact text view of the attached tab. Read only.",
    risk: "read",
    inputSchema: emptySchema,
  },
  {
    name: "browser_health",
    description:
      "Report which page selectors currently work on the attached tab.",
    risk: "read",
    inputSchema: emptySchema,
  },
  {
    name: "gmail_compose_draft",
    description:
      "Open a prefilled Gmail compose draft in a new tab and attach to it. Does NOT send. Use for any email. Afterwards tell the owner the draft is open for review; only call gmail_send_current_draft if the owner wants it sent.",
    risk: "write",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Comma-separated emails" },
        cc: { type: "string", description: "Comma-separated emails" },
        bcc: { type: "string", description: "Comma-separated emails" },
        subject: { type: "string" },
        body: {
          type: "string",
          description: "Plain text, use \\n for line breaks",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
];

const forbidden = { ok: false, reason: "forbidden" };

const originOf = (u?: string) => {
  try {
    return u ? new URL(u).origin : "";
  } catch {
    return "";
  }
};

// ---------- attached tab (persisted, service workers restart) ----------
const KEY = "attachedTabId";
const getAttached = async (): Promise<number | undefined> =>
  (await chrome.storage.session.get(KEY))[KEY] as number | undefined;
const setAttached = (id: number) => chrome.storage.session.set({ [KEY]: id });

function waitForLoad(tabId: number, timeoutMs = 15000) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const timer = setTimeout(done, timeoutMs);
    function done() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    function onUpdated(id: number, info: chrome.tabs.OnUpdatedInfo) {
      if (id === tabId && info.status === "complete") done();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") done();
    }).catch(() => done());
  });
}

function sendTabMessage<T>(tabId: number, message: unknown, timeoutMs = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new Error("tab_message_timeout"))), timeoutMs);
    chrome.tabs.sendMessage(tabId, message).then(
      (value) => finish(() => resolve(value as T)),
      (error) => finish(() => reject(error)),
    );
  });
}

// ---------- controls: pause, per-tool toggles, audit log ----------
const isPaused = async () =>
  !!(await chrome.storage.local.get("paused")).paused;

async function audit(e: {
  tool: string;
  source: string;
  outcome: string;
  args?: unknown;
}) {
  const { log = [] } = await chrome.storage.local.get("log");
  const entries = log as any[];
  // Log argument names only, never values (they can contain email text).
  entries.push({
    t: Date.now(),
    tool: e.tool,
    source: e.source,
    outcome: e.outcome,
    argKeys: Object.keys((e.args as object) ?? {}),
  });
  await chrome.storage.local.set({ log: entries.slice(-200) });
}

// ---------- approvals: extension-owned popup, 60s timeout, default deny ----------
const pending = new Map<string, (ok: boolean) => void>();
const winToId = new Map<number, string>();

async function openApprovalWindow(
  params: Record<string, string>,
): Promise<boolean> {
  const id = crypto.randomUUID();
  const url =
    chrome.runtime.getURL("approve.html") +
    "?" +
    new URLSearchParams({ id, ...params });
  return new Promise<boolean>((resolve) => {
    let winId: number | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      pending.delete(id);
      if (winId !== undefined) {
        winToId.delete(winId);
        chrome.windows.remove(winId).catch(() => {});
      }
      resolve(ok);
    };

    // Register before opening the popup. A fast click must not race the
    // service worker's pending-approval registration.
    pending.set(id, finish);
    timer = setTimeout(() => finish(false), 60_000);

    chrome.windows
      .create({
        url,
        type: "popup",
        width: 460,
        height: 380,
      })
      .then((win) => {
        winId = win?.id;
        if (winId === undefined) return;
        if (settled) {
          chrome.windows.remove(winId).catch(() => {});
          return;
        }
        winToId.set(winId, id);
      })
      .catch(() => finish(false));
  });
}

chrome.windows.onRemoved.addListener((winId) => {
  const id = winToId.get(winId);
  if (id) pending.get(id)?.(false); // closed without choosing = deny
});

// ---------- per-site access, content script injected on demand ----------
async function ensureAccess(
  tabId: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, reason: "no_such_tab" };
  }

  if (!tab.url || !/^https?:/.test(tab.url))
    return { ok: false, reason: "unsupported_page" };
  const origin = new URL(tab.url).origin;

  const granted = await chrome.permissions.contains({
    origins: [`${origin}/*`],
  });
  if (!granted && !(await openApprovalWindow({ mode: "permission", origin }))) {
    return { ok: false, reason: "permission_denied" };
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  return { ok: true };
}

export async function pageTools(): Promise<ToolSpec[]> {
  const tabId = await getAttached();
  if (tabId === undefined) return [];
  try {
    const tab = await chrome.tabs.get(tabId);
    const origin = new URL(tab.url ?? "").origin;
    if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] })))
      return [];
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return await sendTabMessage<ToolSpec[]>(tabId, { type: "LIST_TOOLS" });
  } catch {
    return [];
  }
}

async function listAllTools(includeDisabled: boolean, includePageTools = true): Promise<ToolSpec[]> {
  const { disabledTools = [] } =
    await chrome.storage.local.get("disabledTools");
  const disabled = disabledTools as string[];

  const seen = new Set<string>();
  // Advertise Gmail capabilities before a Gmail tab exists. Execution will
  // attach/open Gmail when an authenticated user actually calls one.
  // Bridge discovery must not depend on a live page: its 5s client deadline
  // is shorter than the content-script timeout. Execution attaches separately.
  const all = [...globalTools, ...gmailAdapter.tools, ...calendarAdapter.tools, ...meetAdapter.tools, ...(includePageTools ? await pageTools() : [])].filter(
    (t) => !seen.has(t.name) && !!seen.add(t.name),
  );

  return includeDisabled ? all : all.filter((t) => !disabled.includes(t.name));
}

async function ensureGmailTab(): Promise<number | undefined> {
  const attached = await getAttached();
  if (attached !== undefined) {
    try {
      const tab = await chrome.tabs.get(attached);
      if (new URL(tab.url ?? "").hostname === "mail.google.com") return attached;
    } catch {
      /* Open a fresh Gmail tab below. */
    }
  }

  const tab = await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/#inbox" });
  if (tab.id === undefined) return undefined;
  await waitForLoad(tab.id);
  await setAttached(tab.id);
  return tab.id;
}

async function ensureMeetTab(): Promise<number | undefined> {
  const attached = await getAttached();
  if (attached !== undefined) {
    try {
      const tab = await chrome.tabs.get(attached);
      if (new URL(tab.url ?? "").hostname === "meet.google.com") return attached;
    } catch {
      /* Open a Meet tab below. */
    }
  }

  const tab = await chrome.tabs.create({ url: "https://meet.google.com/" });
  if (tab.id === undefined) return undefined;
  await waitForLoad(tab.id);
  await setAttached(tab.id);
  return tab.id;
}

async function ensureCalendarTab(): Promise<number | undefined> {
  const attached = await getAttached();
  if (attached !== undefined) {
    try {
      const tab = await chrome.tabs.get(attached);
      if (new URL(tab.url ?? "").hostname === "calendar.google.com") return attached;
    } catch {
      /* Open a Calendar tab below. */
    }
  }

  const tab = await chrome.tabs.create({ url: "https://calendar.google.com/calendar/u/0/r" });
  if (tab.id === undefined) return undefined;
  await waitForLoad(tab.id);
  await setAttached(tab.id);
  return tab.id;
}

// ---------- execution ----------
async function runGlobal(name: string, args: any): Promise<unknown> {
  if (name === "browser_list_tabs") {
    const tabs = await chrome.tabs.query({});
    return tabs.map((t) => ({
      id: t.id,
      title: t.title,
      origin: originOf(t.url),
    }));
  }

  if (name === "browser_open_tab") {
    if (!/^https:\/\//.test(String(args.url)))
      return { ok: false, reason: "https_only" };
    const tab = await chrome.tabs.create({ url: args.url });
    await waitForLoad(tab.id!);
    await setAttached(tab.id!);
    return { ok: true, tabId: tab.id };
  }

  if (name === "browser_attach_tab") {
    const id = Number(args.tabId);
    try {
      await chrome.tabs.get(id);
    } catch {
      return { ok: false, reason: "no_such_tab" };
    }
    await setAttached(id);
    return { ok: true };
  }

  if (name === "gmail_compose_draft") {
    let url: string;
    try {
      url = createGmailDraftUrl(args);
    } catch (error) {
      return { ok: false, reason: String(error instanceof Error ? error.message : error) };
    }
    const tab = await chrome.tabs.create({ url });
    await waitForLoad(tab.id!);
    await setAttached(tab.id!);

    // First time only: shows the "Allow this site?" popup
    const access = await ensureAccess(tab.id!);
    if (!access.ok) {
      return {
        ok: true,
        tabId: tab.id,
        automation: false,
        note: "Draft is open but I can't automate Gmail. The owner must review and press Send themselves.",
      };
    }

    // Wait until Gmail's compose fields and Send button exist
    let health: { name: string; ok: boolean }[] = [];
    for (let i = 0; i < 20; i++) {
      try {
        health = await sendTabMessage<{ name: string; ok: boolean }[]>(tab.id!, { type: "HEALTH" });
        if (health.length && health.every((h) => h.ok)) break;
      } catch {
        /* content script not ready yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const ready = health.length > 0 && health.every((h) => h.ok);
    return {
      ok: true,
      tabId: tab.id,
      automation: true,
      ready,
      health,
      note: "Draft opened, NOT sent",
    };
  }

  if (name === "browser_snapshot" || name === "browser_health") {
    const tabId = await getAttached();
    if (tabId === undefined) return { ok: false, reason: "no_attached_tab" };
    const access = await ensureAccess(tabId);
    if (!access.ok) return access;
    return sendTabMessage(tabId, {
      type: name === "browser_snapshot" ? "SNAPSHOT" : "HEALTH",
    });
  }

  return { ok: false, reason: "unknown_tool" };
}

async function callTool(name: string, args: any): Promise<unknown> {
  const { disabledTools = [] } =
    await chrome.storage.local.get("disabledTools");
  if ((disabledTools as string[]).includes(name))
    return { ok: false, reason: "tool_disabled" };

  const global = globalTools.find((t) => t.name === name);
  if (global) {
    const errors = validateArgs(global.inputSchema, args);
    if (errors.length) return { ok: false, reason: "invalid_args", errors };
    return runGlobal(name, args ?? {});
  }

  const tabId = name.startsWith("gmail_")
    ? await ensureGmailTab()
    : name.startsWith("calendar_")
      ? await ensureCalendarTab()
    : name.startsWith("meet_")
      ? await ensureMeetTab()
      : await getAttached();
  if (tabId === undefined) return { ok: false, reason: "no_attached_tab" };
  const access = await ensureAccess(tabId);
  if (!access.ok) return access;

  const specs: ToolSpec[] = await sendTabMessage<ToolSpec[]>(tabId, {
    type: "LIST_TOOLS",
  });
  const spec = specs.find((s) => s.name === name);
  if (!spec) return { ok: false, reason: "unknown_tool_for_this_page" };

  const errors = validateArgs(spec.inputSchema, args);
  if (errors.length) return { ok: false, reason: "invalid_args", errors };

  // Enforced here, never by the model or the chat UI.
  if (spec.risk === "irreversible") {
    let preview = "";
    try {
      preview = String(
        (await sendTabMessage(tabId, {
          type: "PREVIEW",
          tool: name,
          args,
        })) ?? "",
      );
    } catch {}
    const approved = await openApprovalWindow({
      mode: "action",
      tool: name,
      preview: preview.slice(0, 1500),
    });
    if (!approved) return { ok: false, reason: "denied_by_user" };
  }
  if (name === "meet_join_link") {
    const url = String(args?.url ?? "");
    if (!/^https:\/\/meet\.google\.com\//.test(url))
      return { ok: false, reason: "meet_url_required" };
    await chrome.tabs.update(tabId, { url });
    await waitForLoad(tabId);
    await setAttached(tabId);
    const reopened = await ensureAccess(tabId);
    if (!reopened.ok) return reopened;
    return sendTabMessage(tabId, {
      type: "EXEC",
      tool: "meet_join_meeting",
      args: {},
    });
  }
  if (name === "calendar_search_events") {
    const query = String(args?.query ?? "");
    await chrome.tabs.update(tabId, {
      url: `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(query)}`,
    });
    await waitForLoad(tabId);
    await setAttached(tabId);
    const reopened = await ensureAccess(tabId);
    if (!reopened.ok) return reopened;
    const tab = await chrome.tabs.get(tabId);
    const snapshot = await sendTabMessage<string>(tabId, { type: "SNAPSHOT" });
    return { ok: true, query, page: tab.url, snapshot };
  }
  if (name === "calendar_open_availability") {
    const date = String(args?.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return { ok: false, reason: "date_must_be_YYYY_MM_DD" };
    const [year, month, day] = date.split("-");
    await chrome.tabs.update(tabId, {
      url: `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`,
    });
    await waitForLoad(tabId);
    await setAttached(tabId);
    const reopened = await ensureAccess(tabId);
    if (!reopened.ok) return reopened;
    const tab = await chrome.tabs.get(tabId);
    const snapshot = await sendTabMessage<string>(tabId, { type: "SNAPSHOT" });
    return { ok: true, date, page: tab.url, snapshot };
  }
  return sendTabMessage(tabId, {
    type: "EXEC",
    tool: name,
    args: args ?? {},
  });
}

// ---------- routing with sender checks ----------
const isExtPage = (s: chrome.runtime.MessageSender) =>
  s.id === chrome.runtime.id && !!s.url?.startsWith(chrome.runtime.getURL(""));

const isBridge = (s: chrome.runtime.MessageSender) => {
  if (s.id !== chrome.runtime.id || !s.tab) return false;
  try {
    // Content-script messages may expose the page URL through tab.url rather
    // than sender.url. The tab URL is extension-provided metadata, not client
    // input, and is the source used for the trusted-origin check.
    const u = new URL(s.tab.url ?? s.url ?? "");
    // The public chat page must never render untrusted HTML.
    return isTrustedOrigin(u.origin);
  } catch {
    return false;
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const trusted = isBridge(sender) || isExtPage(sender);
    switch (msg?.type) {
      case "AGENT_PING":
        return trusted
          ? {
              ok: true,
              version: chrome.runtime.getManifest().version,
              apiVersion: API_VERSION,
            }
          : forbidden;
      case "AGENT_LIST_TOOLS":
        if (!trusted) return forbidden;
        {
          const tools = await listAllTools(!!msg.all && isExtPage(sender), !isBridge(sender));
          return isBridge(sender)
            ? tools.filter((tool) => SITE_TOOL_ALLOWLIST.has(tool.name))
            : tools;
        }
      case "AGENT_CALL_TOOL": {
        if (!trusted) return forbidden;
        if (isBridge(sender)) {
          if (!SITE_TOOL_ALLOWLIST.has(msg.name))
            return { ok: false, reason: "tool_not_allowed_for_site" };
        }
        if (await isPaused()) return { ok: false, reason: "paused" };
        let out: any;
        try {
          out = normalizeToolOutcome(msg.name, await callTool(msg.name, msg.args));
        } catch (e) {
          out = { ok: false, tool: msg.name, reason: "internal_error", error: String(e) };
        }
        await audit({
          tool: msg.name,
          source: isBridge(sender) ? "site" : "console",
          outcome: out?.ok === false ? (out.reason ?? "error") : "ok",
          args: msg.args,
        });
        return out;
      }
      case "OPEN_URL": {
        // Only from an adapter running in the attached tab (e.g. Gmail compose).
        const attached = await getAttached();
        if (sender.tab?.id !== attached || !/^https:\/\//.test(String(msg.url)))
          return forbidden;
        const tab = await chrome.tabs.create({ url: msg.url });
        await waitForLoad(tab.id!);
        await setAttached(tab.id!);
        return { ok: true };
      }
      case "APPROVAL_RESULT":
        if (!isExtPage(sender)) return forbidden;
        pending.get(msg.id)?.(!!msg.approved);
        return { ok: true };
    }
    return forbidden;
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

// Toolbar icon opens the console (same in Chrome, Edge, Opera GX).
chrome.action.onClicked.addListener(() =>
  chrome.tabs.create({ url: chrome.runtime.getURL("console.html") }),
);
