import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces, Inter, Outfit } from "next/font/google";
import localFont from "next/font/local";
import { isEditorialTypography } from "@/config/typography-theme";
import { cn } from "@/lib/utils";

/** Fraunces for Direction A — must be initialized unconditionally (Next.js font loader rule). */
const frauncesDisplay = Fraunces({
	subsets: ["latin"],
	variable: "--font-fraunces",
	display: "swap",
	adjustFontFallback: true,
});

/**
 * Worldwide Vapor brand fonts. Next.js font loaders must be initialized
 * unconditionally at module scope (same rule as `frauncesDisplay` above) —
 * even though only `bungeeDisplay` is wired into `brand.css` by default,
 * all three are always loaded so their CSS variables exist if you want to
 * apply Permanent Marker / Orbitron to specific elements later (e.g. section
 * eyebrows) via a one-off className rather than a global token swap.
 */
const bungeeDisplay = localFont({
	src: "../fonts/Bungee-Regular.ttf",
	weight: "400",
	variable: "--font-bungee",
	display: "swap",
});

const permanentMarkerDisplay = localFont({
	src: "../fonts/PermanentMarker-Regular.ttf",
	weight: "400",
	variable: "--font-permanent-marker",
	display: "swap",
});

const orbitronDisplay = localFont({
	src: "../fonts/Orbitron-Variable.ttf",
	weight: "400 900",
	variable: "--font-orbitron",
	display: "swap",
});

/** Display face for the Learn page design (Figma uses Outfit; body copy uses Geist). */
const outfitDisplay = Outfit({
	subsets: ["latin"],
	weight: ["700", "800"],
	variable: "--font-outfit",
	display: "swap",
});

/** Body/UI face for the Quit program design (Figma uses Inter). */
const interUi = Inter({
	subsets: ["latin"],
	weight: ["400", "700", "800", "900"],
	variable: "--font-inter",
	display: "swap",
});

/** Custom fonts (from the Figma design), all self-hosted in src/fonts. */
const heyComic = localFont({
	src: "../fonts/HeyComic.ttf",
	variable: "--font-hey-comic",
	display: "swap",
});

const retrochips = localFont({
	src: "../fonts/Retrochips.otf",
	variable: "--font-retrochips",
	display: "swap",
});

export type RootHtmlFontProps = {
	lang: string;
	className: string;
	/** Dismiss island may set attrs/styles on `<html>` after click. */
	suppressHydrationWarning: true;
	"data-typography"?: "editorial";
};

/** Shared `<html>` font classes + optional editorial data attribute for all root layouts. */
export function getRootHtmlFontProps(htmlLang: string): RootHtmlFontProps {
	const editorial = isEditorialTypography();

	return {
		lang: htmlLang,
		className: cn(
			GeistSans.variable,
			GeistMono.variable,
			bungeeDisplay.variable,
			permanentMarkerDisplay.variable,
			orbitronDisplay.variable,
			heyComic.variable,
			outfitDisplay.variable,
			interUi.variable,
			retrochips.variable,
			editorial && frauncesDisplay.variable,
			"min-h-dvh",
		),
		suppressHydrationWarning: true,
		...(editorial ? { "data-typography": "editorial" as const } : {}),
	};
}
