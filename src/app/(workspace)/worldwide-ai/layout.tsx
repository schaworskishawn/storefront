import { Suspense, type ReactNode } from "react";
import { ShellFallback, WorkspaceShell } from "@/ui/sections/worldwide-ai/shell";

/** Server actions started from these pages (a model call, a restore check) may take longer than the default. */
export const maxDuration = 60;

/**
 * The workspace frame. Who is signed in is read from the session on every request, so everything that depends on it sits
 * inside a Suspense boundary; what shows before that resolves says nothing about the workspace.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
	return (
		<div className="wai-root">
			<Suspense fallback={<ShellFallback />}>
				<WorkspaceShell>{children}</WorkspaceShell>
			</Suspense>
		</div>
	);
}
