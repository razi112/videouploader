-- Add description column to videos table
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS description text;
