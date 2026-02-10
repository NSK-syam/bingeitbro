# Deploy bib via GitHub

Deploy automatically on every push by connecting this repo to Vercel.

## 1. Push bib to GitHub

If the project isn’t in its own GitHub repo yet:

```bash
cd "/Users/syam/Movie Recom/bib"

# If this folder isn’t a git repo yet:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on GitHub (github.com/new), then:
git remote add origin https://github.com/YOUR_USERNAME/bib.git
git branch -M main
git push -u origin main
```

If `bib` lives inside a repo like `Movie Recom`, either:

- Push that whole repo to GitHub and import the **root** in Vercel, then set **Root Directory** to `bib`, or  
- Make `bib` its own repo (copy it out, `git init`, add remote, push) and connect that repo in Vercel.

## 2. Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (with GitHub if you like).
2. Click **Add New…** → **Project**.
3. **Import** your GitHub repo (e.g. `bib` or `Movie Recom`).
4. If the repo root is not the app:
   - Set **Root Directory** to `bib` and confirm.
5. Add **Environment Variables** if the app needs them (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in **Project Settings → Environment Variables**.
6. Click **Deploy**.

## 3. After that

- Every push to the connected branch (e.g. `main`) will trigger a new deployment.
- Preview URLs are created for other branches and pull requests.
- Production URL is in the Vercel project dashboard (e.g. `bib.vercel.app` or your custom domain).

## Optional: Vercel CLI link

To link this folder to an existing Vercel project (and set which repo it uses):

```bash
cd "/Users/syam/Movie Recom/bib"
npx vercel link
```

Then choose the right Vercel account and project; future deploys from the CLI or from GitHub will use that project.
