# 🚀 Database Migration Instructions

## Quick Setup (2 Minutes)

Since Supabase requires 2FA authentication, you'll need to manually run the database migration. Here's how:

### Step 1: Open Supabase SQL Editor

1. Go to: **https://supabase.com/dashboard/project/lixovgnusjbooxskigmd/sql/new**
2. Sign in with your GitHub account (syam31158@gmail.com)
3. Complete the 2FA if prompted

### Step 2: Copy & Run the SQL

1. Open the file: [`supabase-friend-recommendations-schema.sql`](file:///Users/syam/Movie%20Recom/cinema-chudu/supabase-friend-recommendations-schema.sql)
2. **Copy the entire contents** (Cmd+A, Cmd+C)
3. **Paste into the Supabase SQL Editor**
4. Click the **"Run"** button (or press Cmd+Enter)

### Step 3: Verify Success

You should see a success message showing:
- ✅ Table `friend_recommendations` created
- ✅ RLS policies enabled
- ✅ Indexes created
- ✅ View created

---

## What This Migration Does

- **Creates the `friend_recommendations` table** to store movie recommendations between friends
- **Adds security policies** so users can only:
  - Send recommendations to their actual friends
  - View recommendations they sent or received
  - Mark their received recommendations as read
- **Adds performance indexes** for fast queries
- **Creates constraints** to prevent duplicate recommendations

---

## Fix: "Duplicate" when sending a *different* movie to the same friend

If you could only send **one movie per friend** (sending movie B after movie A said "duplicate"), the table was created with unique constraints that treat all TMDB movies as one. Run this **once** in Supabase SQL Editor:

1. Open **Supabase Dashboard → SQL Editor → New query**
2. Copy and run the contents of **`supabase-friend-recommendations-fix-unique.sql`**

That migration drops the old constraints and adds partial unique indexes so:
- You can send **multiple different movies** to the same friend (movie A, movie B, etc.)
- You still **cannot** send the **same** movie twice to the same friend (no spam)

---

## After Migration

Once the SQL runs successfully:
1. ✅ Your code is already deployed to Vercel (auto-deployed from GitHub)
2. ✅ The feature will work immediately on your live site
3. ✅ Users can start sending personalized movie recommendations to friends

---

## Troubleshooting

**If you see an error like "table already exists":**
- The migration already ran successfully! No action needed.

**If you see an error about missing tables:**
- Make sure the `users`, `recommendations`, and `friends` tables exist first.

**If you see RLS policy errors:**
- The policies might already exist. You can safely ignore these.

---

## In-app notifications (optional)

So friends see the recommendation badge update **as soon** as someone sends them a movie (without refreshing):

1. In **Supabase Dashboard** go to **Database → Replication** (or **Realtime**).
2. Ensure the **`friend_recommendations`** table is included in the Realtime publication. If not, run in SQL Editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE friend_recommendations;
```

After this, when the recipient has the app open, they get a live badge update and a short “New movie recommendation from a friend!” toast.

---

## Testing the Feature

After the migration:

1. **Sign in** to your app (https://cinema-chudu.vercel.app)
2. **Add a friend** using the Friends button
3. **Click a movie card** and look for the blue "Send" button
4. **Send a recommendation** with a personal message
5. **Your friend** will see a blue badge (📨) in the header with the count
6. **Click the badge** to view the recommendation!

---

🎬 **That's it! Your friend-to-friend recommendation feature is ready to use!**
