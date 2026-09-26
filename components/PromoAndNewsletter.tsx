import Image from "next/image";
import Button from "./Button";

export function PromoBundles() {
  return (
    <section className="flex gap-[24px] items-center p-[16px] py-[32px] w-full flex-col md:p-[32px] lg:gap-[48px] lg:p-[80px] lg:flex-row">
      <div className="flex flex-1 flex-col gap-[16px] items-start lg:gap-[24px]">
        <h2 className="font-comic text-[28px] text-white leading-tight md:text-[36px] lg:text-[44px]">
          PROMOTIONAL BUNDLES
        </h2>
        <p className="font-mono text-[14px] leading-[1.6] text-control-border-inactive max-w-full lg:text-[16px] lg:max-w-[540px]">
          Save big with our curated bundle deals. Mix and match your favorite disposables,
          hardware kits, and accessories at exclusive wholesale pricing. Bundle more, save more.
        </p>
        <Button variant="outline-cyan" className="w-full sm:w-[144px]">
          SHOP BUNDLES
        </Button>
      </div>
      <div className="relative h-[200px] w-full max-w-[540px] rounded-[16px] border border-border-purple overflow-hidden md:h-[280px] lg:h-[360px]">
        <Image src="/images/promo/bundle-promo.png" alt="Bundle promotion" fill className="object-cover" />
      </div>
    </section>
  );
}

export function Newsletter() {
  return (
    <section className="bg-bg-surface border-y border-border-purple flex flex-col gap-[24px] items-center p-[24px] w-full md:p-[32px] lg:gap-[32px] lg:p-[80px]">
      <div className="flex flex-col gap-[12px] items-center text-center">
        <p className="font-mono font-black text-[22px] text-white lg:text-[28px]">STAY UPDATED</p>
        <p className="text-[13px] text-control-border-inactive lg:text-[14px]">
          Get the latest deals, new products, and updates directly to your warehouse registry.
        </p>
      </div>
      <form className="flex gap-[12px] items-center flex-col sm:flex-row w-full max-w-[560px]">
        <input
          type="email"
          placeholder="Enter your email address"
          className="bg-control-bg-default border border-text-accent-bright rounded-[12px] h-[48px] px-[16px] w-full sm:w-[400px] text-[13px] text-control-border-inactive placeholder:text-control-border-inactive focus:outline-none focus:ring-1 focus:ring-text-accent-bright"
        />
        <button
          type="submit"
          className="bg-text-accent-bright rounded-[12px] h-[42px] px-[24px] font-mono font-bold text-[14px] tracking-[1px] text-control-bg-default whitespace-nowrap hover:opacity-90 transition-opacity w-full sm:w-auto"
        >
          SUBSCRIBE
        </button>
      </form>
    </section>
  );
}
