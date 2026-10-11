/**
 * The shape a form gets back from a server action. This file is imported by browser code, so it holds no server imports.
 */

/** What a form gets back from a server action when it didn't redirect. */
export type ActionState = {
	ok: boolean;
	/** One line for the person: what happened, or why it didn't. */
	message: string;
	/** Each specific problem with what they entered. */
	problems?: string[];
	/** What they typed, handed back so a refused form doesn't lose it. */
	values?: Record<string, string>;
};

export const IDLE: ActionState = { ok: true, message: "" };
