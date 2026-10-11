---
name: ledger-workpapers
description: "Classify a period's transactions against the chart of accounts and total them exactly, keeping each currency separate. Use it to prepare a period's accounting workpaper for review."
---

# Ledger workpapers

## Use this when

- A period's transactions need classifying and totalling for review.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Entity (required)
- Period (YYYY-MM) (required)
- Currency (required)
- Chart of accounts (required)
- Transactions (required)

## Procedure

1. Read the transactions and the chart of accounts, and reject rows with a missing amount, date or currency.
2. Keep any account already recorded on a transaction.
3. Propose an account for the rest only where a keyword rule you supplied matches, and mark it as proposed.
4. Leave everything else unclassified. Do not guess an account.
5. Total by account and by currency in exact decimals, without converting between currencies.

## What you produce

- A stored AccountingWorkpaper record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Recorded, proposed and unclassified lines are shown apart.
- Each total equals the sum of its lines, per currency.
- Nothing is posted to any accounting system.

## When something goes wrong

- If a transaction names an account that isn't in the chart, it is reported rather than accepted.

## Example

**Request:** "Ledger: prepare accounting workpaper."

**Result:** An accounting workpaper is stored with every transaction's account and the basis for it, exact totals per account, proposed entries, and the transactions that could not be classified.

## Limits

- No entry is posted and no money moves. Proposals come only from the keywords you supply; a transaction no rule matches stays unclassified.
- Prepares workpapers and proposed entries. Never posts an entry or moves money.
- The figures and findings are calculated by code from what is supplied. No model writes them.
