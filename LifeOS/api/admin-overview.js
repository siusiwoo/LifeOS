'use strict';

// 관리자 전용: 전체 사용자 목록과 특정 사용자의 기록을 조회합니다.
// 로그인 토큰의 이메일이 ADMIN_EMAILS(기본값 shshw3388@gmail.com)에 있을 때만 응답합니다.

const { createClient } = require('@supabase/supabase-js');

const DEFAULT_ADMIN_EMAILS = ['shshw3388@gmail.com'];

function adminEmails() {
  const fromEnv = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ADMIN_EMAILS;
}

async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

async function selectAll(query, pageSize = 1000) {
  const rows = [];
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'GET 요청만 허용합니다.' });
  }

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceKey) {
    return response.status(503).json({ error: '관리자 기능의 서버 설정이 아직 완료되지 않았습니다.' });
  }

  const token = /^Bearer (\S+)$/i.exec(request.headers.authorization || '')?.[1];
  if (!token) return response.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const authClient = createClient(url, publishableKey, options);
    const { data: { user } = {}, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user?.id) return response.status(401).json({ error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    if (!adminEmails().includes(String(user.email || '').toLowerCase())) {
      return response.status(403).json({ error: '관리자만 볼 수 있습니다.' });
    }

    const admin = createClient(url, serviceKey, options);
    const userId = typeof request.query?.userId === 'string' ? request.query.userId : '';

    // 특정 사용자의 날짜별 기록
    if (userId) {
      const rows = await selectAll(() => admin
        .from('lifeos_records')
        .select('record_date,data,updated_at')
        .eq('user_id', userId)
        .eq('kind', 'day')
        .order('record_date', { ascending: false }));
      return response.status(200).json({ userId, days: rows });
    }

    // 전체 사용자 요약
    const [users, profiles, records] = await Promise.all([
      listAllUsers(admin),
      selectAll(() => admin.from('profiles').select('id,display_name,total_points,tree_count,updated_at')),
      selectAll(() => admin.from('lifeos_records').select('user_id,record_date,updated_at').eq('kind', 'day'))
    ]);

    const profileById = new Map(profiles.map(profile => [profile.id, profile]));
    const statsById = new Map();
    records.forEach(row => {
      const stat = statsById.get(row.user_id) || { recordDays: 0, lastRecordDate: null, lastUpdatedAt: null };
      stat.recordDays += 1;
      if (row.record_date && (!stat.lastRecordDate || row.record_date > stat.lastRecordDate)) stat.lastRecordDate = row.record_date;
      if (row.updated_at && (!stat.lastUpdatedAt || row.updated_at > stat.lastUpdatedAt)) stat.lastUpdatedAt = row.updated_at;
      statsById.set(row.user_id, stat);
    });

    const result = users.map(item => {
      const profile = profileById.get(item.id) || {};
      const stat = statsById.get(item.id) || { recordDays: 0, lastRecordDate: null, lastUpdatedAt: null };
      return {
        id: item.id,
        email: item.email || '',
        name: profile.display_name || item.user_metadata?.display_name || (item.email || '').split('@')[0] || '사용자',
        createdAt: item.created_at || null,
        lastSignInAt: item.last_sign_in_at || null,
        totalPoints: profile.total_points || 0,
        treeCount: profile.tree_count || 0,
        ...stat
      };
    }).sort((a, b) => String(b.lastUpdatedAt || b.createdAt || '').localeCompare(String(a.lastUpdatedAt || a.createdAt || '')));

    return response.status(200).json({ users: result });
  } catch (error) {
    console.error('LifeOS admin overview failed:', error);
    return response.status(500).json({ error: '관리자 정보를 불러오지 못했습니다.' });
  }
};
