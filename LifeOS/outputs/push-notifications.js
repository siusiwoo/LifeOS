'use strict';

(() => {
  const ownerKey = 'lifeos.push.owner.v1';
  const disabledKey = user => `lifeos.push.disabled.v1.${user.id}`;
  let enabled = false;
  let busy = false;
  let publicKey = '';
  let refreshId = 0;
  let verificationError = false;
  fetch('/api/push-config', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(config => { publicKey = config?.publicKey || ''; updateButton(); })
    .catch(() => { publicKey = ''; updateButton(); });
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  const currentUser = () => window.lifeosCurrentUser;

  function updateButton() {
    const button = document.querySelector('[data-calendar-push-toggle]');
    const status = document.querySelector('[data-calendar-push-status]');
    if (!button || !status) return;
    const user = currentUser();
    button.disabled = busy || !user || !supported() || (!enabled && !publicKey);
    button.textContent = busy ? '알림 설정 중…' : enabled ? '알림 끄기' : '알림 받기';
    status.textContent = !supported() ? '이 브라우저는 푸시 알림을 지원하지 않아요.' :
      !user ? '로그인 후 서버 알림을 사용할 수 있어요.' :
      Notification.permission === 'denied' ? '브라우저 설정에서 알림을 허용해 주세요.' :
      verificationError ? '서버의 알림 등록 상태를 확인하지 못했어요. 알림 받기를 다시 눌러 주세요.' :
      enabled ? '이 기기에 일정 알림을 보냅니다.' :
      !publicKey ? '지금은 사이트를 열어 둔 동안만 알림을 받을 수 있어요.' :
      localStorage.getItem(disabledKey(user)) ? '알림이 꺼져 있어요. 다시 받으려면 알림 받기를 누르세요.' :
      '버튼을 눌러 이 기기의 푸시 알림을 켜세요.';
  }

  function decodeKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  async function registration() {
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  async function refresh() {
    const requestId = ++refreshId;
    enabled = false;
    verificationError = false;
    const user = currentUser();
    if (!user || !supported()) { window.lifeosPushEnabled = false; updateButton(); return; }
    try {
      const reg = await registration();
      let subscription = await reg.pushManager.getSubscription();
      if (requestId !== refreshId || currentUser()?.id !== user.id) return;
      if (subscription && localStorage.getItem(ownerKey) && localStorage.getItem(ownerKey) !== user.id) {
        await subscription.unsubscribe();
        localStorage.removeItem(ownerKey);
        subscription = null;
      }
      enabled = !!subscription && localStorage.getItem(ownerKey) === user.id;
      if (enabled && window.lifeosSupabase) {
        const { data, error } = await window.lifeosSupabase.from('calendar_push_subscriptions').select('id')
          .eq('user_id', user.id).eq('endpoint', subscription.endpoint).limit(1).maybeSingle();
        if (error) throw error;
        enabled = !!data;
      }
    } catch (error) { console.warn('푸시 상태 확인 실패', error); verificationError = true; enabled = false; }
    if (requestId !== refreshId || currentUser()?.id !== user.id) return;
    window.lifeosPushEnabled = enabled;
    updateButton();
  }

  async function enable() {
    const user = currentUser();
    if (!user || !window.lifeosSupabase) throw new Error('먼저 로그인해 주세요.');
    if (!supported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않아요.');
    if (!publicKey) throw new Error('푸시 서버 설정이 아직 완료되지 않았어요.');
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('브라우저에서 알림을 허용해 주세요.');
    }
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (subscription && localStorage.getItem(ownerKey) !== user.id) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
    const data = subscription.toJSON();
    const { error } = await window.lifeosSupabase.from('calendar_push_subscriptions').upsert({
      user_id: user.id, endpoint: data.endpoint,
      p256dh: data.keys?.p256dh, auth: data.keys?.auth
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    localStorage.setItem(ownerKey, user.id);
    localStorage.removeItem(disabledKey(user));
    verificationError = false;
    enabled = true;
    window.lifeosPushEnabled = true;
  }

  async function disable() {
    const user = currentUser();
    const reg = await registration();
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      if (user && window.lifeosSupabase) {
        const { error } = await window.lifeosSupabase.from('calendar_push_subscriptions').delete()
          .eq('user_id', user.id).eq('endpoint', subscription.endpoint);
        if (error) throw error;
      }
      await subscription.unsubscribe();
    }
    localStorage.removeItem(ownerKey);
    if (user) localStorage.setItem(disabledKey(user), '1');
    verificationError = false;
    enabled = false;
    window.lifeosPushEnabled = false;
  }

  window.lifeosEnablePushFromCalendar = () => {
    const user = currentUser();
    if (enabled || busy || !user || !supported() || !publicKey || Notification.permission === 'denied' || localStorage.getItem(disabledKey(user))) return false;
    busy = true;
    updateButton();
    enable().then(() => window.toast?.('이 기기에서 일정 알림을 켰어요.'))
      .catch(error => { console.warn('일정 알림 설정 실패', error); window.toast?.(error.message || '알림을 켜지 못했어요.'); })
      .finally(() => { busy = false; updateButton(); });
    return true;
  };

  document.addEventListener('click', async event => {
    if (!event.target.closest('[data-calendar-push-toggle]') || busy) return;
    busy = true;
    updateButton();
    try {
      if (enabled) await disable(); else await enable();
      window.toast?.(enabled ? '이 기기에서 푸시 알림을 켰어요.' : '이 기기의 푸시 알림을 껐어요.');
    } catch (error) {
      console.warn('푸시 알림 설정 실패', error);
      window.toast?.(error.message || '푸시 알림 설정에 실패했어요.');
    } finally { busy = false; updateButton(); }
  });

  const previousRender = render;
  render = function (...args) { const result = previousRender.apply(this, args); updateButton(); return result; };
  window.addEventListener('lifeos-auth', refresh);
  window.addEventListener('storage', event => { if (event.key === ownerKey) refresh(); });
  refresh();
})();
