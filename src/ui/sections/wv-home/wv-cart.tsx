import Image from "next/image";
import Link from "next/link";
import { buildCheckoutPath } from "@paper/session-bridge";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { type CartCheckout } from "@/lib/cart-checkout";
import { formatPrice } from "@/ui/components/plp/utils";
import { WvFooter, WvHeader } from "./wv-chrome";
import { WvCartClient, type CartLineView } from "./wv-cart-client";
import "./wv-home.css";

/** Worldwide Vapor cart — Figma "6.08 - High Fidelity - Cart" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

export function WvCart({
	channel,
	localeBcp47,
	checkout,
	freeShippingThreshold,
	recommended,
}: {
	channel: string;
	localeBcp47: string;
	checkout: CartCheckout | null;
	freeShippingThreshold: number | null;
	recommended: HomeProduct[];
}) {
	const lines: CartLineView[] = (checkout?.lines ?? []).map((l) => {
		const product = l.variant.product;
		const productName = product.translation?.name || product.name;
		const variantName = l.variant.translation?.name || l.variant.name;
		return {
			id: l.id,
			slug: product.slug,
			name: productName,
			variantName:
				variantName && variantName !== l.variant.id && variantName !== productName ? variantName : null,
			image: product.thumbnail?.url
				? { url: product.thumbnail.url, alt: product.thumbnail.alt || product.name }
				: null,
			unit: l.variant.pricing?.price?.gross.amount ?? l.totalPrice.gross.amount / Math.max(1, l.quantity),
			total: l.totalPrice.gross.amount,
			quantity: l.quantity,
		};
	});
	const currency = checkout?.totalPrice.gross.currency ?? recommended[0]?.currency ?? "USD";

	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			{lines.length > 0 && checkout ? (
				<WvCartClient
					channel={channel}
					currency={currency}
					localeBcp47={localeBcp47}
					lines={lines}
					subtotal={checkout.totalPrice.gross.amount}
					freeShippingThreshold={freeShippingThreshold}
					checkoutHref={buildCheckoutPath({ checkoutId: checkout.id, step: "contact" })}
				/>
			) : (
				<section className="flex flex-col items-center gap-5 px-4 py-24 text-center">
					<h1 className={`${heyComic} text-3xl`}>
						YOUR CART <span className="text-[var(--wv-cyan-soft)]">(0 ITEMS)</span>
					</h1>
					<p className={`${orbitron} text-sm text-[var(--q-text-dim)]`}>
						Your cart is empty. Find something you like!
					</p>
					<Link
						href="/shop"
						className="flex min-h-12 items-center rounded-md bg-[var(--wv-cyan-soft)] px-8 font-[family-name:var(--font-inter)] text-[13px] font-bold tracking-[1.5px] text-[var(--wv-ink)]"
					>
						SHOP ALL PRODUCTS
					</Link>
				</section>
			)}

			{recommended.length > 0 && (
				<section className="flex flex-col gap-6 border-t border-[var(--wv-control)] px-4 pb-16 pt-10 md:px-6 xl:gap-8 xl:px-20 xl:pb-20 xl:pt-[60px]">
					<div className="flex flex-col gap-[6px]">
						<p className={`${orbitron} text-[11px] font-bold tracking-[3px] text-[var(--wv-cyan-soft)]`}>
							RECOMMENDED
						</p>
						<h2 className={`${heyComic} text-[28px] leading-9`}>YOU MAY ALSO LIKE</h2>
					</div>
					<ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:gap-6">
						{recommended.map((p) => (
							<li key={p.id}>
								<Link
									href={`/product/${p.slug}`}
									className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--wv-cyan)] bg-[var(--wv-deep)]"
								>
									<span className="relative block h-[140px] bg-[var(--wv-control)] md:h-[180px] xl:h-[200px]">
										{p.image && (
											<Image
												src={p.image.url}
												alt={p.image.alt}
												fill
												sizes="(min-width: 1280px) 280px, 25vw"
												className="object-contain p-4"
											/>
										)}
									</span>
									<span className={`${bungee} flex flex-1 flex-col gap-3 p-4`}>
										<span className="text-sm uppercase">{p.name}</span>
										<span className="mt-auto text-base text-[var(--wv-cyan-soft)]">
											{formatPrice(p.price, p.currency, localeBcp47)}
										</span>
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
			<WvFooter />
		</div>
	);
}
