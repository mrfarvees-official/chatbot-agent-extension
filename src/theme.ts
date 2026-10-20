const THEME_KEY = "chatbotTheme";
const applyTheme = (value: unknown) => {
  document.documentElement.dataset.theme = value === "light" ? "light" : "dark";
};

// The popup URL supplies the initial theme before the storage lookup finishes.
const initial = new URLSearchParams(location.search).get("theme");
applyTheme(initial);
let themeChanged = false;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[THEME_KEY]) {
    themeChanged = true;
    applyTheme(changes[THEME_KEY].newValue);
  }
});
chrome.storage.local.get(THEME_KEY).then((saved) => {
  if (!themeChanged && saved[THEME_KEY]) applyTheme(saved[THEME_KEY]);
}).catch(() => {});
