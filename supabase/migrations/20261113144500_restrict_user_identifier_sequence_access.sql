-- Restringe o acesso direto às sequências de identificadores.
-- Apenas service_role pode consumir identificadores através da API server-side.
revoke all on sequence public.administrator_number_seq from public, anon, authenticated;
revoke all on sequence public.professional_number_seq from public, anon, authenticated;
revoke all on sequence public.employee_number_seq from public, anon, authenticated;

grant usage, select, update on sequence public.administrator_number_seq to service_role;
grant usage, select, update on sequence public.professional_number_seq to service_role;
grant usage, select, update on sequence public.employee_number_seq to service_role;
