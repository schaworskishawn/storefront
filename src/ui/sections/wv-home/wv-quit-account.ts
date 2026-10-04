import type { QuitData } from "./wv-quit-model";

/** What the /quit page knows about the visitor's account when it renders (types only, safe for client code). */
export type QuitAccountState =
	| { status: "loading" }
	/** Not signed in: the plan lives in this browser only. */
	| { status: "guest" }
	/** Signed in, or maybe, but the account couldn't be reached just now. */
	| { status: "unavailable" }
	/** Signed in; `plan` is the copy saved on the account, if there is one. */
	| { status: "signedIn"; plan: QuitData | null };

export type SaveQuitResult =
	| { status: "saved" }
	/** The account already held a copy that changed more recently; use it instead. */
	| { status: "newer"; plan: QuitData }
	| { status: "guest" }
	| { status: "error" };

/** Where the account sync stands, for the little note on the page. */
export type SyncState = "idle" | "saving" | "saved" | "error";
