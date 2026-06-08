import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardCheck, KeyRound, Trophy, UsersRound, Wallet } from "lucide-react";
import { ConnectWalletCta } from "@/components/ConnectWalletCta";
import { HeroParticleField } from "@/components/HeroParticleField";

const features = [
  {
    icon: Wallet,
    title: "Connect your wallet",
    body: "Access community quests with a secure wallet identity and keep your progress linked to your onchain profile."
  },
  {
    icon: BadgeCheck,
    title: "Complete quests",
    body: "Ship social, learning, and onchain tasks with instant XP rewards."
  },
  {
    icon: Trophy,
    title: "Climb the board",
    body: "Track weekly momentum, earned badges, and top contributors."
  }
];

const useCases = [
  {
    icon: KeyRound,
    title: "NFT whitelist",
    body: "Build wallet lists from members who completed real community tasks."
  },
  {
    icon: ClipboardCheck,
    title: "Early access",
    body: "Select beta testers and early users from approved quest activity."
  },
  {
    icon: UsersRound,
    title: "Contributor tracking",
    body: "See who keeps showing up across campaigns, quests, and seasons."
  },
  {
    icon: Trophy,
    title: "Leaderboard rewards",
    body: "Reward the most consistent contributors with project-level XP rankings."
  }
];

export default function LandingPage() {
  return (
    <div>
      <section className="questora-hero-bg relative overflow-hidden border-b border-white/10">
        <HeroParticleField />
        <div className="questora-hero-grid" />
        <div className="questora-scanline" />
        <div className="questora-hero-routes">
          <span className="questora-route questora-route-one" />
          <span className="questora-route questora-route-two" />
        </div>
        <div className="questora-circuit-nodes" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-76px)] max-w-7xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.86fr] lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm font-medium text-cyan-100 shadow-sm">
              Native quests for Base communities
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-glow">
                <img src="/questora-logo.png" alt="" className="h-20 w-20 object-contain" />
              </div>
              <h1 className="questora-wordmark max-w-3xl text-4xl text-white sm:text-6xl lg:text-7xl">
                Questora
              </h1>
            </div>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-100">
              The quest and reputation layer that helps projects find the people who actually show up across Base communities.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ConnectWalletCta />
              <Link
                href="/dashboard"
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-white hover:text-base-blue"
              >
                Explore quests
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/admin"
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200/30 bg-cyan-200 px-5 py-3 font-black text-slate-950 shadow-sm transition hover:bg-white"
              >
                Launch a project
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="questora-holo-card rounded-[2rem] border border-white/15 bg-white/10 p-4 shadow-glow backdrop-blur">
              <div className="rounded-[1.4rem] bg-[#071832] p-5 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wider text-cyan-100">Season One</span>
                  <span className="rounded-full bg-cyan-200 px-3 py-1 text-sm font-black text-slate-950">Live graph</span>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-2">
                  {["Wallets", "Proofs", "XP"].map((item) => (
                    <div key={item} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-cyan-200">{item}</p>
                      <p className="mt-1 text-sm font-black text-white">{item === "XP" ? "128K" : item === "Proofs" ? "9.4K" : "2.8K"}</p>
                    </div>
                  ))}
                </div>
                <div className="questora-network-panel mt-6 rounded-2xl border border-cyan-200/20 bg-[#020b1b] p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-blue-100">Contributor signal</p>
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-200">Verified</span>
                  </div>
                  <p className="mt-2 text-5xl font-black">128,400</p>
                  <div className="mt-5 grid gap-2">
                    {[82, 64, 92, 48].map((width, index) => (
                      <div key={width} className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="questora-signal-bar h-full rounded-full bg-cyan-200"
                          style={{ width: `${width}%`, animationDelay: `${index * -0.7}s` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    ["Onchain Sprint", "+320 XP"],
                    ["Social Signal", "42 proofs"],
                    ["Builder Path", "18 qualified"],
                    ["Whitelist", "CSV ready"]
                  ].map(([item, value]) => (
                    <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-cyan-200">{value}</p>
                      <p className="mt-4 text-sm font-semibold">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className="rounded-lg border border-white/10 bg-[#0b1730]/90 p-6 shadow-glow">
              <Icon className="text-cyan-200" size={28} />
              <h2 className="mt-5 text-xl font-bold text-white">{feature.title}</h2>
              <p className="mt-3 leading-7 text-blue-100">{feature.body}</p>
            </article>
          );
        })}
      </section>

      <section className="border-t border-white/10 bg-[#061022]/70">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-semibold text-cyan-200">More than simple quests</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">Turn participation into useful project decisions</h2>
            <p className="mt-4 leading-7 text-blue-100">
              Questora helps teams qualify members for whitelists, early access, rewards, beta programs, and contributor recognition.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((useCase) => {
              const Icon = useCase.icon;
              return (
                <article key={useCase.title} className="rounded-lg border border-white/10 bg-white/10 p-5">
                  <Icon className="text-cyan-200" size={24} />
                  <h3 className="mt-4 text-lg font-black text-white">{useCase.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-blue-100">{useCase.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
