-- Migration vers URLs au lieu de base64
-- Modifier la structure de images_data pour stocker des URLs
COMMENT ON COLUMN video_projects.images_data IS 'Array of image objects with URLs: [{ sceneNumber, sceneTitle, imageUrl, videoUrl, prompt, narration }]';

-- Créer un index pour améliorer les performances de chargement
CREATE INDEX IF NOT EXISTS idx_video_projects_user_status ON video_projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_video_projects_created_at ON video_projects(created_at DESC);