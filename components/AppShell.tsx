"use client";

import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  return (
    <>
      <Header />
      <main className={clsx(isLandingPage ? "" : "min-h-screen pt-32 lg:pl-64 lg:pt-20")}>{children}</main>
      <div className={clsx(isLandingPage ? "" : "lg:pl-64")}>
        <Footer />
      </div>
    </>
  );
}
