-- Add support for message replies (quoting previous messages)

-- 1. Add reply_to_id to direct_messages
ALTER TABLE public.direct_messages
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL;

-- 2. Add reply_to_id to watch_group_messages
ALTER TABLE public.watch_group_messages
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.watch_group_messages(id) ON DELETE SET NULL;

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS idx_direct_messages_reply_to_id
  ON public.direct_messages (reply_to_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_messages_reply_to_id
  ON public.watch_group_messages (reply_to_id);
