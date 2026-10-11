---
name: verify-independent-acceptance
description: "Independently re-check another agent's finished task: read the stored result again, recompute its checksums, and re-run that function's own rules. Use it before relying on a result that matters."
---

# Verify independent acceptance

## Use this when

- A finished task's stored result needs an independent check.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Task to verify (task id) (required)
- Acceptance criteria to record as not automatically tested

## Procedure

1. Load the task and its stored result. Refuse Verify's own reports and anyone's personal work.
2. Recompute the result's checksum and compare it with the one recorded when it was stored.
3. Validate the result again against its function's declared format.
4. Re-run the function's own rule checks on the stored result.
5. Report each check as passed or failed with the evidence.

## What you produce

- A stored VerificationReport record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Verify never checks its own work.
- A failed check is reported as failed. Expected values are never changed to make a check pass.
- A task that hasn't finished is refused, not passed.

## When something goes wrong

- If the stored result was altered after it was stored, say exactly which check caught it.

## Example

**Request:** "Verify: verify workflow result."

**Result:** A verification report is stored naming the exact result and checksum that was checked, each check's real pass or fail, and what could not be tested.

## Limits

- It checks records the application holds. It can't re-run a model's judgement or observe anything physical, it never checks its own reports, and it approves nothing.
- Checks other agents' results independently. Never approves its own work or edits the expected result to pass.
- It checks stored results. Reviewing code changes needs Build's coding worker, which isn't built.
- The figures and findings are calculated by code from what is supplied. No model writes them.
