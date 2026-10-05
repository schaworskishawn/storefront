import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native iOS/Android shell around the deployed storefront.
 *
 * This storefront renders on the server (Server Components, Server Actions, cookie sessions), so it cannot be bundled into the
 * app as static files. The shell therefore loads the live site from `CAPACITOR_SERVER_URL`; `webDir` only holds the small
 * offline page shown when the site cannot be reached (see `server.errorPath`).
 *
 *   CAPACITOR_SERVER_URL   the site the app opens. Defaults to production. Don't set it by hand: use `pnpm cap:sync:emulator`
 *                          (Android emulator → this computer) or `node scripts/cap-sync.mjs <url>`; cleartext is allowed
 *                          automatically for http.
 *
 * After changing this file run `pnpm cap:sync`. See docs/mobile-app.md for the full workflow and store-policy notes.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "https://www.worldwidevapor.com";

const config: CapacitorConfig = {
	appId: "com.worldwidevapor.app",
	appName: "Worldwide Vapor",
	webDir: "capacitor-www",
	server: {
		url: serverUrl,
		cleartext: serverUrl.startsWith("http://"),
		androidScheme: "https",
		errorPath: "offline.html",
		// Hosts the app may navigate to *inside* the app (everything else opens in the system browser). The site's own host is
		// always allowed; these cover card-payment redirects (e.g. 3-D Secure) and the Saleor API.
		allowNavigation: [
			"worldwidevapor.com",
			"*.worldwidevapor.com",
			"*.saleor.cloud",
			"*.authorize.net",
			"*.stripe.com",
		],
	},
	// Matches --wv-bg so there is no white flash while the site loads.
	ios: { backgroundColor: "#05030a", contentInset: "automatic" },
	// The marker lets the site recognise the Android app and show its bottom tab bar there only. It must equal
	// NATIVE_APP_USER_AGENT_MARKER in src/lib/native-app.ts (inlined: the Capacitor CLI can't resolve this repo's imports).
	android: { backgroundColor: "#05030a", appendUserAgent: "WorldwideVaporApp" },
	// Light status/navigation bar icons on the dark site, whatever the phone's own theme is. The bars' own colour is the
	// window background set in android/app/src/main/res/values/styles.xml.
	plugins: { SystemBars: { style: "DARK" } },
};

export default config;
