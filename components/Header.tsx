"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { clsx } from "clsx";

const navItems = [
  { href: "/dashboard", label: "Quests" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
  { href: "/admin", label: "Studio" }
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#061022]/88 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="focus-ring flex items-center gap-3 rounded-lg">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
              <img src="/questora-logo.png" alt="" className="h-9 w-9 object-contain" />
            </span>
            <span className="questora-wordmark text-base text-white sm:text-lg">Questora</span>
          </Link>
        </div>

        <nav className="flex items-center gap-2 overflow-x-auto md:justify-center">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "focus-ring shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition",
                pathname === item.href ? "bg-white text-base-blue" : "text-blue-100 hover:bg-white/10 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="shrink-0">
          <ConnectButton chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} showBalance={false} />
        </div>
      </div>
    </header>
  );
}
