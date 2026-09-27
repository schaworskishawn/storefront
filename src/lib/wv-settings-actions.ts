"use server";

import { revalidatePath } from "next/cache";
import { changePassword, updateProfile } from "@/app/(storefront)/[locale]/[channel]/(main)/account/actions";
import type { AccountActionResult } from "@/ui/components/account/account-action-result";

type Result = { ok: true } | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
	passwordMinLength: "Your new password must be at least 8 characters.",
	passwordsMismatch: "The new passwords do not match.",
	updateProfileFailed: "We could not update your details. Please try again.",
	changePasswordFailed: "We could not change your password. Check your current password and try again.",
};

async function refreshed(run: () => Promise<AccountActionResult>): Promise<Result> {
	const r = await run();
	if (r.success) {
		revalidatePath("/account-settings");
		revalidatePath("/account");
		return { ok: true };
	}
	return {
		ok: false,
		error: "error" in r ? r.error : (MESSAGES[r.errorKey] ?? "Something went wrong. Please try again."),
	};
}

export async function updateProfileAction(fd: FormData): Promise<Result> {
	return refreshed(() => updateProfile(fd));
}

export async function changePasswordAction(fd: FormData): Promise<Result> {
	return refreshed(() => changePassword(fd));
}
