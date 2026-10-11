---
name: patch-diagnostics
description: "Correlate the evidence for a website problem from pasted logs and inspection results, and separate what was observed from what is only plausible. Use it when a page or flow is reported broken."
---

# Patch diagnostics

## Use this when

- A website error is reported and there are logs, timestamps or an inspection to read.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Issue (required)
- Affected page or route
- Release or commit
- What was observed (required)
- Log lines
- Site inspection to attach (task id)

## Procedure

1. Group error lines that differ only in times, ids and numbers, and count each group.
2. Place the first and last occurrence of each group on a timeline with any release times supplied.
3. State whether the problem was reproduced, and by what evidence.
4. Write the smallest-scope hypothesis that explains the observed evidence, labelled as a hypothesis.
5. List how the hypothesis would be confirmed and how a fix would be verified.

## What you produce

- A stored DiagnosticReport record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- An observed cause and a plausible explanation are never worded the same way.
- If the problem wasn't reproduced, the result says so.
- Nothing on the site is changed.

## When something goes wrong

- If the logs contain no error lines, report that instead of inferring a cause.

## Example

**Request:** "Patch: diagnose website issue."

**Result:** A diagnostic report is stored against the issue with grouped error signatures and their counts and times, the files implicated, the reproduction evidence or an explicit gap, and a proposed repair scope.

## Limits

- It reports what the evidence shows. It states no cause that the logs don't show, and it changes no code: a fix is Build's work, after review.
- Diagnoses and proposes. Does not edit code, deploy, or change production settings.
- Works from logs you paste and inspections already run. There is no live log connection.
- The figures and findings are calculated by code from what is supplied. No model writes them.
