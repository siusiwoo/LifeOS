'use strict';

// LifeOS stores calendar dates as local Korean dates. Korea has no daylight-saving time.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function dateKey(utcMilliseconds) {
  return new Date(utcMilliseconds + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDate(date, amount) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}

function occurs(event, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event?.date || '') || date < event.date ||
      (event.repeatEnd && date > event.repeatEnd) || (event.excludedDates || []).includes(date)) return false;
  const start = new Date(`${event.date}T00:00:00Z`);
  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) return false;
  const difference = (target - start) / 86400000;
  if (event.repeat === 'none' || !event.repeat) return difference === 0;
  if (event.repeat === 'daily') return true;
  if (event.repeat === 'weekly') return difference % 7 === 0;
  if (event.repeat === 'monthly') {
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return target.getUTCDate() === Math.min(start.getUTCDate(), last);
  }
  return false;
}

function dueNotifications(events, nowMs, graceMinutes = 10) {
  const today = dateKey(nowMs);
  const dates = [-1, 0, 1, 2].map(offset => shiftDate(today, offset));
  const due = [];
  for (const event of Array.isArray(events) ? events : []) {
    const reminder = event?.reminder;
    if (reminder === -1 || reminder === '-1' || reminder == null) continue;
    const isDay = reminder === 'day';
    const minutes = isDay ? 0 : Number(reminder);
    if (!isDay && (![0, 5, 15, 60, 1440].includes(minutes) || !/^\d{2}:\d{2}$/.test(event.time || ''))) continue;
    const time = isDay ? '09:00' : event.time;
    const [hour, minute] = time.split(':').map(Number);
    if (hour > 23 || minute > 59) continue;
    for (const date of dates) {
      if (!occurs(event, date) || event.kind === 'task' && (event.doneDates || []).includes(date)) continue;
      const [year, month, day] = date.split('-').map(Number);
      const dueAt = Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS - minutes * MINUTE_MS;
      if (dueAt > nowMs || dueAt <= nowMs - graceMinutes * MINUTE_MS) continue;
      due.push({ event, date, reminder: String(reminder), dueAt });
    }
  }
  return due;
}

module.exports = { dueNotifications, occurs, dateKey };
