import Link from "next/link";
import { ArrowUpRight, Twitter } from "lucide-react";

const footerLinks = [
  { href: "/dashboard", label: "Quests" },
  { href: "/projects", label: "Projects" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
  { href: "/admin", label: "Studio" }
];

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
          <nav className="flex flex-wrap gap-2 md:justify-end">
            {footerLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="focus-ring rounded-lg px-3 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex text-sm font-semibold text-blue-100">
            <a
              href="https://x.com/questora_xyz"
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1 rounded-lg px-3 py-2 transition hover:bg-white/10 hover:text-white"
            >
              <Twitter size={16} />
              @questora_xyz
              <ArrowUpRight size={16} />
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
