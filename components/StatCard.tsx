import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
};

export function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-base-blue text-white">
          <Icon size={22} />
        </span>
        <span className="font-semibold text-blue-100">{label}</span>
      </div>
      <p className="mt-5 text-3xl font-black text-white">{value}</p>
    </div>
  );
}
