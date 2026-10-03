"use server";

import { cookies } from "next/headers";
import {
	SITE_ACCESS_COOKIE,
	SITE_ACCESS_MAX_AGE,
	type UnlockState,
	checkSitePassword,
	getSitePassword,
	safeSiteNextPath,
	sitePasswordToken,
} from "@/lib/site-password";

/** Checks the entered site password; on success sets the access cookie and sends the visitor on to where they were going. */
export async function unlockSite(_previous: UnlockState, formData: FormData): Promise<UnlockState> {
	const password = String(formData.get("password") ?? "");
	const next = safeSiteNextPath(String(formData.get("next") ?? ""));
	const configured = getSitePassword();

	if (!configured || !(await checkSitePassword(password))) {
		// A short pause makes password guessing slow without needing any shared state.
		await new Promise((resolve) => setTimeout(resolve, 600));
		return { error: "That password isn't right. Please try again." };
	}

	(await cookies()).set(SITE_ACCESS_COOKIE, await sitePasswordToken(configured), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: SITE_ACCESS_MAX_AGE,
	});
	// Not `redirect(next)`: that is a soft navigation, which leaves the address bar on `next` when the age gate then
	// redirects. The form does a full page load to this path instead, like the age gate's own "Enter Site".
	return { error: null, redirectTo: next };
}
