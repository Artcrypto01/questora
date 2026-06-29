"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, Bell, FolderKanban, LayoutDashboard, Rocket, Settings2, Trophy, UserRound } from "lucide-react";
import { useAccount } from "wagmi";
import { clsx } from "clsx";
import { getUnreadNotificationCount } from "@/lib/quest-service";

const navItems = [
  { href: "/dashboard", label: "Quests", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/launches", label: "Launches", icon: Rocket },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/admin", label: "Studio", icon: Settings2 }
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="focus-ring flex items-center gap-3 rounded-lg">
      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
        <img src="/questora-logo.png" alt="" className="h-9 w-9 object-contain" />
      </span>
      {!compact ? <span className="questora-wordmark text-base text-white sm:text-lg">Questora</span> : null}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const { address } = useAccount();
  const [unreadCount, setUnreadCount] = useState(0);
  const isLandingPage = pathname === "/";
  const isActivePath = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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

  if (isLandingPage) {
    return (
    <header className="absolute left-0 top-0 z-40 w-full">
      <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <BrandMark />
        </div>

        <Link
          href="/dashboard"
          className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-cyan-200 px-4 py-2.5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-white sm:px-5"
        >
          Launch app
          <ArrowRight size={17} />
        </Link>
      </div>
    </header>
    );
  }

  return (
    <header className="questora-app-shell">
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-white/10 bg-[#050b18]/95 px-4 py-5 shadow-glow backdrop-blur-xl lg:flex">
        <BrandMark />
        <nav className="mt-8 grid gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "focus-ring group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-black transition",
                  isActive ? "bg-cyan-200 text-slate-950" : "text-blue-100 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Questora</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-blue-100">Find active Base communities and keep your contributor reputation close.</p>
        </div>
      </aside>

      <div className="fixed left-0 top-0 z-40 w-full border-b border-white/10 bg-[#061022]/90 backdrop-blur-xl lg:left-64 lg:w-[calc(100%-16rem)]">
        <div className="flex min-h-[76px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark compact />
            <span className="questora-wordmark text-base text-white">Questora</span>
          </div>
          <div className="hidden lg:block" />

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/notifications"
              className={clsx(
                "focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-xl transition",
                isActivePath("/notifications") ? "bg-white text-base-blue" : "bg-white/10 text-blue-100 hover:bg-white/15 hover:text-white"
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

        <nav className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2 sm:px-6 lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "focus-ring flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition",
                  isActive ? "bg-cyan-200 text-slate-950" : "bg-white/10 text-blue-100 hover:bg-white/15 hover:text-white"
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
