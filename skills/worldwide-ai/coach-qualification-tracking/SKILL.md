---
name: coach-qualification-tracking
description: "Check, for the staff and task named, whether each requirement is met by evidence on file: the right procedure version, not expired, and an assessment where one is required. Use it to review training eligibility."
---

# Coach qualification tracking

## Use this when

- Staff eligibility for a task needs checking against training evidence.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Task (required)
- As of
- Staff to check (required)
- Requirements for the task (required)
- Training records on file

## Procedure

1. Read the task's requirements and the evidence on file.
2. Check the evidence is for the current procedure version.
3. Check it hasn't expired.
4. Tell an acknowledgement from an assessment.
5. Mark each requirement met or not, with the reason.

## What you produce

- A stored TrainingEligibilityReview record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- An acknowledgement never counts as a competency assessment.
- Evidence for an old version doesn't meet a requirement.
- Expired evidence doesn't meet a requirement.

## When something goes wrong

- If a requirement names no procedure version, flag it.

## Example

**Request:** "Coach: check training eligibility."

**Result:** A training eligibility review is stored with each person's status per requirement and the reason, who is documented as eligible, and the training or requalification proposed for each gap.

## Limits

- It reports documented eligibility. It grants no qualification, and an acknowledgement that a document was read is never counted as a demonstrated assessment.
- Reports documented eligibility. Grants no qualification; acknowledgement is not competency.
- The figures and findings are calculated by code from what is supplied. No model writes them.
