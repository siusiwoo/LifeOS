// Each saved activity is credited once; deleting/editing it never removes earned trees.
let treeTab = 'current';
let treePage = 0;
function rememberGrowth() {
  const settings = Repository.data.motivation ||= {};
  const events = settings.treeEvents ||= {};
  let changed = false;
  for (const [date, day] of Object.entries(Repository.data.days)) {
    if (date > today) continue;
    for (const kind of ['work','expenses','growth']) {
      for (const record of day[kind] || []) {
        if (!record.id || (kind === 'work' && !record.done)) continue;
        const key = JSON.stringify([date,kind,record.id]);
        if (Object.hasOwn(events,key)) continue;
        events[key] = {kind,date,title:String(record.title || '')};
        changed = true;
      }
    }
  }
  if (changed) { Repository.save(); syncCategoriesToSupabase(); }
}
function treeSummary(settings = {}) {
  const events = Object.values(settings.treeEvents || {});
  const total = events.length;
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


function treeView() {
  const m = treeSummary(Repository.data.motivation);
  const next = m.stages[m.stage+1];
  const tabs = `<div class="tree-tabs" aria-label="나무 보기 선택"><button type="button" data-tree-tab="current" aria-pressed="${treeTab==='current'}">현재 나무 보기</button><button type="button" data-tree-tab="forest" aria-pressed="${treeTab==='forest'}">나무 갯수 보기 · ${m.completed}그루</button></div>`;
  if (treeTab === 'forest') {
    const pages = Math.max(1,Math.ceil(m.completed/24));
    treePage = Math.max(0,Math.min(treePage,pages-1));
    const first = treePage*24, count = Math.min(24,m.completed-first);
    return `${tabs}<section class="card forest-card"><div class="card-head"><h2>내가 키운 숲</h2><span class="pill">완성한 나무 ${m.completed}그루</span></div><p class="muted">한 그루마다 작은 실천 100개가 담겨 있어요.</p>${m.completed?`<div class="forest-grid">${Array.from({length:count},(_,i)=>`<figure>${growthTree(4)}<figcaption>${first+i+1}번째 나무</figcaption></figure>`).join('')}</div>`:'<div class="empty">아직 완성한 나무가 없어요.<br>지금 키우는 첫 나무가 다 자라면 이곳에 심어져요.</div>'}${pages>1?`<div class="tree-pagination"><button class="outline" data-tree-page="${treePage-1}" ${treePage===0?'disabled':''}>이전</button><span>${treePage+1} / ${pages}</span><button class="outline" data-tree-page="${treePage+1}" ${treePage===pages-1?'disabled':''}>다음</button></div>`:''}</section>`;
  }
  const labels = {work:'해야 할 일을 완료했어요',expenses:'소비를 기록했어요',growth:'배움을 기록했어요'};
  const recent = m.events.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  return `${tabs}<section class="card motivation-card tree-current"><div class="motivation-tree">${growthTree(m.stage)}<strong>${m.completed+1}번째 나무 · ${m.stages[m.stage].name}</strong><span>${m.completed?'새 씨앗도 천천히 키워봐요.':'작은 실천으로 첫 씨앗을 키워봐요.'}</span></div><div class="motivation-body"><div class="card-head"><h2>천천히 자라는 나의 나무</h2><span class="pill">누적 실천 ${m.total}개</span></div><p class="motivation-message">${next?`${next.name}까지 실천 ${next.at-m.progress}개 남았어요.`:`나무 완성까지 실천 ${100-m.progress}개 남았어요.`}</p><div class="weekly-numbers"><span>이 나무와 함께한 실천</span><strong>${m.progress} / 100</strong></div><div class="weekly-track" role="progressbar" aria-label="현재 나무 성장" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.progress}"><i style="width:${m.progress}%"></i></div><p class="motivation-help">업무 완료 · 소비 기록 · 배움 기록마다 한 걸음.<br>시간과 금액에 관계없이 각 기록은 한 번만 반영돼요.<br>실천 100개로 나무를 완성하면 새 씨앗이 시작돼요.<br>쉬는 날에도, 기록을 수정하거나 지워도 키운 나무는 남아요.</p></div></section><section class="card"><div class="card-head"><h2>나무를 키운 기록</h2></div>${recent.length?`<ul class="tree-history">${recent.map(e=>`<li><div><strong>${labels[e.kind]||'실천을 기록했어요'}</strong><p>${esc(e.title)}</p></div><time>${esc(e.date)}</time><span class="pill">+1</span></li>`).join('')}</ul>`:'<p class="empty">업무를 완료하거나 소비·배움을 기록하면 나무가 자라요.</p>'}</section>`;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.treeTab){treeTab=button.dataset.treeTab;treePage=0;render();}
  if(button.dataset.treePage!==undefined){treePage=Number(button.dataset.treePage);render();}
});
