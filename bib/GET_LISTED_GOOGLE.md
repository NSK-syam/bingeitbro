# Get bingeitbro.com on Google Search

Your site is **allowed to be indexed** (robots.txt and sitemap are set). Google just needs to discover and index it. Follow these steps:

## 1. Add your site to Google Search Console

1. Go to **[Google Search Console](https://search.google.com/search-console)** and sign in with your Google account.
2. Click **“Add property”**.
3. Choose **“URL prefix”** and enter: `https://bingeitbro.com`
4. Verify ownership using one of the options (e.g. **HTML tag** in your site’s `<head>`, or **DNS** if you use a custom domain). Next.js can add a meta tag if you add the verification value to your layout.

## 2. Submit your sitemap

1. In Search Console, open your property **bingeitbro.com**.
2. In the left menu, go to **“Sitemaps”**.
3. Under “Add a new sitemap”, enter: `sitemap.xml`
4. Click **“Submit”**.

Google will start crawling your site using the sitemap.

## 3. Request indexing for the homepage

1. In Search Console, use the **URL Inspection** tool (search bar at the top).
2. Enter: `https://bingeitbro.com`
3. Click **“Request indexing”** so Google prioritizes crawling the homepage.

## 4. Wait and check

- **Indexing** often happens within a few days after the first crawl.
- **Ranking** for “bingeitbro” or “binge it bro” can take longer; new sites usually need some time and links.
- Re-check in a week under **“Pages”** in Search Console to see how many URLs are indexed.

## Optional: Verification meta tag (if you choose HTML tag method)

If Google gives you a meta tag like `<meta name="google-site-verification" content="xxxxx" />`, you can add it in `src/app/layout.tsx` in the `<head>` (e.g. via the `metadata` export or a custom `<head>`). If you need this, add the content value and we can wire it in.
