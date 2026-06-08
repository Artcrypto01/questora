"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Bell, CheckCheck, ExternalLink, Inbox, Sparkles } from "lucide-react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/quest-service";
import type { Notification } from "@/lib/types";

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function NotificationsPage() {
  const { address } = useAccount();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read_at).length, [notifications]);

  async function loadNotifications() {
    if (!address) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      setNotifications(await getNotifications(address));
    } catch (error) {
      setNotifications([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function handleMarkRead(notification: Notification) {
    if (!address || notification.read_at) return;
    await markNotificationRead(notification.id, address);
    setNotifications((items) => items.map((item) => (item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item)));
  }

  async function handleMarkAllRead() {
    if (!address) return;
    const readAt = new Date().toISOString();
    await markAllNotificationsRead(address);
    setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-cyan-200/20 bg-base-blue p-6 text-white shadow-glow sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-cyan-200">Notification center</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">Updates that need attention</h1>
            <p className="mt-4 max-w-2xl leading-7 text-blue-100">
              Track new quest submissions, approved proof, rejected proof, and project updates from one place.
            </p>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-base-blue">
            <Bell size={30} />
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="text-cyan-200" />
            <div>
              <h2 className="text-xl font-black text-white">Inbox</h2>
              <p className="text-sm font-semibold text-blue-100">{unreadCount} unread notifications</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={!address || unreadCount === 0}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck size={17} />
            Mark all read
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {!address ? (
            <div className="rounded-lg border border-white/10 bg-white/10 p-5 text-blue-100">Connect your wallet to view notifications.</div>
          ) : loading ? (
            <div className="rounded-lg border border-white/10 bg-white/10 p-5 text-blue-100">Loading notifications...</div>
          ) : errorMessage ? (
            <div className="rounded-lg border border-red-300/30 bg-red-500/10 p-5 font-semibold text-red-100">{errorMessage}</div>
          ) : notifications.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/10 p-6">
              <Inbox className="text-cyan-200" />
              <h3 className="mt-4 text-lg font-black text-white">No notifications yet</h3>
              <p className="mt-2 text-blue-100">New submissions and review results will appear here.</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <article
                key={notification.id}
                className="rounded-lg border border-white/10 bg-white/10 p-4 transition hover:border-cyan-200/40"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!notification.read_at ? <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">New</span> : null}
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">
                        {notification.type.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-black text-white">{notification.title}</h3>
                    <p className="mt-2 leading-7 text-blue-100">{notification.body}</p>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wider text-blue-200">{formatNotificationDate(notification.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        onClick={() => handleMarkRead(notification)}
                        className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue"
                      >
                        Open
                        <ExternalLink size={16} />
                      </Link>
                    ) : null}
                    {!notification.read_at ? (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notification)}
                        className="focus-ring rounded-lg bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
