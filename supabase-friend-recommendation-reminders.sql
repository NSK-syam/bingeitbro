-- Friend recommendation reminder fields.
-- Run this in Supabase SQL Editor for existing projects.

ALTER TABLE public.friend_recommendations
  ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_friend_recommendations_due
  ON public.friend_recommendations (recipient_id, remind_at)
  WHERE remind_at IS NOT NULL AND reminder_notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_friend_recommendations_email_due
  ON public.friend_recommendations (remind_at)
  WHERE remind_at IS NOT NULL AND reminder_email_sent_at IS NULL;
