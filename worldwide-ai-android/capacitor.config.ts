import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Worldwide AI for Android: the Worldwide AI OS desktop (/worldwide-ai/desktop) in its own app, separate from the
 * Worldwide Vapor store app in ../android (its own id, name, icon and settings).
 *
 * Like the store app it loads the live site rather than bundled files, because the workspace renders on the server and
 * signs people in with the site's own session. It holds no account and no keys: signing in, and who may use the
 * workspace, stay the site's business. `www/` only holds the page shown when the site can't be reached.
 *
 *   WORLDWIDE_AI_APP_URL   the address the app opens. Defaults to the live desktop. Set it with
 *                          `node scripts/worldwide-ai-android.mjs sync <url>`, e.g. http://10.0.2.2:3200/worldwide-ai/desktop
 *                          for the Android emulator and a preview on this computer; plain http is allowed only then.
 *
 * See docs/worldwide-ai-android.md.
 */
const appUrl = process.env.WORLDWIDE_AI_APP_URL ?? "https://www.worldwidevapor.com/worldwide-ai/desktop";

const config: CapacitorConfig = {
	appId: "com.worldwidevapor.ai",
	appName: "Worldwide AI",
	webDir: "www",
	server: {
		url: appUrl,
		cleartext: appUrl.startsWith("http://"),
		androidScheme: "https",
		errorPath: "offline.html",
		// The site's own host is always allowed inside the app; anything else opens in the phone's browser.
		allowNavigation: ["worldwidevapor.com", "*.worldwidevapor.com"],
	},
	// Matches --wv-bg in src/styles/brand.css, so nothing flashes white while the desktop loads.
	// The marker tells the site this is the Worldwide AI app, not the store app (src/lib/native-app.ts): the store's bottom
	// tab bar stays out of it. It must equal WORLDWIDE_AI_APP_USER_AGENT_MARKER there.
	android: { backgroundColor: "#05030a", appendUserAgent: "WorldwideAIApp" },
	plugins: { SystemBars: { style: "DARK" } },
};

export default config;
