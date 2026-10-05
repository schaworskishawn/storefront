/**
 * Client-side loader for AgeChecker.Net's popup widget script, used only to resolve the
 * `signature` / `photo_id` / `phone_validation` / `sms_sent` statuses that a server-side
 * `/v1/create` call can't finish on its own (see AgeChecker's Server API docs: "you can then show
 * our popup only if a signature, photo ID, or phone validation is required").
 *
 * `mode: "manual"` + no `element` means the widget never auto-attaches to anything on the page —
 * we only ever open it ourselves via `show(uuid)` for a verification we already created
 * server-side, resuming that exact verification rather than starting a new one.
 */

const WIDGET_SCRIPT_SRC = "https://cdn.agechecker.net/static/popup/v1/popup.js";

const WIDGET_READY_TIMEOUT_MS = 15_000;

export type AgeCheckerWidgetVerificationEvent = {
	uuid: string;
	status: "accepted" | "denied" | "signature" | "photo_id" | "pending";
};

export type AgeCheckerWidgetInstanceApi = {
	show: (uuid?: string) => void;
	unbind?: () => void;
};

declare global {
	interface Window {
		AgeCheckerConfig?: Record<string, unknown>;
		AgeCheckerAPI?: AgeCheckerWidgetInstanceApi & {
			createInstance?: (config: Record<string, unknown>) => AgeCheckerWidgetInstanceApi;
		};
	}
}

const hasShow = (value: unknown): value is AgeCheckerWidgetInstanceApi =>
	!!value && typeof (value as { show?: unknown }).show === "function";

/**
 * Finds the object with `show(uuid)` among what the widget hands back. For an autoloaded instance AgeChecker calls
 * `onready({ api })` — an object that *contains* the API — not the API itself, and also sets `window.AgeCheckerAPI`. Taking
 * the argument at face value left us holding `{ api }` with no `show`, so opening the popup threw and the shopper saw
 * "Could not load the verification form" on every attempt. Returns null when no candidate can actually open the popup.
 */
export function resolveAgeCheckerApi(
	readyArgument: unknown,
	globalApi: unknown,
): AgeCheckerWidgetInstanceApi | null {
	const wrapped = (readyArgument as { api?: unknown } | null | undefined)?.api;
	for (const candidate of [wrapped, readyArgument, globalApi]) {
		if (hasShow(candidate)) {
			return candidate;
		}
	}
	return null;
}

let widgetPromise: Promise<AgeCheckerWidgetInstanceApi> | null = null;
let currentHandlers: {
	onStatusChanged?: (event: AgeCheckerWidgetVerificationEvent) => void;
	onClosed?: () => void;
} = {};

/**
 * Injects the widget script (once — subsequent calls reuse the same instance) and resolves with
 * an API object exposing `show(uuid)`. `onStatusChanged`/`onClosed` are (re)attached on every
 * call, so a later verification attempt's callbacks still fire even though the script itself
 * only loads once.
 */
export function loadAgeCheckerWidget(
	apiKey: string,
	handlers: {
		onStatusChanged?: (event: AgeCheckerWidgetVerificationEvent) => void;
		onClosed?: () => void;
	},
): Promise<AgeCheckerWidgetInstanceApi> {
	// Callbacks are read from these mutable refs each time the widget invokes them, so re-calling
	// loadAgeCheckerWidget with fresh handlers (e.g. from a new React render) doesn't require
	// re-injecting the script.
	currentHandlers = handlers;

	if (widgetPromise) {
		return widgetPromise;
	}

	widgetPromise = new Promise<AgeCheckerWidgetInstanceApi>((resolve, reject) => {
		// The widget checks the key (and that this domain is allowed to use it) before it calls onready. If that never
		// happens the shopper would be left staring at nothing, so give up after a while and let "Try again" start over.
		const timer = setTimeout(
			() =>
				reject(
					new Error(
						"The AgeChecker.Net widget did not become ready (check the API key and allowed domains).",
					),
				),
			WIDGET_READY_TIMEOUT_MS,
		);

		window.AgeCheckerConfig = {
			key: apiKey,
			autoload: true,
			mode: "manual",
			ignore_fields: true,
			onready: (readyArgument?: unknown) => {
				clearTimeout(timer);
				const api = resolveAgeCheckerApi(readyArgument, window.AgeCheckerAPI);
				if (api) {
					resolve(api);
				} else {
					reject(new Error("The AgeChecker.Net widget loaded but did not provide a way to open the popup."));
				}
			},
			onstatuschanged: (verification: AgeCheckerWidgetVerificationEvent) => {
				currentHandlers.onStatusChanged?.(verification);
			},
			onclosed: (done?: () => void) => {
				currentHandlers.onClosed?.();
				done?.();
			},
		};

		// A retry after a failure must not stack a second copy of the widget on top of the first.
		document.querySelectorAll(`script[src="${WIDGET_SCRIPT_SRC}"]`).forEach((existing) => existing.remove());

		const script = document.createElement("script");
		script.src = WIDGET_SCRIPT_SRC;
		script.crossOrigin = "anonymous";
		script.onerror = () => {
			clearTimeout(timer);
			script.remove();
			reject(new Error("Failed to load the AgeChecker.Net verification widget."));
		};
		document.head.appendChild(script);
	});

	// A failed load must not be remembered: "Try again" has to attempt a fresh load instead of replaying the failure.
	widgetPromise.catch(() => {
		widgetPromise = null;
	});

	return widgetPromise;
}
