'use strict';

const { createClient } = require('@supabase/supabase-js');

function seoulDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function removeUserImages(admin, userId) {
  const bucket = admin.storage.from('memo-images');
  for (let batch = 0; batch < 100; batch++) {
    const { data: files, error: listError } = await bucket.list(userId, { limit: 1000, offset: 0 });
    if (listError) {
      if (String(listError.statusCode) === '404') return;
      throw listError;
    }
    const paths = (files || []).filter(file => file.id !== null).map(file => `${userId}/${file.name}`);
    if (!paths.length) return;
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
  }
  throw new Error('Too many image batches');
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'POST 요청만 허용합니다.' });
  }

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceKey) {
    return response.status(503).json({ error: '탈퇴 기능의 서버 설정이 아직 완료되지 않았습니다.' });
  }

  const authorization = request.headers.authorization || '';
  const token = /^Bearer (\S+)$/i.exec(authorization)?.[1];
  if (!token) return response.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const authClient = createClient(url, publishableKey, options);
    const { data: { user } = {}, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user?.id) return response.status(401).json({ error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });

    const expected = `${seoulDate()}에 계정과 모든 기록을 즉시 삭제하겠습니다`;
    if (request.body?.confirmation !== expected) {
      return response.status(400).json({ error: '확인 문구가 일치하지 않습니다. 날짜를 다시 확인해 주세요.' });
    }

    const admin = createClient(url, serviceKey, options);
    await removeUserImages(admin, user.id);

    const { error: recordsError } = await admin.from('lifeos_records').delete().eq('user_id', user.id);
    if (recordsError) throw recordsError;
    const { error: profileError } = await admin.from('profiles').delete().eq('id', user.id);
    if (profileError) throw profileError;
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return response.status(200).json({ deleted: true });
  } catch (error) {
    console.error('LifeOS account deletion failed:', error);
    return response.status(500).json({ error: '탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
