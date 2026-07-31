-- Fix admin CRUD over advanced product menu options.
-- RLS policies already restrict access to the restaurant owner/admin; this
-- grant gives authenticated sessions the base table privileges needed for RLS
-- to evaluate.

grant select, insert, update, delete on table public.product_menu_options
  to authenticated, service_role;

grant usage, select on sequence public.product_menu_options_id_seq
  to authenticated, service_role;
