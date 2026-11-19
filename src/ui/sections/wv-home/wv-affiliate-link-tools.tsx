"use client";

import {
	ClipboardPaste,
	Download,
	MousePointerClick,
	Package,
	Search,
	Tags,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { searchLinkProductsAction, type LinkProduct } from "@/app/(root)/account/affiliate/actions";
import { QUICK_DESTINATIONS, destinationFromInput } from "@/lib/affiliates/link-tools";
import { qrMatrix, qrSvg, type QrStyle } from "@/lib/affiliates/qr";
import { normalizeCampaign, referralLink } from "@/lib/affiliates/referral";
import { CopyButton } from "./wv-copy-button";

/**
 * The affiliate dashboard's referral tools, in one builder: where the link lands (a quick pick, a product found by
 * search, or any page of the shop pasted in), an optional campaign tag (reported per tag on the dashboard), the finished
 * link to copy, and its QR code, neon or classic, to download as PNG or SVG. Everything but the product search happens
 * in the browser.
 */

const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const chip = `${orbitron} wv-calc-chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] tracking-[0.5px]`;
const input = `${orbitron} wv-acct-field h-10 w-full min-w-0 rounded-lg px-3 text-[13px] text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const action = `${orbitron} wv-review-btn flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] disabled:opacity-60`;

type Tab = "quick" | "product" | "paste";
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
	{ id: "quick", label: "QUICK PICK", Icon: MousePointerClick },
	{ id: "product", label: "A PRODUCT", Icon: Package },
	{ id: "paste", label: "PASTE A LINK", Icon: ClipboardPaste },
];

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<h3
				className={`${orbitron} flex items-center gap-2 text-[11px] tracking-[1px] text-[var(--wv-text-dim)]`}
			>
				<span
					aria-hidden
					className={`${heyComic} wv-neon-card-icon flex size-6 items-center justify-center rounded-full text-[11px] text-white`}
				>
					{n}
				</span>
				{title}
			</h3>
			{children}
		</section>
	);
}

function download(name: string, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Draws the SVG onto a canvas at full size and saves it as a PNG. */
async function downloadPng(name: string, svg: string, size: number) {
	const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
	try {
		const img = new window.Image(size, size);
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("The QR code couldn't be drawn."));
			img.src = url;
		});
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		canvas.getContext("2d")?.drawImage(img, 0, 0, size, size);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
		if (blob) download(name, blob);
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function AffiliateLinkTools({
	code,
	origin,
	suggestions,
}: {
	code: string;
	origin: string;
	suggestions: string[];
}) {
	const [tab, setTab] = useState<Tab>("quick");
	const [quick, setQuick] = useState<string>(QUICK_DESTINATIONS[0].id);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<LinkProduct[] | null>(null);
	const [searchMessage, setSearchMessage] = useState<string | null>(null);
	const [product, setProduct] = useState<LinkProduct | null>(null);
	const [searching, startSearch] = useTransition();
	const [pasted, setPasted] = useState("");
	const [tagInput, setTagInput] = useState("");
	const [style, setStyle] = useState<QrStyle>("neon");

	const destination = useMemo((): { ok: true; path: string } | { ok: false; message: string } => {
		if (tab === "quick") {
			const pick = QUICK_DESTINATIONS.find((d) => d.id === quick) ?? QUICK_DESTINATIONS[0];
			return { ok: true, path: pick.path };
		}
		if (tab === "product")
			return product
				? { ok: true, path: `/product/${encodeURIComponent(product.slug)}` }
				: { ok: false, message: "Search for a product and pick it." };
		return destinationFromInput(pasted, origin);
	}, [tab, quick, product, pasted, origin]);

	const tag = normalizeCampaign(tagInput);
	const tagError = tagInput.trim() !== "" && !tag;
	const link = destination.ok ? referralLink(origin, code, destination.path, tag) : null;
	const svg = useMemo(() => (link ? qrSvg(qrMatrix(link), style, 1024) : null), [link, style]);
	const fileName = `worldwide-vapor-${code}${tag ? `-${tag}` : ""}-qr`;

	const search = (event: FormEvent) => {
		event.preventDefault();
		startSearch(async () => {
			const result = await searchLinkProductsAction(query);
			if (!result.ok) {
				setResults(null);
				setSearchMessage(result.message);
				return;
			}
			setResults(result.products);
			setSearchMessage(result.products.length === 0 ? "No products match that. Try another word." : null);
		});
	};

	return (
		<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-8">
			<div className="flex min-w-0 flex-col gap-6">
				<Step n={1} title="WHERE SHOULD IT LAND?">
					<div role="group" aria-label="Where the link goes" className="flex flex-wrap gap-2">
						{TABS.map(({ id, label, Icon }) => (
							<button
								key={id}
								type="button"
								aria-pressed={tab === id}
								onClick={() => setTab(id)}
								className={chip}
							>
								<Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
								{label}
							</button>
						))}
					</div>

					{tab === "quick" && (
						<div role="group" aria-label="Pages" className="flex flex-wrap gap-2">
							{QUICK_DESTINATIONS.map((d) => (
								<button
									key={d.id}
									type="button"
									aria-pressed={quick === d.id}
									onClick={() => setQuick(d.id)}
									className={chip}
								>
									{d.label}
								</button>
							))}
						</div>
					)}

					{tab === "product" && (
						<div className="flex flex-col gap-3">
							<form onSubmit={search} className="flex gap-2">
								<label className="sr-only" htmlFor="wv-link-product">
									Product name
								</label>
								<input
									id="wv-link-product"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Search products, e.g. blue razz"
									className={input}
									autoComplete="off"
								/>
								<button type="submit" disabled={searching} className={action}>
									<Search aria-hidden className="size-3.5" strokeWidth={2.5} />
									{searching ? "…" : "SEARCH"}
								</button>
							</form>
							{searchMessage && (
								<p role="status" className={`${orbitron} text-xs text-[var(--wv-text-dim)]`}>
									{searchMessage}
								</p>
							)}
							{results && results.length > 0 && (
								<ul className="grid gap-2 sm:grid-cols-2">
									{results.map((p) => (
										<li key={p.slug}>
											<button
												type="button"
												aria-pressed={product?.slug === p.slug}
												onClick={() => setProduct(p)}
												className={`${chip} w-full justify-start rounded-xl px-2 py-2 text-left normal-case`}
											>
												<span className="relative flex size-10 shrink-0 overflow-hidden rounded-lg bg-[var(--wv-deep)]">
													{p.image ? (
														<Image src={p.image} alt="" fill sizes="40px" className="object-contain p-0.5" />
													) : (
														<Package
															aria-hidden
															className="absolute inset-0 m-auto size-5 text-[var(--wv-text-dim)]"
															strokeWidth={2}
														/>
													)}
												</span>
												<span className="line-clamp-2 min-w-0">{p.name}</span>
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{tab === "paste" && (
						<div className="flex flex-col gap-2">
							<label className="sr-only" htmlFor="wv-link-paste">
								A link to a page of the shop
							</label>
							<input
								id="wv-link-paste"
								value={pasted}
								onChange={(e) => setPasted(e.target.value)}
								placeholder={`${origin.replace(/^https?:\/\//, "")}/product/…`}
								className={input}
								autoComplete="off"
								spellCheck={false}
								inputMode="url"
							/>
							<p className={`${orbitron} text-xs text-[var(--wv-text-dim)]`}>
								Open any page of the shop, copy the address and paste it here.
							</p>
						</div>
					)}

					{!destination.ok && (tab !== "paste" || pasted.trim() !== "") && (
						<p role="status" className={`${orbitron} text-xs text-[var(--wv-pink)]`}>
							{destination.message}
						</p>
					)}
				</Step>

				<Step n={2} title="CAMPAIGN TAG (OPTIONAL)">
					<label className="sr-only" htmlFor="wv-link-tag">
						Campaign tag
					</label>
					<input
						id="wv-link-tag"
						value={tagInput}
						onChange={(e) => setTagInput(e.target.value)}
						placeholder="e.g. instagram, tiktok-review, bio"
						maxLength={40}
						className={input}
						autoComplete="off"
						aria-invalid={tagError}
						aria-describedby="wv-link-tag-help"
					/>
					<div role="group" aria-label="Tag suggestions" className="flex flex-wrap gap-2">
						{suggestions.map((s) => (
							<button
								key={s}
								type="button"
								aria-pressed={tag === s}
								onClick={() => setTagInput(tag === s ? "" : s)}
								className={chip}
							>
								<Tags aria-hidden className="size-3" strokeWidth={2.5} />
								{s}
							</button>
						))}
					</div>
					<p
						id="wv-link-tag-help"
						className={`${orbitron} text-xs ${tagError ? "text-[var(--wv-pink)]" : "text-[var(--wv-text-dim)]"}`}
					>
						{tagError
							? "Use letters, numbers, dashes and underscores (up to 32), starting with a letter or number."
							: "Name where you'll post it. Orders through the link are reported under the tag in Campaigns below."}
					</p>
				</Step>

				<Step n={3} title="YOUR LINK">
					<div className="wv-af-link flex flex-col gap-3 rounded-xl p-3 md:flex-row md:items-center">
						<code className={`${orbitron} min-w-0 flex-1 break-all text-[13px] text-white`}>
							{link ?? "Choose where it should land first."}
						</code>
						{link && <CopyButton text={link} label="COPY LINK" />}
					</div>
				</Step>
			</div>

			<Step n={4} title="QR CODE">
				<div className="flex flex-col gap-3">
					<div className="wv-af-qr mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl p-3">
						{svg ? (
							<Image
								src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
								alt={`QR code that opens ${link}`}
								width={1024}
								height={1024}
								unoptimized
								className="size-full"
							/>
						) : (
							<p
								className={`${orbitron} flex size-full items-center justify-center text-center text-xs text-[var(--wv-text-dim)]`}
							>
								Your QR code appears here.
							</p>
						)}
					</div>
					<div role="group" aria-label="QR code style" className="flex justify-center gap-2">
						{(["neon", "classic"] as const).map((s) => (
							<button
								key={s}
								type="button"
								aria-pressed={style === s}
								onClick={() => setStyle(s)}
								className={chip}
							>
								{s === "neon" ? "NEON" : "CLASSIC"}
							</button>
						))}
					</div>
					<div className="flex justify-center gap-2">
						<button
							type="button"
							disabled={!svg}
							onClick={() => svg && void downloadPng(`${fileName}.png`, svg, 1024)}
							className={action}
						>
							<Download aria-hidden className="size-3.5" strokeWidth={2.5} />
							PNG
						</button>
						<button
							type="button"
							disabled={!svg}
							onClick={() => svg && download(`${fileName}.svg`, new Blob([svg], { type: "image/svg+xml" }))}
							className={action}
						>
							<Download aria-hidden className="size-3.5" strokeWidth={2.5} />
							SVG
						</button>
					</div>
					<p className={`${orbitron} text-center text-xs leading-5 text-[var(--wv-text-dim)]`}>
						Neon for posts and screens, classic for print. Both scan with any phone camera.
					</p>
				</div>
			</Step>
		</div>
	);
}
