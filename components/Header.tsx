"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Bell } from "lucide-react";
import { useAccount } from "wagmi";
import { clsx } from "clsx";
import { getUnreadNotificationCount } from "@/lib/quest-service";

const navItems = [
  { href: "/dashboard", label: "Quests" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
  { href: "/admin", label: "Studio" }
];

export function Header() {
  const pathname = usePathname();
  const { address } = useAccount();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadUnreadCount() {
      if (!address) {
        setUnreadCount(0);
        return;
      }

      const count = await getUnreadNotificationCount(address);
      if (active) setUnreadCount(count);
    }

    loadUnreadCount();
    const interval = window.setInterval(loadUnreadCount, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [address, pathname]);

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

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/notifications"
            className={clsx(
              "focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-xl transition",
              pathname === "/notifications" ? "bg-white text-base-blue" : "bg-white/10 text-blue-100 hover:bg-white/15 hover:text-white"
            )}
            aria-label="Notifications"
          >
            <Bell size={19} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-cyan-200 px-1.5 py-0.5 text-center text-[10px] font-black text-slate-950">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Link>
          <ConnectButton chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} showBalance={false} />
        </div>
      </div>
    </header>
  );
}
