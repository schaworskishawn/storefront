---
name: atlas-knowledge-control
description: "Review the approved-knowledge library: what is approved and current, what is stale, expired, duplicated or waiting for approval, and which topics have no approved source. Use it to keep the library trustworthy."
---

# Atlas knowledge control

## Use this when

- The library needs a review before agents rely on it.
- A topic must be confirmed as covered by an approved document.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Collection (required)
- Topics that should be covered

## Procedure

1. List every document with its status, current version, owner, review date and expiry.
2. Flag versions waiting for the owner's approval, documents past review, and documents that have expired.
3. Flag documents that appear to duplicate each other by title and collection.
4. For each topic you name, state whether an approved, current document covers it.
5. Report gaps as gaps. Do not propose text to fill them.

## What you produce

- A stored KnowledgeReviewPackage record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Only approved, current versions are counted as usable sources.
- An expired document is never listed as covering a topic.
- Atlas approves nothing: approval is the owner's.

## When something goes wrong

- If the library is empty, say so. That is the finding.

## Example

**Request:** "Atlas: review knowledge sources."

**Result:** A knowledge review package is stored listing every document's status and version, conflicts between documents, uncovered topics, and a proposed action for each problem.

## Limits

- It proposes. Approving, rejecting or retiring a document version stays a separate decision by the owner on the Knowledge page.
- Organizes and proposes. Approval of a document version is a separate decision by the owner.
- The figures and findings are calculated by code from what is supplied. No model writes them.
