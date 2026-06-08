export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function normalizeWallet(address: string) {
  return address.toLowerCase();
}

export function getImageUrl(url?: string | null) {
  if (!url) return "";

  const value = url.trim();
  if (!value) return "";

  try {
    const parsedUrl = new URL(value);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
    const pathParts = pathname.split("/").filter(Boolean);
    const hasImageExtension = /\.(avif|gif|jpe?g|png|webp)$/i.test(pathname);

    if ((hostname === "imgur.com" || hostname === "www.imgur.com") && pathParts[0] && ["a", "gallery"].includes(pathParts[0])) {
      return "";
    }

    if ((hostname === "imgur.com" || hostname === "www.imgur.com") && pathParts.length === 1 && !hasImageExtension) {
      return `https://i.imgur.com/${pathname}.png`;
    }

    if (hostname === "i.imgur.com" && pathParts.length === 1 && !hasImageExtension) {
      return `https://i.imgur.com/${pathname}.png`;
    }

    return value;
  } catch {
    return value;
  }
}

export function isQuestEnded(endsAt?: string | null) {
  return Boolean(endsAt && new Date(endsAt).getTime() <= Date.now());
}

export function formatQuestDeadline(endsAt?: string | null) {
  if (!endsAt) return null;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(endsAt));
}

export function toDatetimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
