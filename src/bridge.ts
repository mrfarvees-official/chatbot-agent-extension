const FROM_PAGE = "portfolio-chat";
const FROM_EXT = "portfolio-ext";

window.addEventListener("message", async (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const m = e.data;
  if (!m || m.source !== FROM_PAGE) return;

  let reply: unknown;
  try {
    if (m.type === "PING") {
      reply = await chrome.runtime.sendMessage({ type: "AGENT_PING" });
    } else if (m.type === "LIST_TOOLS") {
      reply = await chrome.runtime.sendMessage({ type: "AGENT_LIST_TOOLS" });
    } else if (m.type === "CALL_TOOL") {
      reply = await chrome.runtime.sendMessage({
        type: "AGENT_CALL_TOOL",
        name: m.name,
        args: m.args,
      });
    } else {
      reply = { ok: false, reason: "unknown_message" };
    }
  } catch (err) {
    reply = { ok: false, error: String(err) };
  }
  window.postMessage({ source: FROM_EXT, id: m.id, reply }, location.origin);
});
