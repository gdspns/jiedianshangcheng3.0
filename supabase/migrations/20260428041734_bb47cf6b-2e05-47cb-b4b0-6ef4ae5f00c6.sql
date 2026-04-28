DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.region_inbounds;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbound_plans;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.regions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_regions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;