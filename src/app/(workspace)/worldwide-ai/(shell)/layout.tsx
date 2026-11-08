import { Suspense, type ReactNode } from "react";
import { ShellFallback, WorkspaceShell } from "@/ui/sections/worldwide-ai/shell";

/**
 * The workspace frame. Who is signed in is read from the session on every request, so everything that depends on it sits
 * inside a Suspense boundary; what shows before that resolves says nothing about the workspace.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
	return (
		<Suspense fallback={<ShellFallback />}>
			<WorkspaceShell>{children}</WorkspaceShell>
		</Suspense>
	);
}
