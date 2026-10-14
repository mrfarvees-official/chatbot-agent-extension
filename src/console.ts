export {};

type Spec = {
  name: string;
  description: string;
  risk: string;
  inputSchema: any;
};

const $ = (id: string) => document.getElementById(id)!;
const call = (type: string, extra: object = {}): Promise<any> =>
  chrome.runtime.sendMessage({ type, ...extra });

const outputs = new Map<string, string>();
let toolsKey = "";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function field(name: string, schema: any, required: boolean) {
  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (schema.enum) {
    const s = el("select");
    schema.enum.forEach((v: string) =>
      s.append(el("option", { value: v, textContent: v })),
    );
    input = s;
  } else if (schema.type === "boolean")
    input = el("input", { type: "checkbox" });
  else if (schema.type === "number") input = el("input", { type: "number" });
  else if (name === "body" || name === "text")
    input = el("textarea", { rows: 4 });
  else input = el("input", { type: "text" });

  const get = (): unknown => {
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      return input.checked;
    if (input.value === "") return undefined;
    return schema.type === "number" ? Number(input.value) : input.value;
  };
  return {
    node: el("label", {}, `${name}${required ? " *" : ""}`, input),
    get,
  };
}

function toolCard(t: Spec, disabled: string[]) {
  const props = t.inputSchema?.properties ?? {};
  const req: string[] = t.inputSchema?.required ?? [];
  const fields = Object.entries(props).map(([n, s]) => ({
    n,
    ...field(n, s, req.includes(n)),
  }));

  const out = el("pre", { textContent: outputs.get(t.name) ?? "" });
  const run = el("button", { textContent: "Run" });
  run.onclick = async () => {
    const args: Record<string, unknown> = {};
    for (const f of fields) {
      const v = f.get();
      if (v !== undefined) args[f.n] = v;
    }
    out.textContent = "running...";
    const text = JSON.stringify(
      await call("AGENT_CALL_TOOL", { name: t.name, args }),
      null,
      2,
    );
    outputs.set(t.name, text);
    out.textContent = text;
    renderLog();
    renderPerms();
    renderTools(); // page tools appear after attaching a tab
  };

  const enabled = el("input", {
    type: "checkbox",
    checked: !disabled.includes(t.name),
  });
  enabled.onchange = async () => {
    const { disabledTools = [] } =
      await chrome.storage.local.get("disabledTools");
    const disabled = disabledTools as string[];
    const next = enabled.checked
      ? disabled.filter((n) => n !== t.name)
      : [...disabled, t.name];
    await chrome.storage.local.set({ disabledTools: next });
  };

  return el(
    "div",
    { className: "card" },
    el("b", {}, t.name),
    el("span", { className: "badge", textContent: t.risk }),
    el("label", {}, enabled, " enabled"),
    el("div", { textContent: t.description }),
    ...fields.map((f) => f.node),
    run,
    out,
  );
}

async function renderTools() {
  const tools: Spec[] = await call("AGENT_LIST_TOOLS", { all: true });
  const { disabledTools = [] } =
    await chrome.storage.local.get("disabledTools");
  const key = tools.map((t) => t.name).join(",");
  if (key === toolsKey) return; // unchanged: keep cards and their results
  toolsKey = key;
  $("tools").replaceChildren(
    ...tools.map((t) => toolCard(t, disabledTools as string[])),
  );
}

async function renderPerms() {
  const required = new Set(chrome.runtime.getManifest().host_permissions ?? []);
  const { origins = [] } = await chrome.permissions.getAll();
  $("perms").replaceChildren(
    ...origins
      .filter((o) => !required.has(o))
      .map((o) => {
        const b = el("button", { textContent: "Revoke" });
        b.onclick = async () => {
          await chrome.permissions.remove({ origins: [o] });
          renderPerms();
        };
        return el("div", {}, o + " ", b);
      }),
  );
}

async function renderLog() {
  const { log = [] } = await chrome.storage.local.get("log");
  $("log").textContent = (log as any[])
    .slice(-50)
    .reverse()
    .map(
      (e: any) =>
        `${new Date(e.t).toLocaleTimeString()}  ${e.source}  ${e.tool}  -> ${e.outcome}`,
    )
    .join("\n");
}

const paused = $("paused") as HTMLInputElement;
chrome.storage.local.get("paused").then((s) => (paused.checked = !!s.paused));
paused.onchange = () => chrome.storage.local.set({ paused: paused.checked });

renderTools();
renderPerms();
renderLog();
