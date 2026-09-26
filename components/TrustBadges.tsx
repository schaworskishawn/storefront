import { TRUST_ITEMS } from "@/lib/data";

export default function TrustBadges() {
  return (
    <div className="bg-bg-surface border-y border-border-purple flex flex-col gap-[20px] px-[16px] py-[20px] w-full md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-y-4 md:px-[32px] lg:px-[80px] lg:py-[16px]">
      {TRUST_ITEMS.map((item) => (
        <div key={item.title} className="flex gap-[12px] items-center md:gap-[16px]">
          <span className="text-[20px] md:text-[24px]">{item.icon}</span>
          <div className="flex flex-col gap-[2px]">
            <p className="font-comic text-[13px] text-white md:text-[14px]">{item.title}</p>
            <p className="font-mono text-[11px] text-control-border-inactive md:text-[12px]">{item.subtitle}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
