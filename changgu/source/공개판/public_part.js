/* 공개판(11/4~): 새 질문은 창구 서버(학교 계정의 무료 구글 Apps Script = 실제판 Rg.gs)가
   규정봇과 같은 공개 규정 파일 28개에서 관련 조각을 찾아 무료 AI로 근거 번호를 붙여 답한다.
   서버로 가는 것: 적으신 질문(답을 만들 때만 쓰고 저장하지 않음)과 이 창을 구분하는 무작위 번호뿐 — 이름·로그인 없음.
   공고 목록은 출구 2를 열 때 한 번, 서버가 공고봇 공개 시트에서 읽어 준다. 서버에 닿지 않으면 옮겨 둔 기록으로 돌아간다.
   부르는 문은 CG_API 한 곳(cgPost)뿐. */
const CG_API = '__CG_API__';
const CG_CID = Math.random().toString(36).slice(2) + Date.now().toString(36);   /* 한 사람 한도 세기용 무작위 번호(창을 닫으면 사라짐) */
function countUse(){}
function loadStats(){}
function cgPost(body, ms){
  if(typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const tm = ctl ? setTimeout(function(){ ctl.abort(); }, ms || 30000) : null;
  /* 머리글을 따로 달지 않는다(text/plain) — 그래야 브라우저가 사전 확인 없이 바로 보낸다 */
  return fetch(CG_API, { method: 'POST', body: JSON.stringify(body), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
    .then(function(r){ if(tm) clearTimeout(tm); if(!r.ok) throw new Error('http ' + r.status); return r.json(); },
          function(e){ if(tm) clearTimeout(tm); throw e; });
}

/* 묻는 길: 창구 서버 주소로 (답 그리기는 실제판/ask_view.js — 빌드가 이 파일 앞에 붙임) */
function cgAskSend(q){ return cgPost({ a: 'ask', q: q, cid: CG_CID }, 40000); }
function cgInfoSend(){ return cgPost({ a: 'quota', cid: CG_CID }, 15000); }

/* ── 공고 출구: 공고봇 실제 목록(출구를 열 때 한 번 불러옴) ── */
let CG_NOTICE = 'idle';   /* idle → loading → ok | fail */
function renderPubMail(){
  if(CG_NOTICE === 'ok' && LV_DATA) return lvList();
  if(CG_NOTICE === 'fail' || CG_NOTICE === 'idle') return renderRealMail();
  $('#mail').innerHTML = lvHead('[연구공고] 공고봇이 모은 실제 공고', '공고봇 시트에서 불러오는 중…') + '<div class="mb"><div class="lvempty">잠시만요…</div></div>';
}
function cgLoadNotices(){
  if(CG_NOTICE === 'loading' || CG_NOTICE === 'ok') return;
  CG_NOTICE = 'loading'; renderPubMail();
  cgPost({ a: 'notices' }, 20000).then(function(r){
    if(r && r.ok && r.items && r.items.length){ LV_DATA = { today: r.today, items: r.items }; CG_NOTICE = 'ok'; } else CG_NOTICE = 'fail';
    renderPubMail();
  }, function(){ CG_NOTICE = 'fail'; renderPubMail(); });
}
