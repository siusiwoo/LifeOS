'use strict';

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const webPush = require('web-push');
const { dueNotifications } = require('./calendar-push-lib');

function authorized(request, secret) {
  const provided = /^Bearer (\S+)$/i.exec(request.headers.authorization || '')?.[1] || '';
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function readAll(query, pageSize = 200) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await query.range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'POST only' });
  }
  if (!authorized(request, process.env.CALENDAR_CRON_SECRET)) return response.status(401).json({ error: 'Unauthorized' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !key || !publicKey || !privateKey || !subject) return response.status(503).json({ error: 'Push configuration incomplete' });

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const records = await readAll(admin.from('lifeos_records').select('user_id,data,updated_at').eq('kind', 'categories').order('updated_at', { ascending: false, nullsFirst: false }));
    const now = Date.now();
    let sent = 0;
    let failed = 0;
    let dueEvents = 0;
    let subscriptionCount = 0;
    let calendarEventCount = 0;
    let reminderConfiguredCount = 0;
    const eventDiagnostics = [];
    const subscriptionsByUser = new Map();
    const seenUsers = new Set();
    for (const record of records) {
      // Older duplicate category rows must not override or resend a user's current calendar.
      if (seenUsers.has(record.user_id)) continue;
      seenUsers.add(record.user_id);
      if (!subscriptionsByUser.has(record.user_id)) {
        const subscriptions = await readAll(admin.from('calendar_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', record.user_id));
        subscriptionsByUser.set(record.user_id, subscriptions);
        subscriptionCount += subscriptions.length;
      }
      // The browser also prefers the top-level copy when both saved copies exist.
      const events = Array.isArray(record.data?.calendarEvents) ? record.data.calendarEvents : Array.isArray(record.data?.motivation?.calendarEvents) ? record.data.motivation.calendarEvents : [];
      calendarEventCount += events.length;
      reminderConfiguredCount += events.filter(event => event?.reminder !== -1 && event?.reminder !== '-1' && event?.reminder != null).length;
      if (eventDiagnostics.length < 10) eventDiagnostics.push(...events.slice(0, 10 - eventDiagnostics.length).map(event => ({ date: event?.date || '', time: event?.time || '', reminder: event?.reminder ?? null, kind: event?.kind || '' })));
      const due = dueNotifications(events, now);
      if (!due.length) continue;
      dueEvents += due.length;
      for (const subscription of subscriptionsByUser.get(record.user_id)) {
        for (const notice of due) {
          const claim = {
            subscription_id: subscription.id,
            event_id: String(notice.event.id || ''),
            occurrence_date: notice.date,
            reminder: notice.reminder
          };
          if (!claim.event_id) continue;
          const { error: claimError } = await admin.from('calendar_push_deliveries').insert(claim);
          if (claimError?.code === '23505') continue;
          if (claimError) throw claimError;
          const payload = JSON.stringify({
            title: String(notice.event.title || '일정 알림').slice(0, 100),
            body: `${notice.date} ${notice.event.time || '종일'} · ${notice.event.kind === 'task' ? '할 일' : '일정'}`,
            url: '/',
            tag: `lifeos-calendar-${claim.event_id}-${claim.occurrence_date}-${claim.reminder}`
          });
          try {
            await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 600 });
            sent++;
          } catch (error) {
            failed++;
            if ([404, 410].includes(error.statusCode)) {
              await admin.from('calendar_push_subscriptions').delete().eq('id', subscription.id);
            } else {
              await admin.from('calendar_push_deliveries').delete()
                .eq('subscription_id', claim.subscription_id).eq('event_id', claim.event_id)
                .eq('occurrence_date', claim.occurrence_date).eq('reminder', claim.reminder);
              console.error('Calendar push delivery failed', error.statusCode || error.message);
            }
          }
        }
      }
    }
    console.log('LifeOS calendar push result', { checked: records.length, calendarEventCount, reminderConfiguredCount, dueEvents, subscriptionCount, sent, failed, eventDiagnostics });
    return response.status(200).json({ checked: records.length, calendarEventCount, reminderConfiguredCount, dueEvents, subscriptionCount, sent, failed, eventDiagnostics });
  } catch (error) {
    console.error('Calendar push job failed', error);
    return response.status(500).json({ error: 'Calendar push job failed' });
  }
};

