-- Run after enabling Supabase Cron and pg_net, and after saving the matching
-- CALENDAR_CRON_SECRET in Supabase Vault as lifeos_calendar_cron_secret.
-- Keep secret values out of this file and out of GitHub.
select cron.schedule(
  'lifeos-calendar-push-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://life-os-omega-fawn-29.vercel.app/api/send-calendar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lifeos_calendar_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
