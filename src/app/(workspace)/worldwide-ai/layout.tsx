import type { ReactNode } from "react";

/** Server actions started from these pages (a model call, a restore check) may take longer than the default. */
export const maxDuration = 60;

/**
 * Everything under /worldwide-ai. The workspace's pages sit in the (shell) group, inside its frame; the desktop of
 * Worldwide AI OS has a frame of its own. Both check who is signed in before they show anything.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
	return <div className="wai-root">{children}</div>;
}
