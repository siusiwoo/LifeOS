(() => {
  'use strict';

  const recordButton = document.querySelector('#add-record');
  if (!recordButton || typeof Repository === 'undefined' || typeof render !== 'function') return;

  const actions = document.createElement('div');
  actions.className = 'memo-organizer-actions';
  recordButton.before(actions);
  actions.append(recordButton);

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'outline memo-organizer-open';
  openButton.textContent = '메모 정리';
  actions.prepend(openButton);

  const dialog = document.createElement('dialog');
  dialog.className = 'memo-organizer-dialog';
  dialog.setAttribute('aria-labelledby', 'memo-organizer-title');
  document.body.append(dialog);

  let sources = [];
  const safe = value => esc(String(value ?? ''));

  function allMemos() {
    return Object.entries(Repository.data.days || {})
      .flatMap(([date, day]) => (day.notes || []).map(note => ({ date, note })))
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.note.createdAt || '').localeCompare(String(a.note.createdAt || '')));
  }

  function open() {
    sources = allMemos();
    const list = sources.length
      ? sources.map(({ date, note }, index) => {
          const title = String(note.title || '').trim() || '제목 없는 메모';
          const preview = String(note.body || '').trim().replace(/\s+/g, ' ').slice(0, 110);
          return `<label class="memo-organizer-item"><input type="checkbox" data-memo-index="${index}"><span class="memo-organizer-item-text"><strong>${safe(title)}</strong><small>${safe(date)}${preview ? ` · ${safe(preview)}` : ''}</small></span></label>`;
        }).join('')
      : '<p class="memo-organizer-empty">정리할 메모가 없습니다.</p>';

    dialog.innerHTML = `
      <div class="modal-head"><h2 id="memo-organizer-title">메모 정리</h2><button type="button" class="icon-btn" data-memo-close aria-label="닫기">✕</button></div>
      <p class="memo-organizer-help">모을 메모를 선택하세요. 제목과 내용이 목록 순서대로 한곳에 표시됩니다.</p>
      <div class="memo-organizer-list" role="group" aria-label="메모 선택">${list}</div>
      <p class="memo-organizer-status" role="status" aria-live="polite"></p>
      <div class="modal-actions"><button type="button" class="outline" data-memo-close>취소</button><button type="button" class="primary" data-memo-gather ${sources.length ? '' : 'disabled'}>메모 모으기</button></div>
      <section class="memo-organizer-result" hidden><h3>모은 메모</h3><textarea readonly aria-label="모은 메모 내용"></textarea><button type="button" class="outline" data-memo-copy>내용 복사</button></section>`;
    dialog.querySelectorAll('[data-memo-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.querySelector('[data-memo-gather]').addEventListener('click', gather);
    dialog.querySelector('[data-memo-copy]').addEventListener('click', copy);
    dialog.querySelector('.memo-organizer-list').addEventListener('change', () => {
      dialog.querySelector('.memo-organizer-result').hidden = true;
      dialog.querySelector('.memo-organizer-status').textContent = '';
    });
    dialog.showModal();
  }

  function gather() {
    const indexes = [...dialog.querySelectorAll('[data-memo-index]:checked')]
      .map(input => Number(input.dataset.memoIndex));
    const status = dialog.querySelector('.memo-organizer-status');
    if (!indexes.length) {
      status.textContent = '메모를 하나 이상 선택해 주세요.';
      return;
    }
    const text = indexes.map(index => {
      const note = sources[index].note;
      return `${String(note.title || '').trim() || '제목 없는 메모'}\n${String(note.body || '').trim()}`;
    }).join('\n\n');
    dialog.querySelector('.memo-organizer-result textarea').value = text;
    dialog.querySelector('.memo-organizer-result').hidden = false;
    status.textContent = `${indexes.length}개 메모를 모았습니다.`;
  }

  async function copy() {
    const field = dialog.querySelector('.memo-organizer-result textarea');
    try {
      await navigator.clipboard.writeText(field.value);
      dialog.querySelector('.memo-organizer-status').textContent = '모은 내용을 복사했습니다.';
    } catch {
      field.focus();
      field.select();
      dialog.querySelector('.memo-organizer-status').textContent = '내용을 선택했습니다. 복사해서 사용해 주세요.';
    }
  }

  openButton.addEventListener('click', open);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('lifeos-auth', () => { if (dialog.open) dialog.close(); sources = []; });

  const priorRender = render;
  render = function (...args) {
    const result = priorRender.apply(this, args);
    openButton.hidden = state.view !== 'work';
    return result;
  };
  openButton.hidden = state.view !== 'work';
})();

