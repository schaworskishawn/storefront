"use client";

/** Something failed while a page was loading. The details stay in the server log; the person gets a plain way forward. */
export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<div className="wai-content" role="alert">
			<h1 className="wai-h1">This page couldn’t be loaded</h1>
			<p className="wai-lead">
				Nothing was changed. The database or the store’s sign-in service may be unreachable. Try again; if it
				keeps happening, the reason is in the server log.
			</p>
			<p>
				<button type="button" className="wai-btn" onClick={reset}>
					Try again
				</button>
			</p>
		</div>
	);
}
