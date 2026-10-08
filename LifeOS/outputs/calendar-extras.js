// Calendar plans, reminders, recurring events and personal to-dos.
const calendarEventDialog=document.createElement('dialog');
calendarEventDialog.className='calendar-event-dialog';
calendarEventDialog.setAttribute('aria-labelledby','calendar-event-title');
calendarEventDialog.innerHTML=`<form id="calendar-event-form">
  <div class="modal-head"><h2 id="calendar-event-title">일정 추가</h2><button type="button" data-calendar-close aria-label="닫기">✕</button></div>
  <div class="form-grid">
    <label>종류<select name="kind"><option value="event">일정</option><option value="task">할 일</option></select></label>
    <label>제목<input name="title" maxlength="100" required placeholder="예: 병원 예약, 서류 제출"></label>
    <label>날짜<input name="date" type="date" min="1900-01-01" max="2100-12-31" required></label>
    <label>시간 (선택)<input name="time" type="time"></label>
    <label>반복<select name="repeat"><option value="none">반복 안 함</option><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>
    <label class="calendar-repeat-end" hidden>반복 종료일 (선택)<input name="repeatEnd" type="date" min="1900-01-01" max="2100-12-31"></label>
    <label>알림<select name="reminder"><option value="-1">알림 없음</option><option value="0">정해진 시간에</option><option value="5">5분 전</option><option value="15">15분 전</option><option value="60">1시간 전</option><option value="1440">하루 전</option></select></label>
    <label>메모<textarea name="notes" maxlength="1000" placeholder="장소나 준비할 내용을 적어 두세요."></textarea></label>
  </div>
  <p class="muted calendar-reminder-help">알림은 시간을 입력하고 브라우저 알림을 허용했을 때, 사이트가 열려 있는 동안 받을 수 있습니다.</p>
  <div class="modal-actions"><button type="button" class="outline" data-calendar-close>취소</button><button type="submit" class="primary">저장</button></div>
</form>`;
document.body.append(calendarEventDialog);
const calendarRepeatLabels={none:'일회성',daily:'매일',weekly:'매주',monthly:'매월'};
function calendarEvents(){
  const events=Repository.data?.motivation?.calendarEvents;
  return Array.isArray(events)?events:[];
}
function calendarEventOccurs(item,date){
  if(!validDate(item.date)||!validDate(date)||date<item.date||item.repeatEnd&&date>item.repeatEnd)return false;
  if(item.repeat==='none')return date===item.date;
  if(item.repeat==='daily')return true;
  if(item.repeat==='weekly')return (fixedMoneyDayNumber(date)-fixedMoneyDayNumber(item.date))%7===0;
  if(item.repeat==='monthly'){
    const last=new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate();
    return Number(date.slice(8,10))===Math.min(Number(item.date.slice(8,10)),last);
  }
  return false;
}
function calendarEventsForDay(date){
  return calendarEvents().filter(item=>calendarEventOccurs(item,date)).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.title.localeCompare(b.title));
}
function calendarSaveEvents(){Repository.save();syncCategoriesToSupabase();render()}
function calendarRepeatVisibility(){
  const label=calendarEventDialog.querySelector('.calendar-repeat-end');
  label.hidden=calendarEventDialog.querySelector('[name="repeat"]').value==='none';
}
function calendarOpenEvent(kind='event',id=null){
  const item=id?calendarEvents().find(event=>event.id===id):null;
  if(id&&!item)return;
  const form=calendarEventDialog.querySelector('form');
  form.reset();
  form.dataset.editId=id||'';
  form.elements.kind.value=item?.kind||kind;
  form.elements.title.value=item?.title||'';
  form.elements.date.value=item?.date||state.date;
  form.elements.time.value=item?.time||'';
  form.elements.repeat.value=item?.repeat||'none';
  form.elements.repeatEnd.value=item?.repeatEnd||'';
  form.elements.reminder.value=String(item?.reminder??-1);
  form.elements.notes.value=item?.notes||'';
  calendarEventDialog.querySelector('#calendar-event-title').textContent=id?'일정 수정':kind==='task'?'할 일 추가':'일정 추가';
  calendarRepeatVisibility();
  calendarEventDialog.showModal();
}
function calendarEventRow(item,date){
  const done=item.kind==='task'&&(item.doneDates||[]).includes(date);
  const label=item.time||'종일';
  const repeat=item.repeat&&item.repeat!=='none'?` · ${calendarRepeatLabels[item.repeat]}`:'';
  const note=item.notes?`<small>${esc(item.notes)}</small>`:'';
  const toggle=item.kind==='task'?`<input type="checkbox" data-calendar-task="${esc(item.id)}" data-calendar-date="${date}" aria-label="${esc(item.title)} 완료" ${done?'checked':''}>`:'<span class="calendar-event-dot" aria-hidden="true"></span>';
  return `<div class="calendar-agenda-row ${done?'completed':''}">${toggle}<div class="calendar-agenda-body"><strong>${esc(item.title)}</strong><span>${label}${repeat}${item.kind==='task'?' · 할 일':' · 일정'}</span>${note}</div><div class="calendar-agenda-actions"><button class="text-btn" data-calendar-share="${esc(item.id)}" data-calendar-date="${date}">공유</button><button class="text-btn" data-calendar-edit="${esc(item.id)}">수정</button><button class="text-btn" data-calendar-delete="${esc(item.id)}">삭제</button></div></div>`;
}
function calendarNextFixedDate(rule){
  if(!validDate(rule.startDate)||!['daily','weekly','monthly'].includes(rule.frequency))return null;
  const first=[rule.startDate,shift(fixedMoneyToday(),1)].sort().at(-1);
  if(!validDate(first))return null;
  let next=first;
  if(rule.frequency==='weekly'){
    const offset=(7-(fixedMoneyDayNumber(first)-fixedMoneyDayNumber(rule.startDate))%7)%7;
    next=shift(first,offset);
  }else if(rule.frequency==='monthly'){
    const anchor=Number(rule.startDate.slice(8,10));
    const monthStart=parseDate(`${first.slice(0,7)}-01`);
    const occurrence=value=>dateKey(new Date(value.getFullYear(),value.getMonth(),Math.min(anchor,new Date(value.getFullYear(),value.getMonth()+1,0).getDate()),12));
    next=occurrence(monthStart);
    if(next<first){monthStart.setMonth(monthStart.getMonth()+1);next=occurrence(monthStart)}
  }
  return validDate(next)&&(!rule.endDate||next<=rule.endDate)?next:null;
}
function calendarMoneyAgenda(date){
  const rules=fixedMoneyRules();
  const confirmed=fixedMoneyConfirmed();
  const selected=date<=fixedMoneyToday()?rules.filter(rule=>fixedMoneyOccurs(rule,date)):[];
  const selectedRows=selected.map(rule=>{
    const label=confirmed.has(`${rule.id}|${date}`)?'기록된 거래':`자동 반영 ${rule.kind==='income'?'수입':'소비'}`;
    return `<div class="calendar-money-row"><span class="pill">${label}</span><strong>${esc(rule.title)}</strong><span>${rule.kind==='income'?'+':'−'} ${won(rule.amount)}원</span></div>`;
  }).join('');
  const upcoming=rules.map(rule=>({rule,next:calendarNextFixedDate(rule)})).filter(item=>item.next).sort((a,b)=>a.next.localeCompare(b.next));
  const upcomingRows=upcoming.map(({rule,next})=>`<div class="calendar-money-row"><span class="pill">예정 ${rule.kind==='income'?'수입':'소비'}</span><strong>${esc(rule.title)}<small>${next.replaceAll('-','.')} · ${fixedMoneyFrequencyLabel[rule.frequency]}</small></strong><span>${rule.kind==='income'?'+':'−'} ${won(rule.amount)}원</span></div>`).join('');
  return `<div class="calendar-money-agenda"><div class="calendar-money-head"><h3>고정 수입·소비</h3><div><button class="text-btn" data-fixed-add="income">＋ 고정 수입</button><button class="text-btn" data-fixed-add="expense">＋ 고정 소비</button></div></div>${selectedRows?`<p class="calendar-money-subtitle">선택 날짜에 반영됨</p>${selectedRows}`:''}<p class="calendar-money-subtitle">다가오는 예정</p>${upcomingRows||'<p class="calendar-money-empty">예정된 고정 수입·소비가 없어요.</p>'}</div>`;
}
function calendarAgendaView(date){
  const events=calendarEventsForDay(date);
  return `<section class="card calendar-agenda"><div class="card-head"><div><h2>${date.replaceAll('-','.')} 일정·할 일</h2><p class="muted">이 날짜의 일정과 반복 일정을 관리하세요.</p></div><div class="calendar-agenda-add"><button class="outline" data-calendar-add="event">＋ 일정</button><button class="outline" data-calendar-add="task">＋ 할 일</button></div></div>${events.length?`<div class="calendar-agenda-list">${events.map(item=>calendarEventRow(item,date)).join('')}</div>`:'<p class="empty">이 날짜에 등록한 일정이나 할 일이 없어요.</p>'}${calendarMoneyAgenda(date)}</section>`;
}
const calendarViewBeforeExtras=calendarView;
calendarView=function(){
  const html=calendarViewBeforeExtras();
  return html.replace('<section class="card calendar-day-summary">',`<div class="calendar-right-column">${calendarAgendaView(state.date)}<section class="card calendar-day-summary">`)+'</div>';
};
const renderBeforeCalendarExtras=render;
render=function(){
  renderBeforeCalendarExtras();
  if(state.view!=='calendar')return;
  document.querySelector('.calendar-legend')?.insertAdjacentHTML('beforeend','<span><i class="calendar-event-mark calendar-legend-mark"></i> 일정·할 일</span><span><i class="calendar-money-mark calendar-legend-mark"></i> 예정 수입·소비</span>');
  document.querySelectorAll('.calendar-cell[data-date]').forEach(cell=>{
    const date=cell.dataset.date;
    const eventCount=calendarEventsForDay(date).length;
    const moneyCount=date>fixedMoneyToday()?fixedMoneyRules().filter(rule=>calendarNextFixedDate(rule)===date).length:0;
    if(eventCount||moneyCount)cell.insertAdjacentHTML('beforeend',`<span class="calendar-extra-marks" aria-hidden="true">${eventCount?'<i class="calendar-event-mark"></i>':''}${moneyCount?'<i class="calendar-money-mark"></i>':''}</span>`);
  });
};
async function calendarShare(id,date){
  const item=calendarEvents().find(event=>event.id===id);
  if(!item)return;
  const text=`${item.kind==='task'?'할 일':'일정'}: ${item.title}\n날짜: ${date}${item.time?` ${item.time}`:''}\n반복: ${calendarRepeatLabels[item.repeat]||'일회성'}${item.notes?`\n메모: ${item.notes}`:''}`;
  try{
    if(navigator.share){await navigator.share({title:item.title,text});return}
    await navigator.clipboard.writeText(text);
    toast('일정 내용을 복사했어요. 원하는 곳에 붙여넣어 공유하세요.');
  }catch(error){if(error.name!=='AbortError')toast('공유하지 못했어요. 브라우저의 복사 권한을 확인해 주세요.')}
}
document.addEventListener('click',event=>{
  const add=event.target.closest('[data-calendar-add]');if(add){calendarOpenEvent(add.dataset.calendarAdd);return}
  const edit=event.target.closest('[data-calendar-edit]');if(edit){calendarOpenEvent('event',edit.dataset.calendarEdit);return}
  const remove=event.target.closest('[data-calendar-delete]');if(remove){const events=calendarEvents(),index=events.findIndex(item=>item.id===remove.dataset.calendarDelete);if(index<0)return;if(!window.confirm('이 일정과 반복되는 날짜의 일정을 모두 삭제할까요?'))return;events.splice(index,1);calendarSaveEvents();toast('일정을 삭제했어요.');return}
  const share=event.target.closest('[data-calendar-share]');if(share){calendarShare(share.dataset.calendarShare,share.dataset.calendarDate);return}
  if(event.target.closest('[data-calendar-close]'))calendarEventDialog.close();
});
document.addEventListener('change',event=>{
  if(event.target.matches('#calendar-event-form [name="repeat"]'))calendarRepeatVisibility();
  const toggle=event.target.closest('[data-calendar-task]');
  if(toggle){const item=calendarEvents().find(entry=>entry.id===toggle.dataset.calendarTask);if(!item||item.kind!=='task')return;const dates=item.doneDates ||= [];const index=dates.indexOf(toggle.dataset.calendarDate);if(toggle.checked&&index<0)dates.push(toggle.dataset.calendarDate);if(!toggle.checked&&index>=0)dates.splice(index,1);calendarSaveEvents()}
});
calendarEventDialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,values=Object.fromEntries(new FormData(form)),title=String(values.title||'').trim(),date=String(values.date||''),repeatEnd=String(values.repeatEnd||''),reminder=Number(values.reminder);
  if(!title||!validDate(date)||!['event','task'].includes(values.kind)||!calendarRepeatLabels[values.repeat]||repeatEnd&&(!validDate(repeatEnd)||repeatEnd<date)||![-1,0,5,15,60,1440].includes(reminder)||reminder>=0&&!values.time){toast('날짜와 시간을 확인해 주세요. 알림을 쓰려면 시간을 입력해야 합니다.');return}
  const events=Repository.data.motivation ||= {},list=events.calendarEvents ||= [],old=list.find(item=>item.id===form.dataset.editId);
  const item={id:old?.id||`ce-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,kind:values.kind,title,date,time:values.time||'',repeat:values.repeat,repeatEnd:values.repeat==='none'?'':repeatEnd,reminder,notes:String(values.notes||'').trim(),doneDates:old?.doneDates||[]};
  if(old)Object.assign(old,item);else list.push(item);
  calendarEventDialog.close();
  calendarSaveEvents();
  if(reminder>=0&&'Notification' in window&&Notification.permission==='default'){
    try{await Notification.requestPermission()}catch{}
  }
  toast(old?'일정을 수정했어요.':'일정을 저장했어요.');
});
function calendarCheckReminders(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const now=new Date(),today=dateKey(now),tomorrow=shift(today,1),sentKey='lifeos.calendar.sent.v1';
  let sent={};try{sent=JSON.parse(localStorage.getItem(sentKey)||'{}')}catch{}
  let dirty=false;
  for(const date of [today,tomorrow])for(const item of calendarEventsForDay(date)){
    if(!item.time||item.reminder<0||item.kind==='task'&&(item.doneDates||[]).includes(date))continue;
    const when=new Date(`${date}T${item.time}:00`).getTime()-Number(item.reminder)*60000;
    const key=`${item.id}|${date}|${item.reminder}`;
    if(!sent[key]&&now.getTime()>=when&&now.getTime()<when+600000){
      try{new Notification(item.title,{body:`${date} ${item.time} · ${item.kind==='task'?'할 일':'일정'}`});sent[key]=now.toISOString();dirty=true}catch{}
    }
  }
  if(dirty){const cutoff=Date.now()-14*86400000;sent=Object.fromEntries(Object.entries(sent).filter(([,value])=>new Date(value).getTime()>cutoff));try{localStorage.setItem(sentKey,JSON.stringify(sent))}catch{}}
}
setInterval(calendarCheckReminders,30000);
calendarCheckReminders();
window.addEventListener('lifeos-auth',()=>{if(calendarEventDialog.open)calendarEventDialog.close();render()});
render();
