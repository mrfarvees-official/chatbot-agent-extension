import "./theme";

const p = new URLSearchParams(location.search);
const id = p.get("id") ?? "";
const mode = p.get("mode") ?? "action";
const $ = (s: string) => document.getElementById(s)!;
const ok = $("ok") as HTMLButtonElement;

if (mode === "connect") {
  $("title").textContent = "Allow this site to use Site Agent?";
  $("detail").textContent = p.get("origin") ?? "";
  ok.textContent = "Allow";
  $("description").textContent = "Connect this site to the tools in your browser.";
} else if (mode === "permission") {
  $("title").textContent = "Allow the assistant to use this site?";
  $("detail").textContent = p.get("origin") ?? "";
  ok.textContent = "Allow";
  $("description").textContent = "Grant browser access to this site to continue the requested action.";
} else {
  $("title").textContent = "Approve this action?";
  $("detail").textContent = `${p.get("tool")}\n\n${p.get("preview") ?? ""}`;
}

const send = (approved: boolean) =>
  chrome.runtime.sendMessage({ type: "APPROVAL_RESULT", id, approved });

const no = $("no") as HTMLButtonElement;
async function respond(allow: boolean) {
  if (ok.disabled) return;
  ok.disabled = no.disabled = true;
  $("error").textContent = "";
  try {
    let approved = allow;
    if (allow && mode === "permission") {
      // Keep permission requests directly in the extension user's click handler.
      approved = await chrome.permissions.request({ origins: [`${p.get("origin")}/*`] });
    }
    await send(approved);
  } catch {
    $("error").textContent = "The request could not be completed. Close this window and retry from Chatbot.";
    ok.disabled = no.disabled = false;
  }
}
ok.onclick = () => respond(true);
no.onclick = () => respond(false);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") void respond(false);
});
