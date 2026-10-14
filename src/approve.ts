export {};

const p = new URLSearchParams(location.search);
const id = p.get("id") ?? "";
const mode = p.get("mode") ?? "action";
const $ = (s: string) => document.getElementById(s)!;
const ok = $("ok") as HTMLButtonElement;

if (mode === "permission") {
  $("title").textContent = "Allow the assistant to use this site?";
  $("detail").textContent = p.get("origin") ?? "";
  ok.textContent = "Allow";
} else {
  $("title").textContent = "Approve this action?";
  $("detail").textContent = `${p.get("tool")}\n\n${p.get("preview") ?? ""}`;
}

const send = (approved: boolean) =>
  chrome.runtime.sendMessage({ type: "APPROVAL_RESULT", id, approved });

ok.onclick = async () => {
  let approved = true;
  if (mode === "permission") {
    // chrome.permissions.request must run from a user click on an extension page.
    approved = await chrome.permissions.request({
      origins: [`${p.get("origin")}/*`],
    });
  }
  await send(approved);
};
$("no").onclick = () => send(false);
