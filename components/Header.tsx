"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { NAV_LINKS } from "@/lib/data";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-black-860 border-b border-text-accent-bright w-full">
      <div className="flex items-center justify-between px-[16px] py-[12px] md:px-[14px] md:py-[7px]">
        <div className="flex items-center gap-[23px]">
          <div className="relative h-[45px] w-[100px] md:h-[71px] md:w-[142px]">
            <Image
              src="/images/brand/logo-mark.png"
              alt="Worldwide Vapor"
              fill
              className="object-contain"
              priority
            />
          </div>
          <nav className="hidden md:flex items-center gap-[21px] font-comic text-[13px] text-white tracking-[1px] uppercase">
            {NAV_LINKS.map((link) => (
              <Link
                key={link}
                href={link === "Home" ? "/" : `/${link.toLowerCase()}`}
                className="hover:text-border-accent transition-colors"
              >
                {link}
              </Link>
            ))}
          </nav>
        </div>

        {/* Desktop/tablet utility icons */}
        <div className="hidden md:flex items-center gap-[11px]">
          <IconButton label="Search">⌕</IconButton>
          <IconButton label="Wishlist">♡</IconButton>
          <IconButton label="Account">👤</IconButton>
          <IconButton label="Cart" showDot>
            🛒
          </IconButton>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-[4px] p-[4px] w-[24px]"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="bg-white h-[2px] w-[18px]" />
          <span className="bg-white h-[2px] w-[18px]" />
          <span className="bg-white h-[2px] w-[18px]" />
        </button>
      </div>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <nav className="md:hidden flex flex-col gap-[16px] px-[16px] py-[20px] border-t border-text-accent-bright/30 font-comic text-[14px] text-white tracking-[1px] uppercase">
          {NAV_LINKS.map((link) => (
            <Link
              key={link}
              href={link === "Home" ? "/" : `/${link.toLowerCase()}`}
              onClick={() => setMenuOpen(false)}
              className="hover:text-border-accent transition-colors"
            >
              {link}
            </Link>
          ))}
          <div className="flex items-center gap-[11px] pt-[8px]">
            <IconButton label="Search">⌕</IconButton>
            <IconButton label="Wishlist">♡</IconButton>
            <IconButton label="Account">👤</IconButton>
            <IconButton label="Cart" showDot>
              🛒
            </IconButton>
          </div>
        </nav>
      )}
    </header>
  );
}

function IconButton({
  children,
  label,
  showDot = false,
}: {
  children: React.ReactNode;
  label: string;
  showDot?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className="relative border border-text-accent-bright rounded-[8px] flex items-center justify-center size-[31px] text-[16px] text-white hover:bg-text-accent-bright/10 transition-colors"
    >
      {children}
      {showDot && (
        <span className="absolute right-[7px] top-[7px] size-[8px] rounded-full bg-border-highlight" />
      )}
    </button>
  );
}
