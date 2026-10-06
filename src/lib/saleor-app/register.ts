/**
 * Saleor calls an app's `tokenTargetUrl` once while the app is being installed, handing over its API token. Both of this
 * storefront's apps (payments and rewards) answer it the same way, so the logic lives here.
 *
 * What it does: confirms the call comes from our own Saleor (by the `saleor-api-url` header) and acknowledges it. Neither app
 * keeps the token (you create one in the Dashboard and set it in the environment), so there is nothing to store.
 *
 * It also asks Saleor which permissions the new token carries, to catch an install that was approved without them. That
 * question is advisory: at install time Saleor often can't answer it yet (the new token isn't usable until the install
 * finishes), and refusing the install on a missing answer made both apps fail with "App internal error (400)". So the
 * install is only refused when Saleor *does* answer and a required permission is not in the list.
 *
 * Errors use `{ error: { message } }`, the shape Saleor reads to show the reason in the Dashboard.
 */

type RegisterOptions = {
	/** Permissions the app cannot work without. */
	required: readonly string[];
	/** The Saleor GraphQL URL; defaults to NEXT_PUBLIC_SALEOR_API_URL. */
	apiUrl?: string;
	fetchImpl?: typeof fetch;
	warn?: (message: string) => void;
};

const trimSlashes = (url: string | null | undefined) => url?.replace(/\/+$/, "");

const refuse = (message: string, status: number) => Response.json({ error: { message } }, { status });

/** The permission codes Saleor reports for this token, or null when it gave no usable answer. */
async function grantedPermissions(
	apiUrl: string,
	token: string,
	fetchImpl: typeof fetch,
): Promise<string[] | null> {
	try {
		const res = await fetchImpl(apiUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ query: "{ app { permissions { code } } }" }),
			cache: "no-store",
		});
		const body = (await res.json().catch(() => null)) as {
			data?: { app?: { permissions?: Array<{ code?: string }> | null } | null } | null;
		} | null;
		const permissions = body?.data?.app?.permissions;
		return Array.isArray(permissions)
			? permissions.map((permission) => permission.code).filter((code): code is string => Boolean(code))
			: null;
	} catch {
		return null;
	}
}

export async function registerApp(request: Request, options: RegisterOptions): Promise<Response> {
	const warn = options.warn ?? ((message: string) => console.warn(message));
	const expectedApiUrl = trimSlashes(options.apiUrl ?? process.env.NEXT_PUBLIC_SALEOR_API_URL);
	const requestApiUrl = trimSlashes(request.headers.get("saleor-api-url"));
	if (!expectedApiUrl || requestApiUrl !== expectedApiUrl) return refuse("Unknown Saleor instance", 403);

	const body = (await request.json().catch(() => null)) as { auth_token?: unknown } | null;
	const token = typeof body?.auth_token === "string" ? body.auth_token : null;
	if (!token) return refuse("Missing auth_token", 400);

	const granted = await grantedPermissions(expectedApiUrl, token, options.fetchImpl ?? fetch);
	if (granted === null) {
		warn(
			"[saleor-app] couldn't confirm the new app's permissions during install; accepting the install anyway.",
		);
	} else {
		const missing = options.required.filter((permission) => !granted.includes(permission));
		if (missing.length > 0) return refuse(`The app was not granted ${missing.join(", ")}`, 400);
	}

	return Response.json({ success: true });
}
