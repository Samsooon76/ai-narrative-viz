-- Create a storage bucket for generated animation videos if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'animation-videos',
  'animation-videos',
  true,
  52428800,
  ARRAY['video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist to avoid duplicates
DROP POLICY IF EXISTS "Users can upload their own animation videos" ON storage.objects;
DROP POLICY IF EXISTS "Animation videos are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own animation videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own animation videos" ON storage.objects;

-- Allow authenticated users to manage videos within their own folders
CREATE POLICY "Users can upload their own animation videos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'animation-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Animation videos are publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'animation-videos');

CREATE POLICY "Users can update their own animation videos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'animation-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own animation videos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'animation-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
