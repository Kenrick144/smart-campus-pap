-- Remove the account directory view: SECURITY DEFINER views bypass caller RLS.
-- The admin/users API already performs role-scoped service-side projections.
DROP VIEW IF EXISTS public.users_directory;
