-- Production hardening for reminder-heavy traffic.
-- Safe to run multiple times.

-- Watch reminders: active list and due-email scans.
CREATE INDEX IF NOT EXISTS idx_watch_reminders_active_user_remind_at
  ON public.watch_reminders (user_id, remind_at)
  WHERE canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watch_reminders_email_due
  ON public.watch_reminders (remind_at)
  WHERE canceled_at IS NULL AND email_sent_at IS NULL;

-- Friend recommendation reminders: avoid full scans when filtering out watched rows.
CREATE INDEX IF NOT EXISTS idx_friend_recommendations_due_unwatched
  ON public.friend_recommendations (recipient_id, remind_at)
  WHERE remind_at IS NOT NULL
    AND reminder_notified_at IS NULL
    AND COALESCE(is_watched, FALSE) = FALSE;

CREATE INDEX IF NOT EXISTS idx_friend_recommendations_email_due_unwatched
  ON public.friend_recommendations (remind_at, recipient_id)
  WHERE remind_at IS NOT NULL
    AND reminder_email_sent_at IS NULL
    AND COALESCE(is_watched, FALSE) = FALSE;

-- Helpful for timeline-like queries sorted by newest first.
CREATE INDEX IF NOT EXISTS idx_friend_recommendations_recipient_created
  ON public.friend_recommendations (recipient_id, created_at DESC);
