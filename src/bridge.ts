const FROM_PAGE = "portfolio-chat";
const FROM_EXT = "portfolio-ext";

const currentTheme = () => document.documentElement?.dataset.theme === "light" ? "light" : "dark";
let lastTheme = "";
function syncTheme() {
  const theme = currentTheme();
  if (theme === lastTheme) return;
  lastTheme = theme;
  chrome.runtime.sendMessage({ type: "AGENT_SET_THEME", theme }).catch(() => {});
}
function watchTheme() {
  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"],
  });
  syncTheme();
}
if (document.documentElement) watchTheme();
else document.addEventListener("DOMContentLoaded", watchTheme, { once: true });
syncTheme();

window.addEventListener("message", async (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const m = e.data;
  if (!m || m.source !== FROM_PAGE) return;

  let reply: unknown;
  try {
    if (m.type === "PING") {
      reply = await chrome.runtime.sendMessage({ type: "AGENT_PING", theme: currentTheme() });
    } else if (m.type === "LIST_TOOLS") {
      reply = await chrome.runtime.sendMessage({ type: "AGENT_LIST_TOOLS", theme: currentTheme() });
    } else if (m.type === "CALL_TOOL") {
      reply = await chrome.runtime.sendMessage({
        type: "AGENT_CALL_TOOL",
        name: m.name,
        args: m.args,
        theme: currentTheme(),
      });
    } else {
      reply = { ok: false, reason: "unknown_message" };
    }
  } catch (err) {
    reply = { ok: false, error: String(err) };
  }
  window.postMessage({ source: FROM_EXT, id: m.id, reply }, location.origin);
});
