import Image from "next/image";
import Link from "next/link";
import { FOOTER_COLUMNS } from "@/lib/data";

const SOCIALS = [
  { name: "Instagram", icon: "/images/icons/instagram.svg", href: "#" },
  { name: "Facebook", icon: "/images/icons/facebook.svg", href: "#" },
  { name: "YouTube", icon: "/images/icons/youtube.svg", href: "#" },
];

export default function Footer() {
  return (
    <footer className="bg-black-880 w-full">
      <div className="flex flex-col lg:flex-row gap-[32px] lg:gap-[50px] items-start px-[16px] py-[32px] md:px-[32px] lg:px-[80px] lg:py-[64px]">
        <div className="relative size-[160px] shrink-0">
          <Image src="/images/brand/hero-logo.png" alt="Worldwide Vapor" fill className="object-cover" />
        </div>

        <div className="flex gap-[40px] flex-wrap flex-1">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-[12px]">
              <p className="font-comic text-[12px] text-text-accent-bright tracking-[2px]">
                {column.title}
              </p>
              {column.links.map((link) => (
                <Link
                  key={link}
                  href="#"
                  className="font-comic text-[13px] text-footer-muted hover:text-white transition-colors"
                >
                  {link}
                </Link>
              ))}
            </div>
          ))}

          <div className="flex flex-col gap-[12px]">
            <p className="font-comic text-[12px] text-text-accent-bright tracking-[2px]">CONTACT</p>
            <p className="font-comic text-[13px] text-footer-muted w-[188px]">
              support@worldwidevapor.com
            </p>
            <p className="font-comic text-[13px] text-footer-muted">Worldwide Shipping</p>
          </div>
        </div>

        <div className="flex flex-col gap-[16px] items-end w-full lg:w-[250px]">
          <p className="font-comic text-[12px] text-text-accent-bright tracking-[2px]">FOLLOW</p>
          <div className="flex gap-[12px] items-center">
            {SOCIALS.map((social) => (
              <a
                key={social.name}
                href={social.href}
                aria-label={social.name}
                className="bg-control-bg-default border border-text-accent-bright rounded-full flex items-center justify-center size-[40px] hover:bg-text-accent-bright/10 transition-colors"
              >
                <div className="relative size-[18px]">
                  <Image src={social.icon} alt="" fill />
                </div>
              </a>
            ))}
            <a
              href="#"
              aria-label="WhatsApp"
              className="relative size-[40px] hover:opacity-80 transition-opacity"
            >
              <Image src="/images/icons/whatsapp.svg" alt="" fill />
            </a>
          </div>
        </div>
      </div>

      <div className="bg-black-890 flex flex-col sm:flex-row items-center justify-between gap-[8px] px-[16px] py-[16px] md:px-[32px] lg:px-[80px] text-[11px] text-footer-muted text-center sm:text-left">
        <p>© {new Date().getFullYear()} Worldwide Vapor. All rights reserved.</p>
        <p>Privacy · Terms · Accessibility</p>
      </div>
    </footer>
  );
}
