-- Create animations table to track animation jobs
CREATE TABLE IF NOT EXISTS public.animations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_project_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  image_index INTEGER NOT NULL, -- Index of the image in images_data (0-based)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'error', 'canceled')),
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'advanced')),
  motion_prompt TEXT,
  duration_target_sec INTEGER DEFAULT 5,
  loop BOOLEAN DEFAULT false,
  
  -- Midjourney message tracking
  mj_message_id_grid TEXT,
  mj_message_id_upscale TEXT,
  mj_message_id_video TEXT,
  
  -- Results
  video_url TEXT,
  error_code TEXT,
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.animations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own animations"
  ON public.animations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own animations"
  ON public.animations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own animations"
  ON public.animations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own animations"
  ON public.animations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all animations"
  ON public.animations FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for performance
CREATE INDEX idx_animations_project_id ON public.animations(video_project_id);
CREATE INDEX idx_animations_status ON public.animations(status);
CREATE INDEX idx_animations_user_id ON public.animations(user_id);

-- Update trigger
CREATE TRIGGER update_animations_updated_at
  BEFORE UPDATE ON public.animations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create storage bucket for videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('animation-videos', 'animation-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for animation videos
CREATE POLICY "Users can view own animation videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'animation-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own animation videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'animation-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own animation videos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'animation-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own animation videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'animation-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can view animation videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'animation-videos');