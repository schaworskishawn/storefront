# How to add or edit Learn articles

Every `.md` file in this folder (except ones starting with `_`) becomes an article on
**/learn** and gets its own page at **/learn/<file-name>**.

## 1. Create a file

Copy an existing article, rename it (the file name becomes the URL, use lowercase and dashes):

    content/learn/my-new-article.md   ->   /learn/my-new-article

## 2. Fill in the top block (between the `---` lines)

    ---
    title: My New Article            # required
    category: GUIDES                 # required. Any of: GUIDES, REVIEWS, NEWS, TIPS & TRICKS, PRODUCTS, LIFESTYLE, BEGINNERS (or your own)
    date: 2025-06-01                 # required, YYYY-MM-DD (newest first)
    excerpt: One or two sentences shown on the cards.   # optional (defaults to the first paragraph)
    image: /learn/my-photo.jpg       # optional. Put the file in public/learn/ (no image = placeholder tile)
    imageAlt: Describe the photo     # optional but recommended
    featured: true                   # optional. Only one article should be featured; otherwise the newest is used
    draft: true                      # optional. Hidden everywhere until you remove this line
    ---

## 3. Write the article below the top block using Markdown

    ## A heading
    Normal paragraph with **bold**, *italic*, `code` and [a link](https://example.com).

    - bullet
    - list

    1. numbered
    2. list

    > A quote or callout

    ![Photo description](/learn/another-photo.jpg)

Save the file — the new article shows up on /learn and its page appears at /learn/<file-name>.
"Similar articles" at the bottom of each article are picked automatically (same category first).

## Removing an article

Delete the file, or add `draft: true` to hide it.
