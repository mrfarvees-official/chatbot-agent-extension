import type { SiteAdapter } from "./types";

const adapters: SiteAdapter[] = [];
let fallback: SiteAdapter | null = null;

export const register = (a: SiteAdapter) => void adapters.push(a);
export const setFallback = (a: SiteAdapter) => void (fallback = a);

export function resolveAdapter(url: URL): SiteAdapter {
  const found = adapters.find((a) => a.matches(url)) ?? fallback;
  if (!found) throw new Error("No adapter for " + url.hostname);
  return found;
}
