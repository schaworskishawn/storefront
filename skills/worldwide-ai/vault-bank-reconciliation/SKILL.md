---
name: vault-bank-reconciliation
description: "Match bank deposits to processor settlements on exact net amount within a date tolerance, and leave real ambiguity for a person. Use it to reconcile a period's deposits."
---

# Vault bank reconciliation

## Use this when

- Bank deposits need matching to processor settlements for a period.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Currency (required)
- Days a deposit may trail its settlement
- Bank lines (required)
- Processor settlements (required)

## Procedure

1. Read deposits and settlements with their amounts, currencies, dates and references.
2. Match only on exact net amount in the same currency, with the deposit dated on or after the settlement and within the tolerance.
3. Where more than one candidate fits, let a shared reference decide.
4. Where it still can't be decided, leave the item ambiguous with its candidates listed.
5. Total matched and unmatched amounts by currency.

## What you produce

- A stored SettlementReconciliation record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- No approximate, cross-currency or backdated match is made.
- Ambiguous items are left for a person.
- No money is moved and no banking detail is changed.

## When something goes wrong

- If a deposit has no candidate, it is listed as unmatched with the reason.

## Example

**Request:** "Vault: reconcile settlements."

**Result:** A settlement reconciliation is stored with the matched pairs and their ids, ambiguous and unmatched items on both sides, fee checks, and exact totals.

## Limits

- Amounts must match exactly; nothing is matched 'approximately'. No bank access is used or changed and no money moves.
- Reports matches and differences. Never moves funds or changes banking credentials.
- The figures and findings are calculated by code from what is supplied. No model writes them.
