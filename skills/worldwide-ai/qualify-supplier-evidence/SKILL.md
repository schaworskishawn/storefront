---
name: qualify-supplier-evidence
description: "Assemble a supplier's qualification evidence for one material: which required documents are on file with their versions and expiry, and what is missing. Use it to prepare a supplier package."
---

# Qualify supplier evidence

## Use this when

- A supplier's documents for a material need assembling for review.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Supplier (required)
- Site
- Material (required)
- As of
- Documents required for qualification (required)
- Documents on file
- Quality issues and rejected lots

## Procedure

1. Read the documents required for the material.
2. Match each to what is on file, with version and expiry.
3. Mark each present, expired or missing.
4. List open quality issues supplied.
5. State what a reviewer still needs.

## What you produce

- A stored SupplierQualificationPackage record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- An expired document doesn't count as present.
- Each document shows its version.
- The supplier is not approved.

## When something goes wrong

- If a required document has no expiry recorded where one applies, flag it.

## Example

**Request:** "Qualify: review supplier qualification."

**Result:** A supplier qualification package is stored with each required document's status, version and expiry, the gaps, open quality issues and rejected lots, for an authorized person's decision.

## Limits

- It assembles evidence. It does not approve the supplier, substitute a material, or release anything from quarantine.
- Assembles evidence. Never approves a supplier or releases material from quarantine.
- The figures and findings are calculated by code from what is supplied. No model writes them.
