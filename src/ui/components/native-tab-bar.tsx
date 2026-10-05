"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, Package, Store, User, type LucideIcon } from "lucide-react";
import { useWishlist } from "@/lib/wv-wishlist";
import {
	NATIVE_TABS,
	activeNativeTab,
	isAndroidApp,
	shouldShowNativeTabBar,
	type NativeTabKey,
} from "@/lib/native-app";

const ICONS: Record<NativeTabKey, LucideIcon> = {
	home: Home,
	shop: Store,
	wishlist: Heart,
	orders: Package,
	account: User,
};

const subscribeNever = () => () => {};
const readIsAndroidApp = () =>
	isAndroidApp({
		Capacitor: (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor,
		userAgent: navigator.userAgent,
	});
const readIsAndroidAppOnServer = () => false;

/**
 * Bottom tab bar (Home, Shop, Wishlist, Orders, Account) that only exists inside the Android app.
 *
 * It renders nothing on the server and in every browser, so the website is unchanged and pages stay static. Inside the app,
 * `data-native-tabbar` on <html> makes brand.css reserve room under the page so the bar never covers content.
 */
export function NativeTabBar() {
	const inAndroidApp = useSyncExternalStore(subscribeNever, readIsAndroidApp, readIsAndroidAppOnServer);
	const pathname = usePathname() ?? "/";
	const { count: wishlistCount } = useWishlist();

	const visible = inAndroidApp && shouldShowNativeTabBar(pathname);

	useEffect(() => {
		if (!visible) return;
		const root = document.documentElement;
		root.setAttribute("data-native-tabbar", "");
		return () => root.removeAttribute("data-native-tabbar");
	}, [visible]);

	if (!visible) return null;

	const active = activeNativeTab(pathname);

	return (
		<nav
			aria-label="App navigation"
			className="native-tab-bar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--q-border-strong)] bg-[var(--wv-header)]"
		>
			<ul className="mx-auto flex max-w-xl items-stretch">
				{NATIVE_TABS.map((tab) => {
					const Icon = ICONS[tab.key];
					const isActive = tab.key === active;
					const showDot = tab.key === "wishlist" && wishlistCount > 0;

					return (
						<li key={tab.key} className="flex-1">
							<Link
								href={tab.href}
								aria-current={isActive ? "page" : undefined}
								className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-none transition-colors ${
									isActive
										? "text-[var(--wv-pink)]"
										: "text-[var(--wv-text-dim)] active:text-[var(--wv-cyan)]"
								}`}
							>
								{isActive && (
									<span
										aria-hidden
										className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-[var(--wv-pink)]"
									/>
								)}
								<span className="relative">
									<Icon className="size-6" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
									{showDot && (
										<span
											aria-hidden
											className="absolute -right-1 -top-0.5 size-2 rounded-full bg-[var(--wv-pink)] ring-2 ring-[var(--wv-header)]"
										/>
									)}
								</span>
								<span>{tab.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
