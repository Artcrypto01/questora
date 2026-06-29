import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AppProviders } from "@/components/AppProviders";
import { WalletRegistrar } from "@/components/WalletRegistrar";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://questora.xyz";
const siteDescription =
  "Questora helps Base communities run quests, qualify real contributors, export whitelist wallets, and reward participation.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Questora",
    template: "%s | Questora"
  },
  description: siteDescription,
  icons: {
    icon: "/questora-logo.png",
    apple: "/questora-logo.png"
  },
  openGraph: {
    title: "Questora",
    description: siteDescription,
    url: siteUrl,
    siteName: "Questora",
    images: [
      {
        url: "/questora-banner.png",
        width: 2048,
        height: 758,
        alt: "Questora"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Questora",
    description: siteDescription,
    images: ["/questora-banner.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <WalletRegistrar />
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
