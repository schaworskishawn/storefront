# Worldwide AI on phones

The Worldwide AI OS desktop (`/worldwide-ai/desktop`) is a page of the site, so it runs in any browser. On a phone, below
600px wide, its two windows become tabs: Home on the dock shows the Command Center, the chat button shows Nexus.

## Installable web app

`public/worldwide-ai/manifest.webmanifest`, linked from `src/app/(workspace)/layout.tsx`: Chrome on Android offers
"Install app", Safari "Add to Home Screen". It opens the desktop in its own window with the W icon. No store, no APK.

## Android app (`worldwide-ai-android/`)

A Capacitor app of its own, `com.worldwidevapor.ai` ("Worldwide AI"), separate from the store app in `android/`. It loads
the live desktop (`capacitor.config.ts`); it holds no account or keys. Its user-agent marker `WorldwideAIApp` keeps the
store's bottom tab bar out of it (`src/lib/native-app.ts`).

```bash
pnpm worldwide-ai:android:sync
```

```bash
pnpm worldwide-ai:android:build
```

The APK lands in `worldwide-ai-android/android/app/build/outputs/apk/debug/app-debug.apk`. Install it on a phone with
"install unknown apps" allowed, or open `worldwide-ai-android/android` in Android Studio and press Run. To try it against
a preview on this computer in the emulator: `node scripts/worldwide-ai-android.mjs sync http://10.0.2.2:3200/worldwide-ai/desktop`,
then build; sync again without an address before building for a phone. Icons: `pnpm worldwide-ai:icons`.

The build needs Android Studio's SDK with API 36 and a working Java 17+. On this computer Android Studio's bundled Java is
incomplete (`jbr\lib\jvm.cfg` missing), so the script falls back to the JetBrains Runtime 21 in `~/.jdks`.

## When the desktop doesn't open

Capacitor's own handling shows `www/offline.html` whenever the desktop doesn't load: when the phone can't reach the site,
and also when the site answers with an error status (`onReceivedHttpError` in its `BridgeWebViewClient`). So 1.0 said
"check your signal" over the site's own "not found", error or security-check page. Since 1.1 the app's `MainActivity`
replaces that client: an answer from the site, even an error, is shown as sent, and the error page appears only when no
page arrived at all. It then names what went wrong and where (for example
`net::ERR_NAME_NOT_RESOLVED · www.worldwidevapor.com/worldwide-ai/desktop`, the path only, never the query), and checks
whether worldwidevapor.com answers: "Can't reach Worldwide AI" (no connection) or "That page didn't load" (the site is up).

Capacitor serves the error page only at exactly its address (`isErrorUrl` in `WebViewLocalServer`), so the details can't
go in a query or after `#`: the app hands them to the page once it has loaded (`window.showDetail`).

## Tested 2026-11-08

- Emulator "Medium Phone API 36", against the local preview with demonstration data: the desktop renders in the phone
  layout, an agent's page opens, the store's tab bar stays out, and the launcher shows "Worldwide AI" with the W icon.
- The live build opens the site password screen: the site password is on in production, and the workspace isn't switched
  on there yet (no database or owner emails in Vercel). Not installed on a real phone by me.
- Debug build only, signed with the debug key; not for Google Play, whose rules on vape businesses make a listing unlikely.
- 1.0.1 in the emulator: a live address answering 404 shows "didn't open"; airplane mode shows "can't reach"; the live
  desktop address reaches the site password screen.

## Tested 2026-11-09 (1.1)

Emulator "Medium Phone API 36", the build for the live site:

- The live desktop address opens the site password page.
- A live address answering 404 shows the site's own "404 This page could not be found." (1.0 and 1.0.1 covered it with
  the error page).
- An address that doesn't resolve shows "That page didn't load" with `net::ERR_NAME_NOT_RESOLVED` and the address without
  its query.
- Airplane mode shows "Can't reach Worldwide AI" with `net::ERR_ADDRESS_UNREACHABLE`.
- Not tested: past the site password and sign-in (I don't enter passwords on the live site); a real phone.
