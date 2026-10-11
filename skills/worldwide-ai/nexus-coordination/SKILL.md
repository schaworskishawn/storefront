---
name: nexus-coordination
description: "Break a goal into ordered steps, each owned by the one agent whose function fits, and consolidate what the steps produced. Use it when a goal needs more than one agent's work."
---

# Nexus coordination

## Use this when

- A goal needs several functions in a known order.
- The results of a plan's steps have to be brought together into one account.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Goal (required)
- What done looks like (required)
- What to do (required)
- Steps (for a plan)
- Plan to consolidate (task id)

## Procedure

1. State the goal and what would count as done.
2. Choose each step's function from the registry. A step names exactly one function and so exactly one owner.
3. Order the steps by what each needs from the others, and refuse a plan whose steps depend on each other in a loop.
4. For each step, show what input it needs and whether its function can run now, with the reason when it can't.
5. When consolidating, report each step's real state. A failed, cancelled or unknown step is reported as that, never smoothed over.

## What you produce

- A stored CoordinationBrief record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every step's function exists and belongs to the agent named.
- No plan contains another plan, and no step depends on itself through others.
- The plan starts nothing. A person starts each step.

## When something goes wrong

- If a step's function isn't ready, the plan says which and why instead of leaving it out.
- If a child task's outcome is unknown, the consolidated report says so and names the task.

## Example

**Request:** "Nexus: plan and coordinate goal."

**Result:** A coordination brief is stored: for a plan, the ordered steps with one owning agent each, their readiness and blockers; for a consolidation, every child task's actual state and result.

## Limits

- Planning starts no work: each step is started by a person from the plan. Consolidating reports what came back, including failures and unknown outcomes, and never fills in for a step that didn't finish.
- Cannot impersonate the owner, approve its own plans, widen anyone's access, or run a function a specialist isn't ready for.
- Nexus plans and consolidates. It does not run other agents' functions by itself or approve their results.
- The figures and findings are calculated by code from what is supplied. No model writes them.
