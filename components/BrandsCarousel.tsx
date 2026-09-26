"use client";

import Image from "next/image";
import { useRef } from "react";
import { BRANDS } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function BrandsCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (amount: number) => {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <section className="bg-bg-deep border-y border-border-purple flex flex-col gap-[24px] items-center pt-[24px] pb-[28px] px-[16px] md:px-[32px] lg:min-h-[250px] lg:pt-[28px] lg:pb-[32px] lg:px-[80px] w-full">
      <SectionHeading eyebrow="Official Partners" title="OUR BRANDS" underlineWidth={60} />

      {/* Mobile/tablet: static grid */}
      <div className="grid grid-cols-2 gap-[12px] w-full max-w-[704px] md:grid-cols-3 md:gap-[16px] lg:hidden">
        {BRANDS.map((brand) => (
          <div
            key={brand.id}
            className="border border-text-accent-bright rounded-[12px] flex items-center justify-center h-[70px] p-[12px] md:h-[85px]"
          >
            <div className="relative h-full w-full">
              <Image src={brand.logo} alt={brand.name} fill className="object-cover rounded-[8px]" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: scrollable carousel with nav arrows */}
      <div className="relative hidden lg:flex items-center gap-[20px] w-full">
        <button
          aria-label="Scroll left"
          onClick={() => scrollBy(-200)}
          className="shrink-0 bg-bg-deep border border-text-accent-bright rounded-full size-[36px] flex items-center justify-center hover:bg-text-accent-bright/10 transition-colors"
        >
          ‹
        </button>
        <div ref={scrollerRef} className="flex gap-[20px] items-center overflow-x-auto scroll-smooth">
          {BRANDS.map((brand) => (
            <div
              key={brand.id}
              className="shrink-0 border border-text-accent-bright rounded-[12px] flex items-center justify-center h-[64px] w-[160px] p-[12px]"
            >
              <div className="relative h-full w-full">
                <Image src={brand.logo} alt={brand.name} fill className="object-cover rounded-[8px]" />
              </div>
            </div>
          ))}
        </div>
        <button
          aria-label="Scroll right"
          onClick={() => scrollBy(200)}
          className="shrink-0 bg-bg-deep border border-text-accent-bright rounded-full size-[36px] flex items-center justify-center hover:bg-text-accent-bright/10 transition-colors"
        >
          ›
        </button>
      </div>
    </section>
  );
}
