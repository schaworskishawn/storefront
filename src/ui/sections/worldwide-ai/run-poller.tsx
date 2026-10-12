"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IDLE } from "@/lib/worldwide-ai/web/action-state";
import type { FormAction } from "./forms";

/**
 * Checks on a coding run while its page is open. Each check asks the server to take the run as far as it can go, then
 * re-reads the page. Looking at a page never moves a run by itself: this component does it on purpose, on a timer, and
 * stops when the page is closed. Nothing else moves a run: there is no schedule behind it.
 */
export function RunPoller({
	action,
	jobId,
	seconds = 15,
}: {
	action: FormAction;
	jobId: string;
	seconds?: number;
}) {
	const router = useRouter();
	const [note, setNote] = useState<string | null>(null);
	useEffect(() => {
		let closed = false;
		let busy = false;
		const check = async () => {
			if (busy || closed) return;
			busy = true;
			try {
				const form = new FormData();
				form.set("intent", "run.advance");
				form.set("jobId", jobId);
				const state = await action(IDLE, form);
				if (closed) return;
				setNote(state.message ?? null);
				router.refresh();
			} catch {
				if (!closed) setNote("The last check didn't get through. It will be tried again.");
			} finally {
				busy = false;
			}
		};
		const timer = setInterval(check, seconds * 1000);
		return () => {
			closed = true;
			clearInterval(timer);
		};
	}, [action, jobId, seconds, router]);
	return (
		<p className="wai-muted wai-small" role="status">
			This page checks on the run every {seconds} seconds while it is open. The agent keeps working if you
			leave, but its change is collected and checked only from this page, and the machine is thrown away
			shortly after the agent’s time limit. Leave it closed past that and the run ends with no change.
			{note ? ` Last check: ${note}` : ""}
		</p>
	);
}
