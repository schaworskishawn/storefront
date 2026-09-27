"use server";

import { revalidatePath } from "next/cache";
import {
	createAddress,
	deleteAddress,
	setDefaultAddress,
	updateAddress,
} from "@/app/(storefront)/[locale]/[channel]/(main)/account/actions";
import type { AccountActionResult } from "@/ui/components/account/account-action-result";

type Result = { ok: true } | { ok: false; error: string };

/** Wrappers over the account address actions that also refresh the root-level /addresses page. */
async function refreshed(run: () => Promise<AccountActionResult>): Promise<Result> {
	const r = await run();
	if (r.success) {
		revalidatePath("/addresses");
		return { ok: true };
	}
	return {
		ok: false,
		error: "error" in r ? r.error : "We could not save that change. Please check the details and try again.",
	};
}

export async function createAddressAction(fd: FormData): Promise<Result> {
	return refreshed(() => createAddress(fd));
}
export async function updateAddressAction(fd: FormData): Promise<Result> {
	return refreshed(() => updateAddress(fd));
}
export async function deleteAddressAction(fd: FormData): Promise<Result> {
	return refreshed(() => deleteAddress(fd));
}
export async function setDefaultAddressAction(fd: FormData): Promise<Result> {
	return refreshed(() => setDefaultAddress(fd));
}
