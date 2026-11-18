import { NextRequest } from "next/server";
import { EMAILS_APP_PERMISSIONS } from "@/lib/account-emails/manifest";
import { registerApp } from "@/lib/saleor-app/register";

/**
 * Saleor calls this once while the emails app is being installed. See `@/lib/saleor-app/register` for what is checked.
 * The emails app never calls Saleor, so it needs no token at all: nothing to create or set afterwards.
 */
export async function POST(request: NextRequest) {
	// Without both permissions Saleor wouldn't deliver the customer and staff account events.
	return registerApp(request, { required: EMAILS_APP_PERMISSIONS });
}
