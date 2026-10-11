---
name: guard-security-review
description: "Compare access grants with the approved role policy and flag excessive, conflicting, self-granted and unattributed access. Use it for a periodic access review."
---

# Guard security review

## Use this when

- Access grants need comparing with what each role is approved to have.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- System under review (required)
- Approved policy (what each role may hold) (required)
- Current grants (required)

## Procedure

1. Read the grants and the approved policy for each role.
2. Flag any grant beyond the role's policy as excessive.
3. Flag grants a person made to themselves, and grants with no recorded grantor.
4. Report refused access attempts from the workspace's own log.
5. Propose the correction for each finding.

## What you produce

- A stored SecurityReview record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Each finding names the account, the grant and the policy line it breaks.
- Refused attempts come from the real log, not from an assumption.
- No access is granted, removed or changed.

## When something goes wrong

- If a role has no approved policy, its grants are listed as unassessable.

## Example

**Request:** "Guard: review access and security."

**Result:** A security review is stored with each finding's subject, the rule it breaks and a recommended correction, plus the workspace's own access setup and the denied attempts on record.

## Limits

- It recommends. It cannot grant, revoke or change any permission, here or anywhere else, its own included.
- Recommends. Cannot grant, revoke or change any permission, its own included.
- The figures and findings are calculated by code from what is supplied. No model writes them.
