ALTER TABLE public.regions ADD COLUMN max_clients integer NOT NULL DEFAULT 0;
ALTER TABLE public.regions ADD COLUMN current_clients integer NOT NULL DEFAULT 0;