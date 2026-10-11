import Link from "next/link";

/** Shown for an address that doesn't exist here, and to anyone the workspace doesn't exist for. It gives nothing away. */
export default function WorkspaceNotFound() {
	return (
		<div className="wai-content">
			<h1 className="wai-h1">Page not found</h1>
			<p className="wai-lead">There is nothing at this address.</p>
			<p>
				<Link href="/home">Go to the store</Link>
			</p>
		</div>
	);
}
