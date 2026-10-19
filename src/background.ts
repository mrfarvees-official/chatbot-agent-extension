import type { ToolSpec } from "./core/types";
import { validateArgs } from "./core/validate";

const API_VERSION = 2;
const TRUSTED_ORIGINS = ["https://chatbot.farvees.xyz"];

function isTrustedOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      TRUSTED_ORIGINS.includes(url.origin) ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

const SITE_TOOL_ALLOWLIST = new Set([
  "gmail_compose_draft",
  "gmail_send_current_draft",
  "calendar_create_event",
  "calendar_compose_invite_email",
  "meet_schedule_meeting",
  "meet_compose_invite_email",
]);

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
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    function onUpdated(id: number, info: chrome.tabs.OnUpdatedInfo) {
      if (id === tabId && info.status === "complete") done();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
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
  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 460,
    height: 380,
  });
  const winId = win?.id;

  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      pending.delete(id);
      if (winId !== undefined) {
        winToId.delete(winId);
        chrome.windows.remove(winId).catch(() => {});
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 60_000);
    pending.set(id, finish);
    if (winId !== undefined) winToId.set(winId, id);
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
    return await chrome.tabs.sendMessage(tabId, { type: "LIST_TOOLS" });
  } catch {
    return [];
  }
}

async function listAllTools(includeDisabled: boolean): Promise<ToolSpec[]> {
  const { disabledTools = [] } =
    await chrome.storage.local.get("disabledTools");
  const disabled = disabledTools as string[];

  const seen = new Set<string>();
  const all = [...globalTools, ...(await pageTools())].filter(
    (t) => !seen.has(t.name) && !!seen.add(t.name),
  );

  return includeDisabled ? all : all.filter((t) => !disabled.includes(t.name));
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
    const emails = (s: unknown) =>
      String(s ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const valid = (list: string[]) =>
      list.length > 0 &&
      list.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const to = emails(args.to);
    if (!valid(to)) return { ok: false, reason: "invalid_recipient" };
    const p = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: to.join(","),
      su: String(args.subject),
      body: String(args.body),
    });
    for (const k of ["cc", "bcc"]) {
      const list = emails(args[k]);
      if (!list.length) continue;
      if (!valid(list)) return { ok: false, reason: `invalid_${k}` };
      p.set(k, list.join(","));
    }

    const tab = await chrome.tabs.create({
      url: `https://mail.google.com/mail/?${p}`,
    });
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
        health = await chrome.tabs.sendMessage(tab.id!, { type: "HEALTH" });
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
    return chrome.tabs.sendMessage(tabId, {
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

  const tabId = await getAttached();
  if (tabId === undefined) return { ok: false, reason: "no_attached_tab" };
  const access = await ensureAccess(tabId);
  if (!access.ok) return access;

  const specs: ToolSpec[] = await chrome.tabs.sendMessage(tabId, {
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
        (await chrome.tabs.sendMessage(tabId, {
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
  return chrome.tabs.sendMessage(tabId, {
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
          const tools = await listAllTools(!!msg.all && isExtPage(sender));
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
          out = await callTool(msg.name, msg.args);
        } catch (e) {
          out = { ok: false, reason: "internal_error", error: String(e) };
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
