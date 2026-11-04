/* 실제판(11/3): 익명 사용 횟수 + 공고 출구는 비번 뒤 공고봇 실제 목록 + (11/4) 규정 묻기.
   서버(실제판 Code.gs·Rg.gs)에 부르는 것은 여섯뿐: recordUse · getStats · liveLogin · liveNotices · rgAsk · rgInfo — 모두 gasRun() 한 곳에서 꺼낸다.
   규정 질문은 답을 만들 때만 서버·구글 무료 AI로 가고 저장하지 않는다(서버는 횟수만 셈). */
function gasRun(){ try{ if(typeof google === 'undefined' || !google.script) return null; return google.script.run || null; }catch(e){ return null; } }
function showStat(s){ const el = $('#stat'); if(!el || !s) return; const n = Number(s.ask || 0) + Number(s.exit || 0) + Number(s.plan || 0) + Number(s.after || 0); el.textContent = 'AI 작동판 · 사용 ' + n + '회'; }
function countUse(kind){ const g = gasRun(); if(!g) return; if(kind !== 'ask' && kind !== 'exit' && kind !== 'plan' && kind !== 'after') return; try{ g.withSuccessHandler(showStat).withFailureHandler(function(){}).recordUse(kind); }catch(e){} }
function loadStats(){ const g = gasRun(); if(!g) return; try{ g.withSuccessHandler(showStat).withFailureHandler(function(){}).getStats(); }catch(e){} }

/* ── 공고 출구: 비번 → 공고봇 실제 목록 (목록 그리기는 notice_view.js — 빌드가 이 파일 앞에 붙임) ── */
let LV_TOKEN = '';          /* 입장권 — 화면 메모리에만(창을 닫으면 사라짐, 브라우저에 저장하지 않음) */
const LV_CID = Math.random().toString(36).slice(2) + Date.now().toString(36);   /* 틀린 횟수 세기용 무작위 번호 */
function renderLiveMail(){
  if(!LV_TOKEN) return lvGate('');
  if(!LV_DATA){ $('#mail').innerHTML = lvHead('[연구공고] 공고봇이 모은 실제 공고', '불러오는 중…') + '<div class="mb"><div class="lvempty">잠시만요…</div></div>'; return lvLoad(); }
  lvList();
}
function lvGate(msg){
  $('#mail').innerHTML = lvHead('[연구공고] 공고봇이 매일 모은 실제 공고', '연구진흥과에서 받은 비번을 넣으면 열립니다 · 한 번 넣으면 6시간')
    + '<div class="mb lvgate"><form onsubmit="return lvTry()" autocomplete="off">'
    + '<input id="lv-pw" type="password" maxlength="100" placeholder="비번" aria-label="비번">'
    + '<button type="submit" id="lv-btn">열기</button></form>'
    + '<div class="lvmsg" id="lv-msg" role="status">' + esc(msg || '') + '</div></div>';
}
function lvTry(){
  const pw = $('#lv-pw').value;
  if(!pw){ $('#lv-msg').textContent = '비번을 넣어 주세요.'; return false; }
  const g = gasRun();
  if(!g){ $('#lv-msg').textContent = '이 화면은 AI 작동판 주소에서만 열립니다.'; return false; }
  $('#lv-btn').disabled = true; $('#lv-msg').textContent = '확인 중…';
  g.withSuccessHandler(function(r){
    $('#lv-pw').value = '';
    if(!r || !r.ok){ lvGate((r && r.msg) || '열지 못했습니다.'); return; }
    LV_TOKEN = r.token; LV_DATA = null; renderLiveMail();
  }).withFailureHandler(function(){ lvGate('연결이 잠시 안 됩니다. 조금 뒤 다시 해 주세요.'); }).liveLogin(pw, LV_CID);
  return false;
}
function lvLoad(){
  const g = gasRun(); if(!g) return lvGate('이 화면은 AI 작동판 주소에서만 열립니다.');
  g.withSuccessHandler(function(r){
    if(!r || !r.ok){ if(r && r.expired) LV_TOKEN = ''; lvGate((r && r.msg) || '공고를 불러오지 못했습니다.'); return; }
    LV_DATA = r; lvList();
  }).withFailureHandler(function(){ lvGate('공고를 잠시 불러오지 못했습니다. 조금 뒤 다시 해 주세요.'); }).liveNotices(LV_TOKEN);
}

/* ── 규정 묻기(11/4): 답 그리기는 ask_view.js, 여기는 묻는 길만 ── */
function cgAskSend(q){
  return new Promise(function(res, rej){
    const g = gasRun(); if(!g) return rej(new Error('no server'));
    g.withSuccessHandler(res).withFailureHandler(rej).rgAsk(q, LV_CID, LV_TOKEN);   /* 비번을 넣었으면 비번 몫(하루 300)으로 */
  });
}
function cgInfoSend(){
  return new Promise(function(res, rej){
    const g = gasRun(); if(!g) return rej(new Error('no server'));
    g.withSuccessHandler(res).withFailureHandler(rej).rgInfo(LV_CID, LV_TOKEN);
  });
}
