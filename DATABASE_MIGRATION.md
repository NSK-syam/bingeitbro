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
