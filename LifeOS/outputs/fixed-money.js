// Future occurrences are plans; due occurrences are calculated into actual totals automatically.
const fixedMoneyDialog = document.createElement('dialog');
fixedMoneyDialog.className = 'fixed-money-dialog';
fixedMoneyDialog.setAttribute('aria-labelledby', 'fixed-money-title');
fixedMoneyDialog.innerHTML = `<form id="fixed-money-form">
  <div class="modal-head"><h2 id="fixed-money-title">고정 거래 추가</h2><button type="button" data-fixed-close aria-label="닫기">✕</button></div>
  <p class="muted fixed-money-help">미래 날짜에는 캘린더에 예정으로 표시되고, 해당 날짜가 되면 자동으로 수입·소비에 반영됩니다.</p>
  <div class="form-grid">
    <label>구분<select name="kind" required><option value="expense">고정 지출</option><option value="income">고정 수입</option></select></label>
    <label>내용<input name="title" maxlength="100" required placeholder="예: 월세, 월급"></label>
    <label>금액 (원)<input name="amount" type="number" min="1" max="999999999999" step="1" required></label>
    <label>반복 주기<select name="frequency" required><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>
    <label>시작 날짜<input name="startDate" type="date" min="1900-01-01" max="2100-12-31" required></label>
    <label class="fixed-money-category">소비 카테고리<select name="category"><option>식비</option><option>교통</option><option>생활</option><option selected>기타</option></select></label>
  </div>
  <p class="muted fixed-money-hint">매주는 시작 날짜의 요일, 매월은 같은 날짜에 반복됩니다. 29~31일이 없는 달은 마지막 날에 표시됩니다.</p>
  <div class="modal-actions"><button type="button" class="outline" data-fixed-close>취소</button><button type="submit" class="primary">고정 거래 저장</button></div>
</form>`;
document.body.append(fixedMoneyDialog);

const fixedMoneyFrequencyLabel = {daily:'매일',weekly:'매주',monthly:'매월'};
function fixedMoneyRules(){
  const rules=Repository.data?.motivation?.fixedMoneyRules;
  return Array.isArray(rules)?rules:[];
}
function fixedMoneyToday(){return dateKey(new Date())}
function fixedMoneyDayNumber(date){
  return Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1,Number(date.slice(8,10)))/86400000;
}
function fixedMoneyBounds(rule,from,to){
  const first=[rule.startDate,from].sort().at(-1);
  const last=[to,rule.endDate||'2100-12-31'].sort()[0];
  return validDate(first)&&validDate(last)&&first<=last?{first,last}:null;
}
function fixedMoneyOccurs(rule,date){
  if(!['income','expense'].includes(rule.kind)||!fixedMoneyFrequencyLabel[rule.frequency]||!validDate(rule.startDate)||!validDate(date))return false;
  if(!fixedMoneyBounds(rule,date,date))return false;
  if(rule.frequency==='daily')return true;
  if(rule.frequency==='weekly')return (fixedMoneyDayNumber(date)-fixedMoneyDayNumber(rule.startDate))%7===0;
  const lastDay=new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate();
  return Number(date.slice(8,10))===Math.min(Number(rule.startDate.slice(8,10)),lastDay);
}
function fixedMoneyDates(rule,from,to){
  const bounds=fixedMoneyBounds(rule,from,to);
  if(!bounds||!validDate(rule.startDate)||!fixedMoneyFrequencyLabel[rule.frequency])return [];
  const dates=[];
  if(rule.frequency==='daily'){
    for(let date=bounds.first;date<=bounds.last;date=shift(date,1))dates.push(date);
  }else if(rule.frequency==='weekly'){
    const startDay=fixedMoneyDayNumber(rule.startDate),firstDay=fixedMoneyDayNumber(bounds.first);
    const offset=(7-(firstDay-startDay)%7)%7;
    for(let date=shift(bounds.first,offset);date<=bounds.last;date=shift(date,7))dates.push(date);
  }else{
    const start=parseDate(rule.startDate),cursor=new Date(start.getFullYear(),start.getMonth(),1,12);
    while(dateKey(cursor).slice(0,7)<=bounds.last.slice(0,7)){
      const year=cursor.getFullYear(),month=cursor.getMonth();
      const day=Math.min(start.getDate(),new Date(year,month+1,0).getDate());
      const date=dateKey(new Date(year,month,day,12));
      if(date>=bounds.first&&date<=bounds.last)dates.push(date);
      cursor.setMonth(month+1);
    }
  }
  return dates;
}
function fixedMoneyConfirmed(){
  const confirmed=new Map();
  for(const [recordDate,day] of Object.entries(Repository.data.days)){
    for(const record of [...(day.income||[]),...(day.expenses||[])]){
      if(record.fixedRuleId&&record.fixedDueDate)confirmed.set(`${record.fixedRuleId}|${record.fixedDueDate}`,recordDate);
    }
  }
  return confirmed;
}
function fixedMoneyRecord(rule,date){
  return {id:`fixed-${rule.id}-${date}`,fixedRuleId:rule.id,fixedDueDate:date,fixedFrequency:rule.frequency,fixedVirtual:true,title:rule.title,amount:Number(rule.amount),category:rule.kind==='expense'?rule.category||'기타':undefined};
}
function fixedMoneyForDay(date,kind){
  if(date>fixedMoneyToday())return [];
  const confirmed=fixedMoneyConfirmed();
  return fixedMoneyRules().filter(rule=>rule.kind===kind&&fixedMoneyOccurs(rule,date)&&!confirmed.has(`${rule.id}|${date}`)).map(rule=>fixedMoneyRecord(rule,date));
}
function dayWithFixedMoney(date){
  const day=Repository.getDay(date);
  return {...day,expenses:[...day.expenses,...fixedMoneyForDay(date,'expense')],income:[...day.income,...fixedMoneyForDay(date,'income')]};
}
function fixedMoneyTotal(kind,from,to){
  const last=[to,fixedMoneyToday()].sort()[0],confirmed=fixedMoneyConfirmed();
  return fixedMoneyRules().filter(rule=>rule.kind===kind).reduce((sum,rule)=>sum+fixedMoneyDates(rule,from,last).filter(date=>!confirmed.has(`${rule.id}|${date}`)).length*Number(rule.amount||0),0);
}
function fixedMoneyMonthEnd(month){
  const first=parseDate(`${month}-01`);
  return dateKey(new Date(first.getFullYear(),first.getMonth()+1,0,12));
}
const incomeTotalBeforeFixedMoney=incomeTotal;
incomeTotal=function(){return incomeTotalBeforeFixedMoney()+fixedMoneyTotal('income','1900-01-01',fixedMoneyToday())};
const expenseTotalBeforeFixedMoney=expenseTotal;
expenseTotal=function(){return expenseTotalBeforeFixedMoney()+fixedMoneyTotal('expense','1900-01-01',fixedMoneyToday())};
const monthlyIncomeBeforeFixedMoney=monthlyIncome;
monthlyIncome=function(date){return monthlyIncomeBeforeFixedMoney(date)+fixedMoneyTotal('income',`${date.slice(0,7)}-01`,fixedMoneyMonthEnd(date.slice(0,7)))};
const monthlyExpensesBeforeFixedMoney=monthlyExpenses;
monthlyExpenses=function(date){return monthlyExpensesBeforeFixedMoney(date)+fixedMoneyTotal('expense',`${date.slice(0,7)}-01`,fixedMoneyMonthEnd(date.slice(0,7)))};
const moneyHistoryRecordsBeforeFixedMoney=moneyHistoryRecords;
moneyHistoryRecords=function(days,kind,scope,date){
  const original=moneyHistoryRecordsBeforeFixedMoney(days,kind,scope,date);
  const from=scope==='month'?`${date.slice(0,7)}-01`:'1900-01-01';
  const to=scope==='month'?fixedMoneyMonthEnd(date.slice(0,7)):fixedMoneyToday();
  const confirmed=fixedMoneyConfirmed();
  const automatic=fixedMoneyRules().filter(rule=>rule.kind===kind).flatMap(rule=>fixedMoneyDates(rule,from,[to,fixedMoneyToday()].sort()[0]).filter(day=>!confirmed.has(`${rule.id}|${day}`)).map(day=>({date:day,record:fixedMoneyRecord(rule,day)})));
  return [...original,...automatic].sort((a,b)=>b.date.localeCompare(a.date));
};
const moneyListBeforeFixedMoney=moneyList;
moneyList=function(day,kind,title){
  if(!day[collection(kind)].some(record=>record.fixedVirtual))return moneyListBeforeFixedMoney(day,kind,title);
  const rows=day[collection(kind)];
  const content=rows.map(record=>{
    const automatic=record.fixedVirtual===true;
    const meta=automatic?`고정 · ${fixedMoneyFrequencyLabel[record.fixedFrequency]}`:kind==='expense'?(record.category||'기타 소비'):'선택 날짜에 발생한 수입';
    const action=automatic?`<button class="edit" data-fixed-manage="${esc(record.fixedRuleId)}" aria-label="${esc(record.title)} 고정 설정 보기">고정 설정</button>`:
      `<button class="edit" data-edit="${esc(record.id)}" data-kind="${kind}" aria-label="${esc(record.title)} 수정">수정</button><button class="delete-inline" data-remove="${esc(record.id)}" data-kind="${kind}" aria-label="${esc(record.title)} 삭제">×</button>`;
    return `<div class="task"><div class="task-body"><div class="task-title">${esc(record.title)}</div><div class="task-meta">${meta}</div></div><span class="list-amount">${won(record.amount)}원</span>${action}</div>`;
  }).join('')||empty(kind,'아직 기록이 없어요.');
  return `<section class="card">${cardHead('money',title,false)}${content}<div class="card-foot"><span>${kind==='expense'?'선택 날짜에 기록한 소비만 합산해요.':'해당 날짜의 수입만 합산해요.'}</span><button class="text-btn" data-add="${kind}">＋ 추가</button></div></section>`;
};
function fixedMoneyRulesView(){
  const rules=fixedMoneyRules().slice().sort((a,b)=>b.startDate.localeCompare(a.startDate));
  const content=rules.map(rule=>{
    const status=rule.endDate?'중단':rule.startDate>fixedMoneyToday()?'시작 예정':'진행 중';
    const line=`${rule.kind==='income'?'수입':'소비'} · ${fixedMoneyFrequencyLabel[rule.frequency]||'반복'} · ${rule.startDate} 시작${rule.endDate?` · ${rule.endDate}까지`:''}`;
    return `<div class="fixed-money-row"><div><strong>${esc(rule.title)}</strong><small>${esc(line)} · ${status}</small></div><span>${rule.kind==='income'?'+':'−'} ${won(rule.amount)}원</span><div class="fixed-money-actions">${rule.endDate?'':`<button class="text-btn" data-fixed-stop="${esc(rule.id)}">중단</button>`}<button class="text-btn" data-fixed-delete="${esc(rule.id)}">삭제</button></div></div>`;
  }).join('')||'<p class="empty">설정한 고정 수입·지출이 없어요.</p>';
  return `<section class="card fixed-money-card"><div class="card-head"><div><h2>고정 수입·지출</h2><p class="muted">미래 날짜는 캘린더에 예정으로 표시하고, 날짜가 되면 자동 반영합니다.</p></div></div><div class="fixed-money-add"><button class="outline" data-fixed-add="income">＋ 고정 수입</button><button class="outline" data-fixed-add="expense">＋ 고정 지출</button></div><div class="fixed-money-rules">${content}</div></section>`;
}
const renderBeforeFixedMoney=render;
render=function(){
  renderBeforeFixedMoney();
  if(state.view==='money')document.querySelector('#content .view')?.insertAdjacentHTML('beforeend',fixedMoneyRulesView());
};
function fixedMoneyCategoryVisibility(){
  const expense=fixedMoneyDialog.querySelector('select[name="kind"]').value==='expense';
  const label=fixedMoneyDialog.querySelector('.fixed-money-category');
  label.hidden=!expense;
  label.querySelector('select').disabled=!expense;
}
function openFixedMoneyDialog(kind){
  const form=fixedMoneyDialog.querySelector('form');
  form.reset();
  form.elements.kind.value=kind;
  form.elements.startDate.value=fixedMoneyToday();
  fixedMoneyDialog.querySelector('#fixed-money-title').textContent=kind==='income'?'고정 수입 추가':'고정 지출 추가';
  fixedMoneyCategoryVisibility();
  fixedMoneyDialog.showModal();
}
function saveFixedMoneyRules(){
  Repository.save();
  syncCategoriesToSupabase();
  render();
}
document.addEventListener('click',event=>{
  const add=event.target.closest('[data-fixed-add]');
  if(add){openFixedMoneyDialog(add.dataset.fixedAdd);return}
  const manage=event.target.closest('[data-fixed-manage]');
  if(manage){document.querySelector('.fixed-money-card')?.scrollIntoView({behavior:'smooth',block:'center'});return}
  const stop=event.target.closest('[data-fixed-stop]');
  if(stop){const rule=fixedMoneyRules().find(item=>item.id===stop.dataset.fixedStop);if(!rule)return;rule.endDate=fixedMoneyToday();saveFixedMoneyRules();toast('오늘 이후의 예정 내역을 중단했어요.');return}
  const remove=event.target.closest('[data-fixed-delete]');
  if(remove){const rules=fixedMoneyRules(),index=rules.findIndex(item=>item.id===remove.dataset.fixedDelete);if(index<0)return;if(!window.confirm('이 고정 거래 설정을 삭제할까요? 자동 계산된 과거 내역도 사라집니다. 직접 확인해 저장한 기록은 남습니다.'))return;rules.splice(index,1);saveFixedMoneyRules();toast('고정 거래 설정을 삭제했어요.');return}
  if(event.target.closest('[data-fixed-close]'))fixedMoneyDialog.close();
});
fixedMoneyDialog.querySelector('select[name="kind"]').addEventListener('change',fixedMoneyCategoryVisibility);
fixedMoneyDialog.querySelector('form').addEventListener('submit',event=>{
  event.preventDefault();
  const values=Object.fromEntries(new FormData(event.currentTarget));
  const title=String(values.title||'').trim(),amount=Number(values.amount),startDate=String(values.startDate||'');
  if(!title||!Number.isSafeInteger(amount)||amount<1||amount>999999999999||!validDate(startDate)||!['income','expense'].includes(values.kind)||!fixedMoneyFrequencyLabel[values.frequency]){toast('내용, 금액, 반복 주기와 시작 날짜를 확인해 주세요.');return}
  const settings=Repository.data.motivation ||= {};
  const rules=settings.fixedMoneyRules ||= [];
  rules.push({id:`fm-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,kind:values.kind,title,amount,frequency:values.frequency,startDate,category:values.kind==='expense'?values.category||'기타':null});
  fixedMoneyDialog.close();
  saveFixedMoneyRules();
  toast('고정 거래를 저장했어요. 캘린더에서 예정 날짜를 확인할 수 있어요.');
});
window.addEventListener('lifeos-auth',()=>{if(fixedMoneyDialog.open)fixedMoneyDialog.close();render()});
let fixedMoneyRenderedDate=fixedMoneyToday();
function refreshFixedMoneyDate(){
  const current=fixedMoneyToday();
  if(current===fixedMoneyRenderedDate)return;
  const previous=fixedMoneyRenderedDate;
  fixedMoneyRenderedDate=current;
  today=current;
  if(state.date===previous)state.date=current;
  render();
}
setInterval(refreshFixedMoneyDate,60000);
window.addEventListener('focus',refreshFixedMoneyDate);
render();
