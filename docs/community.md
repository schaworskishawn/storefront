# Community (`/community`)

A Discord-style discussion group built into the storefront: channels, a live message feed, who is online, replies, emoji
reactions, @mentions, unread dots, and moderation tools. Anyone can read it; to post, a visitor signs in with their store
account and picks a **nickname** (shown instead of the name on the account, so nothing public points back to the customer).

## Turning it on

Messages need somewhere to live, and the site has no database, so the community uses **Upstash Redis**.

1. In Vercel, open the project, **Storage → Create → Upstash (Redis)**, and connect it to the project (all environments).
   The integration adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you. If you create the database in Upstash's own
   console instead, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (either pair works).
2. Redeploy. The `/community` page, and a **Community** link in the footer's Company column, appear as soon as those
   variables exist. Until then the page is a 404 and the link is hidden, exactly like the rewards page.

To close it without deleting anything, set `COMMUNITY_ENABLED=false` and redeploy. The data stays in Redis.

## Who can moderate

- Any **staff account** in the Saleor Dashboard (Configuration → Staff Members) is **Staff** in the community: a pink badge,
  and the power to moderate anyone except other staff. Sign in to the storefront with that account.
- To make someone a **Mod** (a cyan badge; can moderate ordinary members only) without a Dashboard login, add their account
  email to `COMMUNITY_MODERATOR_EMAILS` (comma-separated) and redeploy.
- Only staff and mods can post in **#rules** and **#announcements**; everyone can read them.

Moderators hover a message (or tap it on a phone) and use the **⋯** menu: **Delete message**, **Time out for 1 hour / 24
hours**, **Remove from community**. A removed member can still read but can't post. Every action is logged in Redis under `wv:chat:modlog` (the last 200, with
the member's name and id). There is no restore button yet: to let someone back in, delete their `wv:chat:ban:<member id>`
key in the Upstash console (Data Browser); a timeout lifts by itself.

## What it costs

Upstash's free plan is enough to start. Each open tab asks Redis one question every 4 seconds while the visitor is active (12
seconds once they have been idle for a minute, and not at all in a hidden tab or after ten idle minutes), and one server
shares its answer between visitors for a second or two. Posting, reacting and the "who's online" list add a few commands each.
Rough sizing: one person reading for an hour is under 1,000 commands. If the free plan's monthly limit is reached, the feed
shows "Reconnecting…" until it resets or you move to a paid plan; nothing else on the site is affected.

## Rules the server enforces

Not just the page: these are checked on the server for every request.

- Posting needs a signed-in account with a nickname; reading doesn't.
- Nicknames: 3 to 20 characters, letters/numbers/spaces/`._-`, unique ignoring case, no web addresses, and no names that read as
  the team ("admin", "staff", "support", "official", "worldwide vapor"…), which only staff and mods may use. Changeable once an hour.
- Messages: 1 to 500 characters, at most two links, no repeating your last message, at least 1.5 seconds apart, at most 12 a minute.
  Staff and mods are exempt from the rate limits.
- Timed-out and removed members are refused with a clear message.
- State-changing requests must come from this site (Origin check) and carry the store's sign-in cookie.
- Message text is only ever rendered as text, with a small allowlist (bold, italic, code, links, @mentions), never as HTML.

## Channels and rules text

They live in code, in `src/lib/community/channels.ts`: add or rename a channel there (never rename one that already has
messages: its id is part of the Redis keys). The house rules in the same file are what #rules shows. Edit them there.

## How it works (for developers)

- **Storage.** One Redis stream per channel (the newest ~1,000 messages are kept), plus small keys for members, nicknames,
  reactions, presence, timeouts and rate limits. The key layout is documented at the top of `src/lib/community/store.ts`, and
  every rule above lives in that file, so the API routes (`src/app/api/community/*`) stay thin.
- **Identity.** A signed-in store account maps to a random public _member id_ kept in Redis; the Saleor user id and email never
  appear in a message or in the online list.
- **Live feel.** The page polls `GET /api/community/feed` with a cursor ("newest message id | change counter"). With nothing new
  it costs one Redis command; new messages send only what came after the last one the visitor has; a reaction or removal bumps
  the counter, so the latest page is sent again and the change shows up. The feed never calls Saleor.
- **Local testing without Upstash.** `src/lib/community/fake-redis.test-util.ts` is an in-memory Redis the tests use. The
  Upstash REST protocol is small (`POST /` with a command array, `POST /pipeline` with several), so a local stand-in is a
  few lines if you want to run the page against fake data.
