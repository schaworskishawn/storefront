#!/usr/bin/env node
/**
 * The Worldwide AI Android app (worldwide-ai-android/): point it at an address, and build it.
 *
 *   node scripts/worldwide-ai-android.mjs sync                 # the live desktop (capacitor.config.ts)
 *   node scripts/worldwide-ai-android.mjs sync <url>           # another address, e.g. the emulator and a preview here:
 *                                                              #   http://10.0.2.2:3200/worldwide-ai/desktop
 *   node scripts/worldwide-ai-android.mjs build [--offline]    # a debug APK of whatever was synced last
 *
 * Works the same in PowerShell, cmd and bash. The address ends up in the Android project's capacitor.config.json, so sync
 * again without one before building the APK you put on a phone. Building needs Android Studio's SDK with Android 16
 * (API 36) and its Java; this picks the SDK from worldwide-ai-android/android/local.properties, then ANDROID_HOME, then
 * Android Studio's default place, whichever has API 36. See docs/worldwide-ai-android.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "worldwide-ai-android");
const project = join(app, "android");
const [command, url] = process.argv.slice(2);

function run(executable, args, options) {
	const result = spawnSync(executable, args, {
		stdio: "inherit",
		shell: process.platform === "win32",
		...options,
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}

if (command === "sync") {
	const env = { ...process.env };
	if (url) {
		let address;
		try {
			address = new URL(url);
		} catch {
			address = null;
		}
		if (!address || !/^https?:$/.test(address.protocol)) {
			console.error(`"${url}" is not an address. Example: http://10.0.2.2:3200/worldwide-ai/desktop`);
			process.exit(1);
		}
		env.WORLDWIDE_AI_APP_URL = address.toString();
		console.log(`Pointing Worldwide AI at ${address}`);
	} else {
		delete env.WORLDWIDE_AI_APP_URL;
		console.log("Pointing Worldwide AI at the live desktop in capacitor.config.ts");
	}
	run(process.execPath, [join(root, "node_modules/@capacitor/cli/bin/capacitor"), "sync", "android"], {
		cwd: app,
		env,
		shell: false,
	});
} else if (command === "build") {
	const hasApi36 = (sdk) => Boolean(sdk) && existsSync(join(sdk, "platforms", "android-36"));
	const properties = join(project, "local.properties");
	const fromProperties = existsSync(properties)
		? readFileSync(properties, "utf8")
				.match(/^sdk\.dir=(.*)$/m)?.[1]
				?.replace(/\\\\/g, "\\")
				.replace(/\\:/g, ":")
				.trim()
		: undefined;
	const studioDefault =
		process.platform === "win32"
			? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk")
			: process.platform === "darwin"
				? join(homedir(), "Library", "Android", "sdk")
				: join(homedir(), "Android", "Sdk");
	const sdk = [fromProperties, process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, studioDefault].find(
		hasApi36,
	);
	if (!sdk) {
		console.error(
			"No Android SDK with Android 16 (API 36) found. Install it in Android Studio: Settings, Android SDK.",
		);
		process.exit(1);
	}
	// A Java that is really there: JAVA_HOME, Android Studio's own, then the ones Android Studio downloads (~/.jdks). An
	// Android Studio update can leave its bundled Java without lib/jvm.cfg, and every Gradle run then fails at once.
	const isJava = (home) =>
		Boolean(home) &&
		existsSync(join(home, "lib", "jvm.cfg")) &&
		existsSync(join(home, "bin", process.platform === "win32" ? "java.exe" : "java"));
	const downloaded = join(homedir(), ".jdks");
	const studioJava =
		process.platform === "win32"
			? join(process.env.ProgramFiles ?? "C:\\Program Files", "Android", "Android Studio", "jbr")
			: undefined;
	const java = [
		process.env.JAVA_HOME,
		studioJava,
		...(existsSync(downloaded)
			? readdirSync(downloaded)
					.sort()
					.reverse()
					.map((name) => join(downloaded, name))
			: []),
	].find(isJava);
	if (!java) {
		console.error(
			"No working Java 17 or newer found. Set JAVA_HOME, or download one in Android Studio (Gradle JDK).",
		);
		process.exit(1);
	}
	console.log(`Building with the SDK at ${sdk} and the Java at ${java}`);
	// By its full path: Windows doesn't always look in the current folder for a program (NoDefaultCurrentDirectoryInExePath).
	const gradle =
		process.platform === "win32" ? `"${join(project, "gradlew.bat")}"` : join(project, "gradlew");
	// Anything after "build" goes to Gradle, e.g. --offline to use only what is already downloaded.
	run(gradle, ["assembleDebug", ...process.argv.slice(3)], {
		cwd: project,
		env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: java },
	});
	console.log(`Built ${join(project, "app", "build", "outputs", "apk", "debug", "app-debug.apk")}`);
} else {
	console.error("Use: node scripts/worldwide-ai-android.mjs sync [url] | build");
	process.exit(1);
}
