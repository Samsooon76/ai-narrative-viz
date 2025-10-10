-- Create a storage bucket for generated images if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload their own generated images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own generated images" ON storage.objects;
DROP POLICY IF EXISTS "Generated images are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own generated images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own generated images" ON storage.objects;

-- Create storage policies for generated images
CREATE POLICY "Users can upload their own generated images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'generated-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Generated images are publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'generated-images');

CREATE POLICY "Users can update their own generated images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'generated-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own generated images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'generated-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);