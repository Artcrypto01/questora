import Link from "next/link";
import { Twitter } from "lucide-react";

function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19.54 5.23A16.9 16.9 0 0 0 15.39 4a11.7 11.7 0 0 0-.53 1.08 15.73 15.73 0 0 0-4.72 0A11.7 11.7 0 0 0 9.61 4a16.9 16.9 0 0 0-4.15 1.23C2.83 9.14 2.12 12.96 2.48 16.73A16.72 16.72 0 0 0 7.57 19.3c.41-.55.77-1.13 1.08-1.74a10.9 10.9 0 0 1-1.7-.81l.42-.33a12.13 12.13 0 0 0 10.26 0l.42.33c-.54.32-1.11.59-1.7.81.31.61.67 1.19 1.08 1.74a16.67 16.67 0 0 0 5.09-2.57c.42-4.37-.72-8.16-2.98-11.5ZM8.68 14.42c-.99 0-1.8-.91-1.8-2.03s.79-2.04 1.8-2.04c1 0 1.82.91 1.8 2.04 0 1.12-.8 2.03-1.8 2.03Zm6.64 0c-.99 0-1.8-.91-1.8-2.03s.79-2.04 1.8-2.04c1 0 1.82.91 1.8 2.04 0 1.12-.79 2.03-1.8 2.03Z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#061022]/90">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <Link href="/" className="focus-ring inline-flex items-center gap-3 rounded-lg">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
              <img src="/questora-logo.png" alt="" className="h-9 w-9 object-contain" />
            </span>
            <span className="questora-wordmark text-lg text-white">Questora</span>
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-blue-100">
            The quest and reputation layer for Base communities.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <div className="flex gap-2 text-sm font-semibold text-blue-100">
            <a
              href="https://x.com/questora_xyz"
              target="_blank"
              rel="noreferrer"
              aria-label="Questora on X"
              className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-white/10 hover:text-white"
            >
              <Twitter size={18} />
            </a>
            <a
              href="https://discord.gg/Rr9sWbBuEj"
              target="_blank"
              rel="noreferrer"
              aria-label="Questora Discord"
              className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-white/10 hover:text-white"
            >
              <DiscordIcon />
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs font-semibold text-blue-200">
        <div className="mx-auto max-w-7xl">&copy; 2026 Questora. Built for communities that show up.</div>
      </div>
    </footer>
  );
}
