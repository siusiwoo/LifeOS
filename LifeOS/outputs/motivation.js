// Each current saved activity is credited once; undoing or deleting it removes that activity's credit.
let treeTab = 'current';
let treePage = 0;
function rememberGrowth() {
  const settings = Repository.data.motivation ||= {};
  const events = settings.treeEvents ||= {};
  const active = new Set();
  let changed = false;
  for (const [date, day] of Object.entries(Repository.data.days)) {
    if (date > today) continue;
    for (const kind of ['work','expenses','growth']) {
      for (const record of day[kind] || []) {
        if (!record.id || (kind === 'work' && !record.done)) continue;
        const key = JSON.stringify([date,kind,record.id]);
        active.add(key);
        const next = {kind,date,title:String(record.title || '')};
        if (!events[key] || events[key].title !== next.title) {
          events[key] = next;
          changed = true;
        }
      }
    }
  }
  for (const key of Object.keys(events)) {
    if (key.startsWith('weekly:') || key.startsWith('long-goal:')) active.add(key);
  }
  for (const key of Object.keys(events)) {
    if (!active.has(key)) {
      delete events[key];
      changed = true;
    }
  }
  if (changed) { Repository.save(); syncCategoriesToSupabase(); }
}
function treeSummary(settings = {}) {
  const events = Object.values(settings.treeEvents || {});
  const total = events.reduce((sum, event) => sum + (Number(event.points) || 1), 0);
  const completed = Math.floor(total / 100), progress = total % 100;
  const stages = [{name:'씨앗',at:0},{name:'새싹',at:10},{name:'어린 나무',at:30},{name:'튼튼한 나무',at:60},{name:'풍성해지는 나무',at:85}];
  const stage = stages.reduce((value,item,index)=>progress>=item.at?index:value,0);
  return {events,total,completed,progress,stage,stages};
}
function growthTree(stage) {
  const leaves = [[87,98,-30],[113,82,30],[82,69,-35],[117,55,30],[97,40,-10],[66,49,-40],[137,39,40],[70,24,-25],[121,17,25]];
  const counts = [0,2,4,6,9];
  return `<svg class="growth-tree" viewBox="0 0 200 155" role="img" aria-label="성장 나무 ${stage+1}단계"><ellipse cx="100" cy="140" rx="48" ry="6" class="tree-ground"/>${stage===0?'<ellipse cx="100" cy="129" rx="9" ry="12" class="tree-seed"/>':`<path d="M100 137 Q96 100 101 ${stage===1?83:stage===2?58:27}" class="tree-trunk"/>${leaves.slice(0,counts[stage]).map(([x,y,angle])=>`<path d="M100 ${y+20} L${x} ${y+5}" class="tree-branch"/><ellipse cx="${x}" cy="${y}" rx="10" ry="17" transform="rotate(${angle} ${x} ${y})" class="tree-leaf"/>`).join('')}`}</svg>`;
}


// Long-term goals live in motivation data, so they sync with the other Work goals.
let longGoalEditingId = null;
const longGoalReward = 10;
function longGoals() {
  const motivation = Repository.data.motivation ||= {};
  return motivation.longGoals ||= [];
}
function syncLongGoalPoints() {
  const motivation = Repository.data.motivation ||= {};
  const events = motivation.treeEvents ||= {};
  for (const key of Object.keys(events)) if (key.startsWith('long-goal:')) delete events[key];
  for (const goal of longGoals()) {
    if (!goal.done || !String(goal.title || '').trim()) continue;
    events[`long-goal:${goal.id}`] = {kind:'long-goal',date:goal.completedAt || today,title:goal.title,points:longGoalReward};
  }
  Repository.save();
  syncCategoriesToSupabase();
}
function longGoalsView() {
  const goals = longGoals();
  const editing = goals.find(goal => goal.id === longGoalEditingId);
  const done = goals.filter(goal => goal.done).length;
  const ordered = [...goals].sort((a,b) => Number(a.done) - Number(b.done));
  return `<section class="card long-goals-card" id="work-long-goals"><div class="card-head"><div><h2>내가 이루고 싶은 목표</h2><p class="muted">시간을 들여 이루고 싶은 목표를 적어 보세요.</p></div><span class="pill">${done} / ${goals.length} 달성</span></div><form class="long-goal-form" data-long-goal-form><label>목표 이름<input name="title" maxlength="120" required value="${esc(editing?.title || '')}" placeholder="예: 자격증 취득하기"></label><label>목표 날짜 · 선택<input name="targetDate" type="date" value="${esc(editing?.targetDate || '')}"></label><button type="submit" class="primary">${editing?'수정 저장':'목표 추가'}</button>${editing?'<button type="button" class="outline" data-long-goal-cancel>취소</button>':''}</form><p class="long-goal-help">목표 달성 시 Tree 포인트 +${longGoalReward}점 · 완료를 취소하거나 삭제하면 점수도 취소돼요.</p><div class="long-goal-list">${ordered.length?ordered.map(goal=>`<div class="long-goal-row ${goal.done?'is-done':''}"><button type="button" class="check ${goal.done?'done':''}" data-long-goal-toggle="${esc(goal.id)}" aria-label="${esc(goal.title)} ${goal.done?'달성 취소':'목표 달성'}" aria-pressed="${!!goal.done}">${goal.done?'✓':''}</button><div class="long-goal-info"><strong>${esc(goal.title)}</strong><small>${goal.done?`${esc(goal.completedAt || '')} 달성 · +${longGoalReward}점`:goal.targetDate?`목표 날짜 ${esc(goal.targetDate)}`:'목표 날짜 미정'}</small></div><button type="button" class="edit" data-long-goal-edit="${esc(goal.id)}" aria-label="${esc(goal.title)} 수정">수정</button><button type="button" class="delete-inline" data-long-goal-remove="${esc(goal.id)}" aria-label="${esc(goal.title)} 삭제">×</button></div>`).join(''):'<p class="long-goal-empty">아직 정한 목표가 없어요. 이루고 싶은 큰 목표를 하나 적어 보세요.</p>'}</div></section>`;
}
document.addEventListener('submit', event => {
  if (!event.target.matches('[data-long-goal-form]')) return;
  event.preventDefault();
  const data = new FormData(event.target);
  const title = String(data.get('title') || '').trim();
  const targetDate = String(data.get('targetDate') || '');
  if (!title) { toast('목표 이름을 입력해 주세요.'); return; }
  if (targetDate && !validDate(targetDate)) { toast('올바른 목표 날짜를 선택해 주세요.'); return; }
  const goals = longGoals();
  const existing = goals.find(goal => goal.id === longGoalEditingId);
  if (existing) { existing.title = title; existing.targetDate = targetDate; }
  else goals.push({id:`long-goal-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title,targetDate,done:false,completedAt:''});
  longGoalEditingId = null;
  syncLongGoalPoints();render();toast(existing?'목표를 수정했어요.':'새 목표를 추가했어요.');
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-long-goal-cancel')) { longGoalEditingId = null;render();return; }
  if (button.dataset.longGoalEdit) { longGoalEditingId = button.dataset.longGoalEdit;render();document.querySelector('[data-long-goal-form] input[name="title"]')?.focus();return; }
  if (button.dataset.longGoalToggle) {
    const goal = longGoals().find(item => item.id === button.dataset.longGoalToggle);
    if (!goal) return;
    goal.done = !goal.done;
    goal.completedAt = goal.done ? today : '';
    syncLongGoalPoints();render();toast(goal.done?`목표를 달성했어요. Tree 포인트 +${longGoalReward}점!`:'목표 달성을 취소했어요.');return;
  }
  if (button.dataset.longGoalRemove) {
    if (!window.confirm('이 목표를 삭제할까요?')) return;
    const goals = longGoals();
    const index = goals.findIndex(item => item.id === button.dataset.longGoalRemove);
    if (index < 0) return;
    goals.splice(index,1);
    if (longGoalEditingId === button.dataset.longGoalRemove) longGoalEditingId = null;
    syncLongGoalPoints();render();toast('목표를 삭제했어요.');
  }
});

function weeklyStart(date) {
  const value = parseDate(date);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return dateKey(value);
}
function weeklyGoals() {
  const settings = Repository.data.motivation ||= {};
  const goalsByWeek = settings.weeklyGoals ||= {};
  const key = weeklyStart(state.date);
  if (!Array.isArray(goalsByWeek[key]) || !goalsByWeek[key].length) {
    goalsByWeek[key] = Array.from({length:5},()=>({id:`goal-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:'',done:false}));
    Repository.save();
  }
  return {key,goals:goalsByWeek[key]};
}
function weeklyGoalsView() {
  const {key,goals} = weeklyGoals();
  const completed = goals.filter(goal=>goal.title.trim() && goal.done).length;
  const filled = goals.filter(goal=>goal.title.trim()).length;
  return `<section class="card weekly-goals-card" id="work-weekly-goals"><div class="card-head"><div><h2>이번 주 목표</h2><p class="muted">${key}부터 일요일까지 완수할 일을 적어 보세요.</p></div><span class="pill">${completed} / ${filled || goals.length} 완료</span></div><div class="weekly-goal-list">${goals.map((goal,index)=>`<div class="weekly-goal-row"><input type="checkbox" data-weekly-toggle="${esc(goal.id)}" ${goal.done?'checked':''} ${goal.title.trim()?'':'disabled'} aria-label="${index+1}번째 목표 완료"><input class="weekly-goal-input ${goal.done?'is-done':''}" data-weekly-title="${esc(goal.id)}" value="${esc(goal.title)}" maxlength="120" placeholder="${index+1}번째 목표를 입력하세요"><button type="button" class="delete-inline" data-weekly-remove="${esc(goal.id)}" aria-label="${index+1}번째 목표 삭제">×</button></div>`).join('')}</div><div class="weekly-goal-actions"><button type="button" class="text-btn" data-weekly-add>＋ 목표 추가</button><span>${filled && filled===completed ? '목표를 모두 완료했어요. Tree 포인트 5점을 얻었어요.' : '이번 주에 꼭 끝낼 일을 작은 단위로 적어 보세요.'}</span></div></section>`;
}
function addWeeklyGoalSlots() {
  const {goals}=weeklyGoals();
  goals.push({id:`goal-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:'',done:false});
  Repository.save();syncWeeklyPoints(weeklyStart(state.date));syncCategoriesToSupabase();render();toast('이번 주 목표를 하나 더 준비했어요.');
}
function updateWeeklyGoal(id,patch) {
  const {goals}=weeklyGoals();const goal=goals.find(item=>item.id===id);if(!goal)return;
  Object.assign(goal,patch);if(!goal.title.trim())goal.done=false;Repository.save();syncWeeklyPoints(weeklyStart(state.date));syncCategoriesToSupabase();
  const filled=goals.filter(item=>item.title.trim()),completed=filled.filter(item=>item.done);
  if(filled.length>0&&filled.length===completed.length){render();toast('이번 주 목표를 모두 완료했어요. Tree 포인트 5점을 얻었어요.');return}render();
}
function syncWeeklyPoints(key) {
  const settings=Repository.data.motivation ||= {},events=settings.treeEvents ||= {},goals=settings.weeklyGoals?.[key]||[];
  Object.keys(events).filter(id=>id.startsWith(`weekly:${key}:`)).forEach(id=>delete events[id]);
  const filled=goals.filter(goal=>String(goal.title||'').trim()),completed=filled.filter(goal=>goal.done);
  completed.forEach(goal=>{events[`weekly:${key}:goal:${goal.id}`]={kind:'weekly',date:key,title:String(goal.title||'주간 목표 완료')}});
  if(filled.length>0&&completed.length===filled.length){for(let i=0;i<5;i++)events[`weekly:${key}:bonus:${i}`]={kind:'weekly',date:key,title:'이번 주 목표 전체 완료 보너스'}}
  Repository.save();
}
function removeWeeklyGoal(id) {const {goals}=weeklyGoals();const index=goals.findIndex(item=>item.id===id);if(index<0)return;goals.splice(index,1);Repository.save();syncWeeklyPoints(weeklyStart(state.date));syncCategoriesToSupabase();render()}

function treeView() {
  const m = treeSummary(Repository.data.motivation);
  const next = m.stages[m.stage+1];
  const tabs = `<div class="tree-tabs" aria-label="나무 보기 선택"><button type="button" data-tree-tab="current" aria-pressed="${treeTab==='current'}">현재 나무 보기</button><button type="button" data-tree-tab="forest" aria-pressed="${treeTab==='forest'}">나무 갯수 보기 · ${m.completed}그루</button></div>`;
  if (treeTab === 'forest') {
    const pages = Math.max(1,Math.ceil(m.completed/24));
    treePage = Math.max(0,Math.min(treePage,pages-1));
    const first = treePage*24, count = Math.min(24,m.completed-first);
    return `${tabs}<section class="card forest-card"><div class="card-head"><h2>내가 키운 숲</h2><span class="pill">완성한 나무 ${m.completed}그루</span></div><p class="muted">한 그루마다 Tree 포인트 100점이 담겨 있어요.</p>${m.completed?`<div class="forest-grid">${Array.from({length:count},(_,i)=>`<figure>${growthTree(4)}<figcaption>${first+i+1}번째 나무</figcaption></figure>`).join('')}</div>`:'<div class="empty">아직 완성한 나무가 없어요.<br>지금 키우는 첫 나무가 다 자라면 이곳에 심어져요.</div>'}${pages>1?`<div class="tree-pagination"><button class="outline" data-tree-page="${treePage-1}" ${treePage===0?'disabled':''}>이전</button><span>${treePage+1} / ${pages}</span><button class="outline" data-tree-page="${treePage+1}" ${treePage===pages-1?'disabled':''}>다음</button></div>`:''}</section>`;
  }
  const labels = {work:'해야 할 일을 완료했어요',expenses:'소비를 기록했어요',growth:'배움을 기록했어요',weekly:'이번 주 목표를 완료했어요','long-goal':'장기 목표를 달성했어요'};
  const recent = m.events.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const renderHistory = items => `<ul class="tree-history">${items.map(e=>`<li><div><strong>${labels[e.kind]||'실천을 기록했어요'}</strong><p>${esc(e.title)}</p></div><time>${esc(e.date)}</time><span class="pill">+${Number(e.points)||1}</span></li>`).join('')}</ul>`;
  const history = recent.length ? `${renderHistory(recent.slice(0,5))}${recent.length>5?`<details class="tree-history-more"><summary>나머지 기록 ${recent.length-5}개 보기</summary>${renderHistory(recent.slice(5))}</details>`:''}` : '<p class="empty">업무를 완료하거나 소비·배움을 기록하면 나무가 자라요.</p>';
  return `${tabs}<section class="card motivation-card tree-current"><div class="motivation-tree">${growthTree(m.stage)}<strong>${m.completed+1}번째 나무 · ${m.stages[m.stage].name}</strong><span>${m.completed?'새 씨앗도 천천히 키워봐요.':'작은 실천으로 첫 씨앗을 키워봐요.'}</span></div><div class="motivation-body"><div class="card-head"><h2>천천히 자라는 나의 나무</h2><span class="pill">누적 Tree 포인트 ${m.total}점</span></div><p class="motivation-message">${next?`${next.name}까지 ${next.at-m.progress}점 남았어요.`:`나무 완성까지 ${100-m.progress}점 남았어요.`}</p><div class="weekly-numbers"><span>이 나무와 함께한 포인트</span><strong>${m.progress} / 100</strong></div><div class="weekly-track" role="progressbar" aria-label="현재 나무 성장" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.progress}"><i style="width:${m.progress}%"></i></div><p class="motivation-help">업무 완료 · 소비 기록 · 배움 기록은 1점씩.<br>주간 목표 완료는 1점, 모두 완료하면 보너스 5점.<br>장기 목표 달성은 10점이며, 완료를 취소하면 점수도 취소돼요.<br>포인트 100점으로 나무를 완성하면 새 씨앗이 시작돼요.</p></div></section><section class="card"><div class="card-head"><h2>나무를 키운 기록</h2></div>${history}</section>`;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.treeTab){treeTab=button.dataset.treeTab;treePage=0;render();}
  if(button.dataset.treePage!==undefined){treePage=Number(button.dataset.treePage);render();}
  if(button.dataset.weeklyAdd!==undefined){addWeeklyGoalSlots();}
  if(button.dataset.weeklyRemove)removeWeeklyGoal(button.dataset.weeklyRemove);
});
document.addEventListener('change',event=>{
  const toggle=event.target.closest('[data-weekly-toggle]');
  if(toggle)updateWeeklyGoal(toggle.dataset.weeklyToggle,{done:toggle.checked});
  const title=event.target.closest('[data-weekly-title]');
  if(title)updateWeeklyGoal(title.dataset.weeklyTitle,{title:title.value});
});

function shiftMonth(date, amount) {
  const value = parseDate(date);
  const day = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() + amount);
  value.setDate(Math.min(day, new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()));
  return dateKey(value);
}

function calendarSearchResults(query) {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean) return '<p class="calendar-search-empty">메모와 일정의 제목·내용을 검색해 보세요.</p>';
  const results = [];
  for (const [date, day] of Object.entries(Repository.data.days || {})) {
    for (const note of day.notes || []) {
      if (`${note.title || ''} ${note.body || ''}`.toLowerCase().includes(clean)) results.push({date, kind:'memo', record:note});
    }
  }
  if (typeof calendarEvents === 'function') {
    for (const event of calendarEvents()) {
      if (!validDate(event.date)) continue;
      if (`${event.title || ''} ${event.notes || ''}`.toLowerCase().includes(clean)) {
        const date = typeof calendarSearchEventDate === 'function' ? calendarSearchEventDate(event) : event.date;
        if (date) results.push({date, kind:event.kind === 'task' ? 'task' : 'event', record:event});
      }
    }
  }
  results.sort((a, b) => b.date.localeCompare(a.date));
  if (!results.length) return '<p class="calendar-search-empty">일치하는 메모나 일정이 없어요.</p>';
  const repeatLabels = {daily:'매일', weekly:'매주', monthly:'매월'};
  return results.map(({date, kind, record}) => {
    const label = kind === 'memo' ? '메모' : kind === 'task' ? '할 일' : '일정';
    const title = record.title || (kind === 'memo' ? '제목 없는 메모' : '제목 없는 일정');
    const detail = kind === 'memo'
      ? String(record.body || '').replace(/\s+/g, ' ').slice(0, 90) || '본문 없음'
      : [record.time || '', repeatLabels[record.repeat] || '', String(record.notes || '').replace(/\s+/g, ' ').slice(0, 90)].filter(Boolean).join(' · ') || '내용 없음';
    const target = kind === 'memo' ? `data-calendar-result-note="${esc(record.id)}"` : `data-calendar-result-event="${esc(record.id)}"`;
    return `<button type="button" class="calendar-search-result" data-calendar-result-date="${esc(date)}" ${target}><span><strong><em class="calendar-search-type">${label}</em>${esc(title)}</strong><small>${esc(detail)}</small></span><time>${esc(date)}</time></button>`;
  }).join('');
}

function calendarHoliday(date) {
  const fixed = {'01-01':'신정','03-01':'삼일절','05-05':'어린이날','06-06':'현충일','08-15':'광복절','10-03':'개천절','10-09':'한글날','12-25':'성탄절'};
  const variable = {
    '2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴',
    '2026-05-24':'부처님오신날','2026-05-25':'대체공휴일','2026-06-03':'지방선거일',
    '2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴','2026-10-05':'대체공휴일'
  };
  return variable[date] || fixed[date.slice(5)] || '';
}
function calendarDayRecords(date) {
  const day = typeof dayWithFixedMoney === 'function' ? dayWithFixedMoney(date) : Repository.getDay(date);
  return {...day, work:(day.work || []).filter(item => item.recurrenceType !== 'recurring')};
}
function calendarCell(key, dayNumber, currentDate) {
  const day = calendarDayRecords(key);
  const recorded = day.work.length || day.growth.length || day.expenses.length || day.income.length || day.notes.length || day.reflection;
  const events = typeof calendarEventsForDay === 'function' ? calendarEventsForDay(key) : [];
  const holiday = calendarHoliday(key);
  const previews = events.slice(0, 2).map(item => `<span class="calendar-event-preview ${item.kind === 'task' ? 'task' : 'event'}">${item.time ? `${esc(item.time)} · ` : ''}${esc(item.title)}</span>`).join('');
  const more = events.length > 2 ? `<span class="calendar-event-more">+${events.length - 2}개</span>` : '';
  const holidayLine = holiday ? `<span class="calendar-holiday-label">${esc(holiday)}</span>` : '';
  return `<button type="button" class="calendar-cell ${key === state.date ? 'active' : ''} ${key === currentDate ? 'today' : ''} ${recorded ? 'has-record' : ''} ${holiday ? 'holiday' : ''}" data-date="${key}" aria-label="${key}${holiday ? ` ${holiday}` : ''}${key === currentDate ? ' 오늘' : ''}, 일정·할 일 ${events.length}개, 기록 보기"><span class="calendar-day-number">${dayNumber}</span>${holidayLine}${events.length ? `<span class="calendar-event-previews">${previews}${more}</span>` : ''}</button>`;
}
function calendarMonthGrid(year, month, currentDate) {
  const firstDay = new Date(year, month, 1, 12);
  const offset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const cells = [];
  for (let index = 0; index < offset; index += 1) cells.push('<span class="calendar-cell calendar-empty" aria-hidden="true"></span>');
  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const key = dateKey(new Date(year, month, dayNumber, 12));
    cells.push(calendarCell(key, dayNumber, currentDate));
  }
  return cells.join('');
}
function calendarWeekGrid(date, currentDate) {
  const start = shift(date, -((parseDate(date).getDay() + 6) % 7));
  return Array.from({length:7}, (_, index) => { const key = shift(start, index); return calendarCell(key, parseDate(key).getDate(), currentDate); }).join('');
}
function calendarYearGrid(year, currentDate) {
  return Array.from({length:12}, (_, month) => `<div class="calendar-mini-month"><strong>${month + 1}월</strong><div class="calendar-mini-grid">${calendarMonthGrid(year, month, currentDate)}</div></div>`).join('');
}
function calendarView() {
  const selected = parseDate(state.date);
  const currentDate = dateKey(new Date());
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const mode = state.calendarMode || 'month';
  const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
  const grid = mode === 'year' ? calendarYearGrid(year, currentDate) : mode === 'week' ? calendarWeekGrid(state.date, currentDate) : calendarMonthGrid(year, month, currentDate);
  const day = typeof dayWithFixedMoney==='function'?dayWithFixedMoney(state.date):Repository.getDay(state.date);
  const done = day.work.filter(item => item.recurrenceType !== 'recurring' && item.done).length;
  const minutes = day.growth.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const expense = day.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const income = day.income.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const notes = day.notes || [];
  const records = [
    `업무 완료 ${done}개 / ${day.work.filter(item => item.recurrenceType !== 'recurring').length}개`,
    `배움 ${Math.floor(minutes / 60)}시간 ${minutes % 60}분`,
    `소비 ${won(expense)}원 · 수입 ${won(income)}원`,
    `메모 ${notes.length}개`
  ];
  const entries = [
    ...day.work.filter(item => item.recurrenceType !== 'recurring').map(item => ({label: item.done ? '완료한 업무' : '업무', title: item.title})),
    ...day.growth.map(item => ({label: '배움', title: item.title})),
    ...day.expenses.map(item => ({label: '소비', title: `${item.title} · ${won(item.amount)}원` })),
    ...day.income.map(item => ({label: '수입', title: `${item.title} · ${won(item.amount)}원` }))
  ];
  const title = mode === 'year' ? `${year}년` : mode === 'week' ? `${state.date.replaceAll('-', '.')} 주` : `${year}.${String(month + 1).padStart(2, '0')}`;
  return `<section class="card calendar-card"><div class="card-head"><div class="card-title"><span class="section-icon">${svg('calendar')}</span><h2>${title}</h2></div><div class="calendar-month-controls"><div class="calendar-view-switcher" role="group" aria-label="달력 보기"><button type="button" class="${mode==='year'?'active':''}" data-calendar-mode="year">년</button><button type="button" class="${mode==='month'?'active':''}" data-calendar-mode="month">월</button><button type="button" class="${mode==='week'?'active':''}" data-calendar-mode="week">주</button></div><button type="button" class="outline calendar-today-button" data-calendar-today>오늘</button><button type="button" class="icon-btn" data-calendar-nav="-1" aria-label="이전">‹</button><button type="button" class="icon-btn" data-calendar-nav="1" aria-label="다음">›</button></div></div><div class="calendar-search"><label for="calendar-search-input">기록 검색</label><input id="calendar-search-input" data-calendar-search type="search" value="${esc(state.calendarQuery || '')}" placeholder="메모·일정 검색…" autocomplete="off"></div><div class="calendar-search-results" data-calendar-search-results>${calendarSearchResults(state.calendarQuery)}</div><div class="calendar-legend"><span><span class="calendar-today-legend-mark" aria-hidden="true"></span> 오늘</span><span><i class="calendar-legend-color holiday"></i> 공휴일</span><span><i class="calendar-legend-color event"></i> 일정</span><span><i class="calendar-legend-color money-income"></i> 수입</span><span><i class="calendar-legend-color money-expense"></i> 소비</span></div><div class="calendar-weekdays">${weekdays.map(name => `<span>${name}</span>`).join('')}</div><div class="calendar-grid calendar-grid-${mode}">${grid}</div></section><section class="card calendar-day-summary"><div class="card-head"><div><h2>${state.date.replaceAll('-', '.')} 기록</h2><p class="muted">날짜를 눌러 그날의 업무·배움·소비 기록을 확인하세요.</p></div><span class="pill">${state.date === currentDate ? '오늘' : '선택한 날짜'}</span></div><div class="calendar-record-list">${records.map(record => `<div><span>${record}</span></div>`).join('')}</div>${entries.length ? `<div class="calendar-entries"><strong>기록 내용</strong>${entries.map(entry => `<div class="calendar-entry"><span class="pill">${entry.label}</span><span>${esc(entry.title)}</span></div>`).join('')}</div>` : ''}${notes.length ? `<div class="calendar-notes"><strong>메모</strong>${notes.map(note => `<button type="button" class="calendar-note" data-note-view="${esc(note.id)}"><span>${esc(note.title)}</span><small>${esc(note.createdAt || state.date)}</small></button>`).join('')}</div>` : '<p class="empty">이 날짜에는 메모가 없어요.</p>'}</section>`;
}

