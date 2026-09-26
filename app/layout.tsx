import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Worldwide Vapor",
  description: "Retail | Wholesale | Distribution prices",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        The design uses Bungee, Permanent Marker, Orbitron, and a custom
        "Hey Comic" face. Bungee/Permanent Marker/Orbitron are on Google
        Fonts -- add them via next/font in a follow-up pass. "Hey Comic"
        looks like a licensed/custom font; source its files and add an
        @font-face in globals.css, or swap the `comic` token in
        tailwind.config.ts for a stand-in until you have it.
      */}
      <body className="bg-[#05030a] antialiased">{children}</body>
    </html>
  );
}
