ALTER TABLE public.video_projects
ADD COLUMN IF NOT EXISTS voice_data jsonb DEFAULT '{}'::jsonb;
