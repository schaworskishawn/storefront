import Image from "next/image";
import Button from "./Button";

const BACKGROUND_LAYERS = [
  "/images/hero/bg-1-base.png",
  "/images/hero/bg-2-smoke-purple.png",
  "/images/hero/bg-3-smoke-blue.png",
  "/images/hero/bg-4-world-map.png",
  "/images/hero/bg-5-particles.png",
  "/images/hero/bg-6-hud-lines.png",
];

export default function Hero() {
  return (
    <section
      className="relative flex flex-col w-full"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgb(5,3,10) 0%, rgba(20,16,32,0.251) 50%, rgb(5,3,10) 100%)",
      }}
    >
      <div
        className="relative flex flex-col gap-[16px] w-full overflow-hidden
                   px-[16px] py-[20px]
                   md:px-[32px] md:py-[24px]
                   lg:flex-row lg:items-center lg:gap-[40px] lg:pl-[317px] lg:pr-[40px] lg:pt-[65px] lg:pb-[66px] lg:min-h-[231px]"
      >
        {/* Layered background art */}
        <div className="absolute inset-0 overflow-hidden">
          {BACKGROUND_LAYERS.map((src) => (
            <div key={src} className="absolute inset-0 h-full w-full">
              <Image src={src} alt="" fill className="object-cover" priority={src === BACKGROUND_LAYERS[0]} />
            </div>
          ))}
        </div>

        {/* Logo + headline row */}
        <div className="relative flex items-start gap-[12px] w-full md:gap-[16px] lg:contents">
          <div className="relative h-[110px] w-[110px] shrink-0 md:h-[173px] md:w-[180px] lg:absolute lg:h-[219px] lg:w-[227px] lg:left-[56px] lg:top-[3px] pointer-events-none">
            <Image src="/images/brand/hero-logo.png" alt="Worldwide Vapor" fill className="object-contain" />
          </div>

          <div className="relative flex flex-1 flex-col gap-[6px] items-start md:gap-[11px] lg:flex-1 lg:gap-[11px]">
            <h1 className="font-display text-[20px] leading-none tracking-[-0.5px] md:text-[28px] md:tracking-[-1px] lg:text-[34px] lg:tracking-[-1.5px]">
              <span className="text-border-highlight">WORLDWIDE</span>{" "}
              <span className="text-border-accent">VAPOR</span>
            </h1>
            <p className="font-comic text-[10px] text-white tracking-[1px] md:text-[13px] lg:text-[14px]">
              RETAIL | WHOLESALE | DISTRIBUTION PRICES
            </p>
            <p className="font-comic text-[10px] leading-[1.6] text-control-border-inactive max-w-full md:text-[11px] md:max-w-[420px] lg:text-[11px] lg:max-w-[540px]">
              Get direct access to leading hardware, premium disposables, and industry-grade
              distributions. Certified compliance, bulk tier rates, and global standard logistics.
            </p>

            <div className="relative flex flex-col gap-[8px] items-stretch w-full pt-[4px] sm:flex-row sm:items-center lg:w-full lg:gap-[16px]">
              <Button variant="outline-cyan-strong" className="w-full sm:w-[145px] lg:w-[128px]">
                SHOP NOW
              </Button>
              <Button variant="outline-pink-strong" className="w-full sm:w-[257px] lg:w-[218px]">
                BECOME A DISTRIBUTOR
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
