---
name: restore-recovery-verification
description: "Compare what must be recoverable with what the backups actually hold, and report the last time a restore was proven. Use it to know whether recovery would work."
---

# Restore recovery verification

## Use this when

- Backup coverage and the last proven restore need reviewing.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Oldest acceptable backup (hours)
- Other things that must be recoverable

## Procedure

1. List every table and stored file that must be recoverable.
2. Read the newest backup's manifest: its age, its tables and its files.
3. Compare the two and list anything not covered.
4. Report the last restore check, when it ran and whether every check passed.
5. List what no backup covers: settings, the worker's own folder, the store.

## What you produce

- A stored RecoveryCoverageReport record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- A backup that ran is not treated as proof that a restore works.
- Coverage is taken from the real manifest.
- With no storage configured, the result says there is nothing to review.

## When something goes wrong

- If there is no backup, say so and what to do first.

## Example

**Request:** "Restore: review recovery coverage."

**Result:** A recovery coverage report is stored with the newest backup's age and coverage, tables and files it misses, when restoration was last proven, each other asset's coverage, and a restore-test plan.

## Limits

- Reading a manifest shows coverage on paper. Only the separate isolated restore check proves a backup restores, and this report says which of the two it found.
- Reviews coverage. A manifest review is never reported as a proven restore.
- The figures and findings are calculated by code from what is supplied. No model writes them.
