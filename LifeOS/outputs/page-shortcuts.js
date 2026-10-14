// Reuse the Work jump menu for any other page with enough content to scroll.
(function () {
  const main = document.querySelector('.main');
  const content = document.querySelector('#content');
  const trigger = document.querySelector('#work-shortcut-trigger');
  const panel = document.querySelector('#work-shortcut-list');
  const names = {work:'Work',review:'remind',money:'Money',calendar:'Calendar',tree:'Tree',ranking:'Ranking'};
  let shortcutView = '';

  function sectionItems() {
    if (state.view === 'ranking') {
      const card = content.querySelector('.ranking-card');
      if (!card) return [];
      card.id = 'shortcut-ranking-list';
      return [{id:card.id,label:'랭킹 목록'}];
    }
    const items = [], seen = new Set();
    for (const heading of content.querySelectorAll('h2')) {
      const section = heading.closest('section');
      if (!section || seen.has(section)) continue;
      seen.add(section);
      const index = items.length;
      section.id ||= `shortcut-${state.view}-${index}`;
      const label = state.view === 'calendar'
        ? section.classList.contains('calendar-card') ? '달력'
          : section.classList.contains('calendar-agenda') ? '일정·할 일'
          : section.classList.contains('calendar-day-summary') ? '날짜별 기록'
          : heading.textContent.trim()
        : heading.textContent.trim();
      items.push({id:section.id,label});
    }
    if (state.view === 'tree') {
      const history = items.find(item => item.label === '나무를 키운 기록');
      return [
        {action:'tree-current',label:'현재 나무 보기'},
        {action:'tree-forest',label:'나무 갯수 보기'},
        ...(history ? [history] : [])
      ];
    }
    return items;
  }

  function refresh() {
    const view = state.view;
    if (view === 'dashboard' || view === 'settings') {
      main.classList.remove('has-shortcuts');
      panel.hidden = true;
      trigger.setAttribute('aria-expanded','false');
      shortcutView = view;
      return;
    }
    if (view === 'work') {
      main.classList.add('has-shortcuts');
      trigger.textContent = 'Work 바로가기';
      shortcutView = view;
      return;
    }
    const items = sectionItems();
    const scrollable = document.documentElement.scrollHeight > window.innerHeight + 30;
    const show = items.length > 0 && (view === 'tree' || scrollable);
    main.classList.toggle('has-shortcuts',show);
    if (shortcutView !== view || !show) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded','false');
    }
    shortcutView = view;
    if (!show) return;
    trigger.textContent = `${names[view] || view} 바로가기`;
    panel.innerHTML = items.map(item => `<button type="button" class="work-shortcut-link" ${item.action?`data-page-shortcut-action="${item.action}"`:`data-work-jump="${item.id}"`}><span>${esc(item.label)}</span></button>`).join('');
  }

  document.addEventListener('click',event => {
    const action = event.target.closest('[data-page-shortcut-action]');
    if (!action) return;
    const tab = action.dataset.pageShortcutAction === 'tree-forest' ? 'forest' : 'current';
    panel.hidden = true;
    trigger.setAttribute('aria-expanded','false');
    content.querySelector(`[data-tree-tab="${tab}"]`)?.click();
    content.querySelector('.tree-tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
  });

  const previousRender = render;
  render = function (...args) {
    const result = previousRender.apply(this,args);
    refresh();
    return result;
  };
  new MutationObserver(() => { if (state.view === 'ranking') refresh(); })
    .observe(content,{subtree:true,childList:true});
  window.addEventListener('resize',refresh);
  refresh();
})();
