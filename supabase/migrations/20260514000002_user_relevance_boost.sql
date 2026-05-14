-- Add tag-based relevance boost per user (from like/dislike learning)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS user_relevance_boost JSONB DEFAULT '{}';
