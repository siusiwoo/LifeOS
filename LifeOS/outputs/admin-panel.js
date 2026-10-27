// 관리자 패널: 관리자 계정으로 로그인했을 때만 Settings의 화면 설정 드롭다운에 "설정" 항목이 생깁니다.
// 그 항목을 고르면 컴퓨터에서는 설정 카드 오른쪽, 휴대폰에서는 설정 카드 아래쪽에 패널이 열립니다.
// 실제 데이터는 서버(/api/admin-overview)가 관리자 여부를 다시 확인한 뒤에만 내려줍니다.
(() => {
  const ADMIN_EMAILS = ['shshw3388@gmail.com'];
  const DAYS_PAGE = 20;
  const panel = { open: false, users: null, loading: false, error: '', query: '', selectedId: '', days: null, daysLoading: false, daysError: '', daysShown: DAYS_PAGE };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const won = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const isAdmin = () => ADMIN_EMAILS.includes(String(window.lifeosCurrentUser?.email || '').toLowerCase());
  const shortDate = value => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  };
  const todaySeoul = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };

  async function api(params = '') {
    const { data: { session } = {} } = (await window.lifeosSupabase?.auth.getSession()) || {};
    if (!session?.access_token) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    const response = await fetch(`/api/admin-overview${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '관리자 정보를 불러오지 못했습니다.');
    return result;
  }

  async function loadUsers() {
    panel.loading = true; panel.error = ''; paint();
    try { panel.users = (await api()).users || []; }
    catch (error) { panel.error = error.message; }
    finally { panel.loading = false; paint(); }
  }

  async function loadDays(userId) {
    panel.selectedId = userId; panel.days = null; panel.daysError = ''; panel.daysLoading = true; panel.daysShown = DAYS_PAGE; paint();
    try { const result = await api(`?userId=${encodeURIComponent(userId)}`); if (panel.selectedId === userId) panel.days = result.days || []; }
    catch (error) { if (panel.selectedId === userId) panel.daysError = error.message; }
    finally { if (panel.selectedId === userId) { panel.daysLoading = false; paint(); } }
  }

  function userList() {
    if (panel.loading && !panel.users) return '<p class="admin-empty">사용자를 불러오는 중이에요…</p>';
    if (panel.error) return `<p class="admin-error">${esc(panel.error)}</p>`;
    const users = panel.users || [];
    const q = panel.query.trim().toLowerCase();
    const shown = q ? users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(q)) : users;
    const today = todaySeoul();
    const activeToday = users.filter(u => u.lastRecordDate === today).length;
    const stats = `<div class="admin-stats"><div><small>전체 사용자</small><strong>${users.length}명</strong></div><div><small>오늘 기록</small><strong>${activeToday}명</strong></div></div>`;
    const search = `<input class="admin-search" data-admin-search type="search" placeholder="이름·이메일 검색" value="${esc(panel.query)}">`;
    if (!shown.length) return stats + search + '<p class="admin-empty">해당하는 사용자가 없어요.</p>';
    return stats + search + `<div class="admin-users">${shown.map(u => `<button type="button" class="admin-user" data-admin-user="${esc(u.id)}"><span class="admin-avatar">${esc((u.name || '?').slice(0, 1))}</span><span class="admin-user-main"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span><span class="admin-user-meta"><b>${u.recordDays}일 기록</b><small>최근 ${esc(u.lastRecordDate || '-')}</small></span></button>`).join('')}</div>`;
  }

  function itemLine(item, fallback) {
    if (typeof item === 'string') return esc(item);
    return esc(item?.title || item?.body || item?.text || item?.memo || fallback);
  }

  function dayBlock(row) {
    const d = row.data || {};
    const parts = [];
    const work = Array.isArray(d.work) ? d.work : [];
    if (work.length) parts.push(`<div class="admin-day-part"><h4>할 일 <small>${work.filter(w => w?.done).length}/${work.length} 완료</small></h4><ul>${work.map(w => `<li class="${w?.done ? 'done' : ''}"><span>${w?.done ? '✓' : '○'}</span>${itemLine(w, '할 일')}${w?.reason ? `<em>못한 이유: ${esc(w.reason)}</em>` : ''}</li>`).join('')}</ul></div>`);
    const notes = Array.isArray(d.notes) ? d.notes : [];
    if (notes.length) parts.push(`<div class="admin-day-part"><h4>메모 <small>${notes.length}개</small></h4><ul>${notes.map(n => `<li><span>✎</span><div><b>${esc(n?.title || '제목 없음')}</b>${n?.body ? `<p>${esc(n.body)}</p>` : ''}${Array.isArray(n?.images) && n.images.length ? `<small>사진 ${n.images.length}장</small>` : ''}</div></li>`).join('')}</ul></div>`);
    const expenses = Array.isArray(d.expenses) ? d.expenses : [];
    const income = Array.isArray(d.income) ? d.income : [];
    if (expenses.length || income.length) parts.push(`<div class="admin-day-part"><h4>돈</h4><ul>${expenses.map(e => `<li><span>－</span>${itemLine(e, '소비')}<b class="admin-amount">${won(e?.amount)}</b></li>`).join('')}${income.map(e => `<li><span>＋</span>${itemLine(e, '수입')}<b class="admin-amount plus">${won(e?.amount)}</b></li>`).join('')}</ul></div>`);
    const growth = Array.isArray(d.growth) ? d.growth : [];
    if (growth.length) parts.push(`<div class="admin-day-part"><h4>학습</h4><ul>${growth.map(g => `<li><span>•</span>${itemLine(g, '학습')}</li>`).join('')}</ul></div>`);
    if (d.reflection) parts.push(`<div class="admin-day-part"><h4>오늘의 한 줄</h4><p class="admin-reflection">${esc(d.reflection)}</p></div>`);
    const summary = [work.length && `할 일 ${work.length}`, notes.length && `메모 ${notes.length}`, (expenses.length + income.length) && `돈 ${expenses.length + income.length}`, d.reflection && '한 줄'].filter(Boolean).join(' · ') || '빈 기록';
    return `<details class="admin-day"><summary><strong>${esc(row.record_date)}</strong><small>${esc(summary)}</small></summary>${parts.join('') || '<p class="admin-empty">이 날은 내용이 없어요.</p>'}</details>`;
  }

  function userDetail() {
    const user = (panel.users || []).find(u => u.id === panel.selectedId) || {};
    const head = `<button type="button" class="admin-back" data-admin-back>← 목록</button><div class="admin-detail-head"><span class="admin-avatar">${esc((user.name || '?').slice(0, 1))}</span><div><strong>${esc(user.name || '사용자')}</strong><small>${esc(user.email || '')}</small></div></div><div class="admin-stats admin-stats-3"><div><small>기록한 날</small><strong>${user.recordDays || 0}일</strong></div><div><small>포인트</small><strong>${user.totalPoints || 0}</strong></div><div><small>나무</small><strong>${user.treeCount || 0}그루</strong></div></div><p class="admin-sub">가입 ${esc(shortDate(user.createdAt))} · 최근 로그인 ${esc(shortDate(user.lastSignInAt))}</p>`;
    if (panel.daysLoading) return head + '<p class="admin-empty">기록을 불러오는 중이에요…</p>';
    if (panel.daysError) return head + `<p class="admin-error">${esc(panel.daysError)}</p>`;
    const days = (panel.days || []).filter(row => {
      const d = row.data || {};
      return ['work', 'notes', 'expenses', 'income', 'growth'].some(key => Array.isArray(d[key]) && d[key].length) || d.reflection;
    });
    if (!days.length) return head + '<p class="admin-empty">아직 남긴 기록이 없어요.</p>';
    const more = days.length > panel.daysShown ? `<button type="button" class="outline admin-more" data-admin-more>더 보기 (${days.length - panel.daysShown}일 남음)</button>` : '';
    return head + `<div class="admin-days">${days.slice(0, panel.daysShown).map(dayBlock).join('')}</div>${more}`;
  }

  function panelMarkup() {
    return `<div class="card-head"><div><span class="admin-eyebrow">ADMIN</span><h2>관리자 페이지</h2></div><button type="button" class="outline admin-refresh" data-admin-refresh ${panel.loading ? 'disabled' : ''}>새로고침</button></div>${panel.selectedId ? userDetail() : userList()}`;
  }

  function paint() {
    const box = document.querySelector('#admin-panel');
    if (box) box.innerHTML = panelMarkup();
  }

  // 화면 설정 드롭다운(Gray/Dark) 목록 맨 아래에 "설정" 항목을 넣습니다.
  // 고르면 패널이 열리고(다시 고르면 닫힘), 드롭다운은 원래 색감 값으로 돌아갑니다.
  function addThemeOption() {
    const select = document.querySelector('#content > .view #settings-theme');
    if (!select) return;
    let option = select.querySelector('option[value="__admin__"]');
    if (!option) {
      option = document.createElement('option');
      option.value = '__admin__';
      select.append(option);
    }
    option.textContent = panel.open ? '설정 닫기' : '설정';
  }

  function unmount() {
    const layout = document.querySelector('.settings-admin-layout');
    if (!layout) return;
    const card = layout.querySelector('.settings-card');
    if (card) layout.replaceWith(card); else layout.remove();
  }

  function mount() {
    addThemeOption();
    if (!panel.open) return;
    const view = document.querySelector('#content > .view');
    const card = view?.querySelector('.settings-card');
    if (!view || !card || view.querySelector('#admin-panel')) return;
    const layout = document.createElement('div');
    layout.className = 'settings-admin-layout';
    card.replaceWith(layout);
    layout.append(card);
    const section = document.createElement('section');
    section.className = 'card admin-card';
    section.id = 'admin-panel';
    layout.append(section);
    paint();
    if (!panel.users && !panel.loading) loadUsers();
  }

  if (typeof render === 'function') {
    const baseRender = render;
    render = function () {
      const result = baseRender.apply(this, arguments);
      try { if (state.view === 'settings' && isAdmin()) mount(); } catch (error) { console.warn('관리자 패널 표시 실패', error); }
      return result;
    };
  }

  window.addEventListener('lifeos-auth', () => {
    if (!isAdmin()) { panel.open = false; panel.users = null; panel.selectedId = ''; panel.days = null; panel.error = ''; }
    try { if (state.view === 'settings') render(); } catch {}
  });

  // 캡처 단계에서 먼저 받아서, "설정"을 골랐을 때 기존 색감 변경 코드가 실행되지 않게 막습니다.
  document.addEventListener('change', event => {
    const select = event.target;
    if (select?.id !== 'settings-theme' || select.value !== '__admin__') return;
    event.stopImmediatePropagation();
    select.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'gray';
    if (!isAdmin()) return;
    panel.open = !panel.open;
    addThemeOption();
    if (panel.open) { mount(); if (window.innerWidth <= 1100) document.querySelector('#admin-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else unmount();
  }, true);

  document.addEventListener('click', event => {
    if (!event.target.closest('#admin-panel')) return;
    const userButton = event.target.closest('[data-admin-user]');
    if (userButton) { loadDays(userButton.dataset.adminUser); document.querySelector('#admin-panel')?.scrollIntoView({ block: 'nearest' }); return; }
    if (event.target.closest('[data-admin-back]')) { panel.selectedId = ''; panel.days = null; paint(); return; }
    if (event.target.closest('[data-admin-more]')) { panel.daysShown += DAYS_PAGE; paint(); return; }
    if (event.target.closest('[data-admin-refresh]')) { if (panel.selectedId) loadDays(panel.selectedId); loadUsers(); }
  });

  document.addEventListener('input', event => {
    if (!event.target.matches('[data-admin-search]')) return;
    panel.query = event.target.value;
    const caret = event.target.selectionStart;
    paint();
    const input = document.querySelector('[data-admin-search]');
    if (input) { input.focus(); try { input.setSelectionRange(caret, caret); } catch {} }
  });
})();
