# Owner's bulletin ("From the desk of…")

A small pinned note on the home page with a short message from you and the date it was last updated. It is one Saleor page, so
you change it in the Dashboard like any other content, with no code change or deploy.

Until the page exists the panel simply isn't shown: nothing is made up.

## Set it up (once)

1. In the Saleor Dashboard open **Models** (Content).
2. If you don't have a page type to use, create one first (Models → Model types → Create), for example **Bulletin**. It needs no
   attributes.
3. Create a new model (page) of that type with:
   - **Slug:** `owner-bulletin` (exactly this; it is how the site finds the page).
   - **Title:** who it is from. The note reads "From the desk of **{title}**", so something like `Shawn at Worldwide Vapor`.
   - **Content:** the message. Keep it short: the site shows at most three paragraphs and about 600 characters, and cuts anything
     longer with an ellipsis. Plain paragraphs only; formatting, images and links in the message are not shown.
   - **Visibility:** published. Set the **publication date** to the day you are writing it: that date is what visitors see as
     "Updated …".
4. Save. The home page shows it within a minute or two. (It is instant if the Saleor webhook for page changes, `PAGE_UPDATED` to
   `/api/revalidate`, is set up; see `.env.example`. Without the webhook the site simply re-reads the page about once a minute.)

## Update it

Edit the same page: change the text and set the publication date to today. If you leave the publication date alone, the note shows
the date it was first published, so remember to bump it.

## Take it down

Set the page to hidden (or delete it). The panel disappears.

## Where it lives in the code

- Reads the page: `src/lib/bulletin/get-bulletin.ts` (query: `src/graphql/OwnerBulletin.graphql`; the slug is `BULLETIN_SLUG`).
- Turns it into the note (length limits, the date): `src/lib/bulletin/bulletin.ts`.
- The panel: `src/ui/sections/wv-home/wv-bulletin.tsx`, shown on the home page.
