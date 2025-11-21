-- Fix Security: Function search_path mutable
ALTER FUNCTION public.auto_fill_requested_at() SET search_path = public;