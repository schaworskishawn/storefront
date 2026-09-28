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

	widgetPromise = new Promise((resolve, reject) => {
		window.AgeCheckerConfig = {
			key: apiKey,
			autoload: true,
			mode: "manual",
			ignore_fields: true,
			onready: (api?: AgeCheckerWidgetInstanceApi) => {
				resolve(api ?? window.AgeCheckerAPI ?? { show: () => undefined });
			},
			onstatuschanged: (verification: AgeCheckerWidgetVerificationEvent) => {
				currentHandlers.onStatusChanged?.(verification);
			},
			onclosed: (done?: () => void) => {
				currentHandlers.onClosed?.();
				done?.();
			},
		};

		const script = document.createElement("script");
		script.src = WIDGET_SCRIPT_SRC;
		script.crossOrigin = "anonymous";
		script.onerror = () => reject(new Error("Failed to load the AgeChecker.Net verification widget."));
		document.head.appendChild(script);
	});

	return widgetPromise;
}
