import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let route: (message: unknown, sender: unknown, reply: (tools: Array<{ name: string }>) => void) => boolean;
const tabMessage = vi.fn(() => new Promise(() => {}));
const attachedTab = vi.fn().mockResolvedValue({ attachedTabId: 1 });
const localStorage = vi.fn().mockResolvedValue({ disabledTools: [] });

beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: { id: "test-extension", onMessage: { addListener: (listener: typeof route) => { route = listener; } }, getURL: (path: string) => `chrome-extension://test-extension/${path}` },
    windows: { onRemoved: { addListener: vi.fn() } },
    action: { onClicked: { addListener: vi.fn() } },
    storage: { session: { get: attachedTab }, local: { get: localStorage } },
    tabs: { sendMessage: tabMessage },
  });
  await import("../src/background");
});
afterAll(() => vi.unstubAllGlobals());

describe("public bridge tool discovery", () => {
  it("returns the catalog even if the attached tab cannot reply", async () => {
    const tools = await new Promise<Array<{ name: string }>>((resolve) => {
      route({ type: "AGENT_LIST_TOOLS" }, {
        id: "test-extension", tab: { url: "http://localhost:3000/" },
      }, resolve);
    });
    expect(tools).toHaveLength(42);
    expect(tools.map((tool) => tool.name)).toContain("gmail_send_current_draft");
    expect(attachedTab).not.toHaveBeenCalled();
    expect(tabMessage).not.toHaveBeenCalled();
  });
  it("still respects disabled tools without accessing a page", async () => {
    localStorage.mockResolvedValueOnce({ disabledTools: ["gmail_send_current_draft"] });
    const tools = await new Promise<Array<{ name: string }>>((resolve) => {
      route({ type: "AGENT_LIST_TOOLS" }, {
        id: "test-extension", tab: { url: "http://localhost:3000/" },
      }, resolve);
    });
    expect(tools.map((tool) => tool.name)).not.toContain("gmail_send_current_draft");
    expect(tabMessage).not.toHaveBeenCalled();
  });
});
