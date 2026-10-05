# Mobile app (Capacitor)

[Capacitor](https://capacitorjs.com) wraps the storefront in native iOS and Android shells. It is installed and both
platform projects exist (`android/`, `ios/`), but nothing has been built or submitted anywhere yet.

## How it works here

The storefront renders on the server (Server Components, Server Actions, cookie sessions), so it cannot be exported as
static files and bundled into the app. Instead the app is a thin native shell whose web view **loads the live site**
(`server.url` in `capacitor.config.ts`, from `CAPACITOR_SERVER_URL`, default `https://www.worldwidevapor.com`). That means:

- Site changes ship instantly to the app; there is nothing to rebuild for content, pricing or checkout fixes.
- The app needs a connection. When the site can't be reached it shows `capacitor-www/offline.html`.
- `capacitor-www/` is not your site; it only holds that offline page and a splash that Capacitor requires.

| File                  | What it is                                                                      |
| --------------------- | ------------------------------------------------------------------------------- |
| `capacitor.config.ts` | App id (`com.worldwidevapor.app`), name, the URL to load, navigation allow-list |
| `capacitor-www/`      | Offline page + required `index.html`                                            |
| `android/`, `ios/`    | Generated native projects (commit them; edit icons/splash/permissions in them)  |

## Day to day

```bash
pnpm cap:sync            # app → production URL (also after changing capacitor.config.ts or adding a plugin)
pnpm cap:sync:emulator   # app → the dev server on this computer, as seen from the Android emulator (http://10.0.2.2:3000)
pnpm cap:android         # open the Android project in Android Studio
pnpm cap:ios             # open the iOS project in Xcode (macOS only)
```

To test against your computer instead of production, run the site (`pnpm dev`), then `pnpm cap:sync:emulator`, then press Run
in Android Studio. For a real phone on the same Wi-Fi use your computer's LAN address instead:
`node scripts/cap-sync.mjs http://192.168.1.20:3000`. These commands work in PowerShell, cmd and bash (a bare
`VAR=value pnpm …` only works in bash). Run `pnpm cap:sync` again to point the app back at production.

## What you still need

- **Android:** Android Studio (+ SDK). `pnpm exec cap doctor` reports Android as healthy on this machine.
- **iOS:** a Mac with Xcode (iOS apps cannot be built on Windows) and an Apple Developer account.
- **Icons and splash screens (Android: done).** `pnpm cap:assets` rebuilds them from the brand badge
  (`public/home/imgHeroLogo.png`) with `scripts/make-app-assets.mjs`: the launcher icons in every density (square-rounded,
  round, and the adaptive-icon foreground on the brand dark `#05030A`), the Android 12+ splash icon, and the splash bitmaps for
  older Android. It also writes `assets/icon-only.png` (1024px) and `assets/play-store-icon.png` (512px) for the store
  listings. Change the badge or the colour and re-run it. iOS icons and splash still have Capacitor's defaults — they need a
  Mac to build anyway, so extend the script (or use `@capacitor/assets`) when you get there. (`@capacitor/assets` 3.0.5 does
  not load on Node 24 here, which is why the script uses the `sharp` that Next.js already installs.)
- A signing key (Android) / provisioning profile (iOS) before any release build.

## Troubleshooting

- **"The project is using an incompatible version (AGP 8.13.0) of the Android Gradle plugin"** — Android Studio only syncs
  projects whose Android Gradle Plugin it supports. Narwhal 2025.1.2 supports up to 8.12.1, so `android/build.gradle` pins
  8.12.1 (Capacitor 8's template ships 8.13.0). After updating Android Studio to Narwhal 3 (2025.1.3) or newer you can raise
  it back to 8.13.0. Either way, File → Sync Project with Gradle Files afterwards.
- **Gradle can't find the SDK** — `android/local.properties` (git-ignored, machine-specific) must contain `sdk.dir=…` pointing
  at Android Studio's SDK (here `C:\Users\shawn\AppData\Local\Android\Sdk`; Capacitor 8 builds against Android 36).
- **The app is blank or shows the offline page in the emulator** — the dev server isn't reachable at `http://10.0.2.2:3000`;
  start `pnpm dev` and run `pnpm cap:sync:emulator` again.

## Read this before investing more time: store policy

Apps that sell or promote tobacco and vaping products are restricted or prohibited by both major stores (Apple's App Review
Guidelines list apps that facilitate the sale of tobacco/vape products as not permitted, and Google Play restricts them
similarly — check each store's current policy text). A wrapper around a vape store is also at risk under Apple's
"minimum functionality" rule for apps that are just a website in a shell. Expect store review to reject the app as it stands.

Options that don't depend on the stores:

- **Installable web app (PWA):** add a manifest and service worker so shoppers can "Add to Home Screen" from the browser.
  No review, no signing, works on iOS and Android. This is usually the better fit for this product.
- **Direct Android install:** distribute the signed APK from your own site. Android allows this; iOS does not.
- **Private/internal builds** (TestFlight, Android internal testing) for staff and wholesale partners.

If you proceed with a store submission anyway, ask the store's reviewers/support in advance whether your category and
licensing (age verification, Canadian tobacco/vaping regulation) can be approved.

## Things that matter in the web view

- The site-wide age gate and any site password work as in a browser, but cookies live inside the app's web view, so shoppers
  verify age once per install.
- Card payments: Accept.js and Stripe load fine. Redirect-based flows (3-D Secure, PayPal) need their host in
  `server.allowNavigation`; add hosts there if a payment redirect opens in the system browser instead of the app.
- Apple Pay / Google Pay buttons depend on the web view and the payment provider's domain verification; test them on a device.
