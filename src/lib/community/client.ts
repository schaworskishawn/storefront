import type { ChatMessage, OnlineMember, Role } from "./model";

/** The browser's side of the community API: typed calls that never throw. */

export type ViewerInfo = { memberId: string; name: string | null; role: Role };

export type SessionState =
	| { status: "loading" }
	| { status: "guest" }
	| { status: "unavailable" }
	| { status: "needs-name" | "member"; viewer: ViewerInfo };

export type FeedReply = {
	channel: string;
	cursor: string;
	mode: "none" | "replace" | "append";
	messages: ChatMessage[];
	hasOlder: boolean;
	heads: Record<string, string>;
};

export type OlderReply = { messages: ChatMessage[]; hasOlder: boolean };
export type Roster = { online: OnlineMember[]; total: number };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
	try {
		const response = await fetch(path, {
			method: body === undefined ? "GET" : "POST",
			headers: body === undefined ? undefined : { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
			cache: "no-store",
			credentials: "same-origin",
			signal,
		});
		const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
		if (!response.ok || !payload)
			return {
				ok: false,
				status: response.status,
				message: payload?.message ?? "Something went wrong. Please try again.",
			};
		return { ok: true, data: payload };
	} catch {
		return { ok: false, status: 0, message: "You look to be offline. Check your connection and try again." };
	}
}
