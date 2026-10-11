import Link from "next/link";
import type { ReactNode } from "react";
import { ROLES } from "@/lib/worldwide-ai/agents/registry";
import { primaryFunctionOf } from "@/lib/worldwide-ai/functions/registry";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { navCounts } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { Launcher, MobileNav, SideNav } from "./nav";
import "./worldwide-ai.css";

/**
 * The frame around every workspace page: the application list, the command bar, who is signed in, and a banner whenever the
 * demonstration store is in use. It asks who the person is before it renders anything, like every page inside it does.
 */
export async function WorkspaceShell({ children }: { children: ReactNode }) {
	const workspace = await getWorkspace();
	const counts = await navCounts(workspace);
	const agents = ROLES.map((role) => ({
		id: role.id,
		name: role.name,
		title: role.title,
		action: primaryFunctionOf(role.id)?.action ?? "",
	}));
	return (
		<div className="wai-shell">
			<a className="wai-skip" href="#wai-content">
				Skip to the page
			</a>
			<aside className="wai-side">
				<Link href={WORKSPACE_PATH} className="wai-brand">
					WORLDWIDE <span>AI</span>
				</Link>
				<SideNav counts={counts} />
			</aside>
			<div className="wai-main">
				{workspace.demo && (
					<div className="wai-demo" role="status">
						Demonstration store. Every record here is fictional and is lost when the server restarts. Nothing
						on this screen is live business data.
					</div>
				)}
				<div className="wai-top">
					<span className="wai-top-private wai-hide-mobile">Private workspace</span>
					<Launcher agents={agents} />
					<span className="wai-top-spacer" />
					<span className="wai-who">
						<span>{workspace.actor.label}</span>
						<span className="wai-pill">{workspace.isOwner ? "Owner" : "Staff"}</span>
						<Link href="/logout" className="wai-hide-mobile">
							Sign out
						</Link>
					</span>
				</div>
				<main id="wai-content" className="wai-content">
					{children}
				</main>
			</div>
			<MobileNav counts={counts} />
		</div>
	);
}

/** What shows for the moment before the person has been identified. It contains nothing about the workspace. */
export function ShellFallback() {
	return (
		<div className="wai-content" aria-busy="true">
			<p className="wai-muted">Checking who is signed in…</p>
		</div>
	);
}
