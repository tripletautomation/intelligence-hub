-- Enable pg_cron and pg_net extensions (safe to re-run)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove existing job if any
select cron.unschedule('auto-generate-weekly') where exists (
  select 1 from cron.job where jobname = 'auto-generate-weekly'
);

-- Schedule: every Friday at 04:00 UTC (07:00 Israel time)
select cron.schedule(
  'auto-generate-weekly',
  '0 4 * * 5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/auto-generate-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{"days_back":7}'::jsonb
  );
  $$
);
