'use strict';

// 새 소식(업데이트 공지)
// GET: 누구나 최신 글 목록 조회 / POST(추가)·PATCH(수정)·DELETE(삭제): 관리자만 (로그인 토큰의 이메일 확인)

const { createClient } = require('@supabase/supabase-js');

const DEFAULT_ADMIN_EMAILS = ['shshw3388@gmail.com'];
const options = { auth: { autoRefreshToken: false, persistSession: false } };

function adminEmails() {
  const fromEnv = String(process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ADMIN_EMAILS;
}

async function requireAdmin(request, url, publishableKey) {
  const token = /^Bearer (\S+)$/i.exec(request.headers.authorization || '')?.[1];
  if (!token) return { status: 401, error: '로그인이 필요합니다.' };
  const { data: { user } = {}, error } = await createClient(url, publishableKey, options).auth.getUser(token);
  if (error || !user?.id) return { status: 401, error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' };
  if (!adminEmails().includes(String(user.email || '').toLowerCase())) return { status: 403, error: '관리자만 할 수 있습니다.' };
  return null;
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey) return response.status(503).json({ error: '서버 설정이 아직 완료되지 않았습니다.' });

  try {
    if (request.method === 'GET') {
      const { data, error } = await createClient(url, publishableKey, options)
        .from('announcements').select('id,title,body,created_at')
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return response.status(200).json({ posts: data || [] });
    }

    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return response.status(405).json({ error: '허용되지 않는 요청입니다.' });
    }
    if (!serviceKey) return response.status(503).json({ error: '서버 설정이 아직 완료되지 않았습니다.' });
    const denied = await requireAdmin(request, url, publishableKey);
    if (denied) return response.status(denied.status).json({ error: denied.error });

    const admin = createClient(url, serviceKey, options);
    if (request.method === 'POST') {
      const title = String(request.body?.title || '').trim().slice(0, 80);
      const body = String(request.body?.body || '').trim().slice(0, 2000);
      if (!title) return response.status(400).json({ error: '제목을 입력해 주세요.' });
      const { data, error } = await admin.from('announcements').insert({ title, body }).select('id,title,body,created_at').single();
      if (error) throw error;
      return response.status(200).json({ post: data });
    }

    if (request.method === 'PATCH') {
      const id = String(request.body?.id || '');
      const title = String(request.body?.title || '').trim().slice(0, 80);
      const body = String(request.body?.body || '').trim().slice(0, 2000);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return response.status(400).json({ error: '수정할 글을 찾을 수 없습니다.' });
      if (!title) return response.status(400).json({ error: '제목을 입력해 주세요.' });
      const { data, error } = await admin.from('announcements').update({ title, body }).eq('id', id).select('id,title,body,created_at').maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: '수정할 글을 찾을 수 없습니다.' });
      return response.status(200).json({ post: data });
    }

    const id = String(request.query?.id || request.body?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return response.status(400).json({ error: '삭제할 글을 찾을 수 없습니다.' });
    const { error } = await admin.from('announcements').delete().eq('id', id);
    if (error) throw error;
    return response.status(200).json({ deleted: true });
  } catch (error) {
    console.error('LifeOS announcements failed:', error);
    return response.status(500).json({ error: '새 소식을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
