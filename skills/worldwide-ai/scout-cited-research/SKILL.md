---
name: scout-cited-research
description: "Answer one bounded question from the source documents supplied, claim by claim with citations and dates, showing where sources disagree. Use it for a research brief from documents you provide."
---

# Scout cited research

## Use this when

- A bounded question needs answering from supplied documents.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Question (required)
- Source documents (required)

## Procedure

1. Read the question and each supplied source with its date.
2. Answer claim by claim, citing the source for each.
3. Show where sources disagree.
4. Note sources with no date.
5. State what the sources don't establish.

## What you produce

- A stored ResearchBrief record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every citation is to a supplied source.
- The result says it reviewed supplied documents, not the web.
- Contradictions are preserved.

## When something goes wrong

- If the sources don't answer the question, say so instead of answering from general knowledge.

## Example

**Request:** "Scout: prepare cited research brief."

**Result:** A research brief draft is stored with an answer, each claim tied to its sources and their dates, conflicts between sources, and what the sources leave open, waiting for a person's review.

## Limits

- It reviews the documents supplied. It is not a fresh web search and says so, and its brief is evidence for review, never approved knowledge.
- Briefs from supplied sources. Never presents that as a fresh web search or as approved policy.
- No web retrieval is connected. Research is proposed evidence until reviewed into the knowledge library.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
