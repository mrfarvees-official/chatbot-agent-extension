import "./adapters";
import { resolveAdapter } from "./core/registry";

const w = window as any;
if (!w.__agentInjected) {
  // guard against double injection
  w.__agentInjected = true;
  const adapter = resolveAdapter(new URL(location.href));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg.type === "LIST_TOOLS") return adapter.tools;
      if (msg.type === "SNAPSHOT") return adapter.snapshot();
      if (msg.type === "HEALTH") return adapter.health ? adapter.health() : [];
      if (msg.type === "PREVIEW")
        return adapter.preview
          ? adapter.preview(msg.tool, msg.args)
          : JSON.stringify(msg.args ?? {});
      if (msg.type === "EXEC") {
        const ctx = {
          openUrl: async (url: string) => {
            await chrome.runtime.sendMessage({ type: "OPEN_URL", url });
          },
        };
        return adapter.execute(msg.tool, msg.args, ctx);
      }
      return undefined;
    })()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });
}
