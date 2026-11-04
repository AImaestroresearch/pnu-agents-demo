/* 규정 묻기 답 화면(공개판·실제판 같이 씀, 11/4). 묻는 길(cgAskSend·cgInfoSend)은 판마다 다르다:
   공개판 = 창구 서버 주소로 보내기(public_part.js) · 실제판 = 같은 웹 앱 안에서 rgAsk·rgInfo 부르기(live_part.js). */
(function(){
  try{
    const st = document.createElement('style');
    st.textContent = '.cgsrc{margin-top:12px}.cgsrc>b{display:block;font-size:12.5px;color:var(--ink2);margin-bottom:4px}'
      + '.cgsrc details{border-top:1px solid var(--line);padding:7px 0;font-size:13px}.cgsrc summary{cursor:pointer;color:var(--glow)}'
      + '.cgsrc .t{white-space:pre-wrap;word-break:break-all;margin-top:6px;font-size:12.5px;line-height:1.65;color:var(--ink2);max-height:260px;overflow:auto}'
      + '.cgwait{color:var(--ink2);font-size:13.5px}'
      + '.cgq{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(77,208,255,.07);border:1px solid rgba(77,208,255,.28);font-size:12.8px;line-height:1.7;color:var(--ink2)}'
      + '.cgq b{color:var(--ink)}.cgq .n{font-variant-numeric:tabular-nums;font-weight:800;color:var(--ink)}'
      + '.cgstat{margin:14px 0 4px}.cgstat:empty{display:none}'
      + '.cgapi{margin-top:10px;font-size:13px;line-height:1.7;color:var(--ink2)}.cgapi summary{cursor:pointer;color:var(--glow);font-weight:700}'
      + '.cgapi ol{margin:6px 0 4px;padding-left:20px}.cgapi li{margin:4px 0;list-style:decimal}.cgapi a{color:var(--glow);font-weight:700}'
      + '.cgno{margin-top:4px;padding:12px 14px;border-radius:12px;background:rgba(255,194,75,.08);border:1px solid rgba(255,194,75,.4);font-size:13.6px;line-height:1.7;color:var(--ink)}';
    document.head.appendChild(st);
  }catch(e){}
})();
/* 못 찾음·연결 안 됨: 공개판은 직접 만드는 길 + 「없다」 예시(realNone), 실제판은 짧은 안내 */
function cgNoneCard(kind, msg, q){
  if(typeof realNone === 'function') return realNone(kind, msg, q);
  return '<div class="card"><div class="in none"><b>' + (kind === 'none' ? '넣어 둔 공개 규정에서 찾지 못했습니다' : '지금은 서버에 닿지 않습니다') + '</b><p>'
    + esc(kind === 'none' ? (msg || '이 질문에 답하려면 관련 규정을 더 넣어야 합니다. 연구진흥과에 문의해 주세요.') : '조금 뒤 다시 해 주세요.') + '</p></div></div>';
}
/* ── 규정 묻기 ── */
let CG_BUSY = false;
function cgText(s){
  let html = '', inList = false;
  String(s || '').split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const li = /^[-*•]\s+/.test(l);
    const t = esc(l.replace(/^[-*•]\s+/, '').replace(/^#+\s*/, '')).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[(\d{1,2}(?:\s*[,，]\s*\d{1,2})*)\]/g, (_, g) => g.split(/[,，]/).map(n => '<sup>' + n.trim() + '</sup>').join(''));
    if(li){ if(!inList){ html += '<ul>'; inList = true; } html += '<li>' + t + '</li>'; return; }
    if(inList){ html += '</ul>'; inList = false; }
    html += '<p>' + t + '</p>';
  });
  return html + (inList ? '</ul>' : '');
}
function cgCut(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n) + ' …' : s; }
function cgSources(list, openFirst, title){
  if(!list || !list.length) return '';
  return '<div class="cgsrc"><b>' + esc(title || '근거로 쓴 공개 규정 원문 (작은 숫자 = 답에 붙은 번호)') + '</b>'
    + list.map((x, i) => '<details' + (openFirst && i === 0 ? ' open' : '') + '><summary><sup>' + esc(Number(x.n) || i + 1) + '</sup> '
      + esc(x.doc) + (Number(x.page) ? ' · ' + esc(Number(x.page)) + '쪽' : '') + '</summary><div class="t">' + esc(cgCut(x.text, 1200)) + '</div></details>').join('')
    + '</div>';
}
/* 11/4 근수님: 답할 수 없으면 억지로 만들지 말고 「못 한다 + 이런 규정이 더 필요하다」. 서버가 notFound 를 붙여 준다 */
function cgCard(q, r, sec){
  if(!r || !r.ok) return '<div class="card"><div class="in stop">' + esc((r && r.msg) || '답을 받지 못했습니다. 조금 뒤 다시 해 주세요.') + '</div></div>';
  if(r.mode === 'none') return cgNoneCard('none', r.msg);
  const ai = r.mode === 'ai', no = ai && r.notFound;
  const limited = /내일 다시|다 쓰셨|다 쓰였|1분 뒤/.test(String(r.msg || ''));
  return '<div class="card rule real"><div class="in"><div class="h"><i></i>' + (no ? '답할 수 없는 질문' : ai ? '창구 AI 답변' : '관련 조항 원문') + '<span class="stamp">공개 규정 28개 파일</span></div><div class="b">'
    + '<div class="qbub">' + esc(q) + '</div>'
    + (no ? '<div class="cgno">' + cgText(r.answer) + '</div>' : ai ? '<div class="ab">' + cgText(r.answer) + '</div>' : '')
    + (r.msg ? '<div class="chk none">' + esc(r.msg) + '</div>' : '')
    + (no ? cgSources(r.sources, false, '찾아본 조각 (관련이 없어 답에 쓰지 않음)') : cgSources(r.sources, !ai))
    + cgQuota(r, sec)
    + (limited ? cgApiGuide(true) : '')
    + '<div class="meta2">' + (no ? '넣어 둔 규정으로 확인되지 않는 것은 지어내지 않고 「모른다」고 답합니다. 필요한 규정이 공개 자료라면 더 넣어 답하게 할 수 있습니다.'
        : ai ? 'AI 답은 위 원문 조각만 읽고 쓴 참고용입니다. 금액·날짜는 원문으로 꼭 확인하시고, 판단·승인은 담당자와 결재선이 합니다.'
        : 'AI 없이 낱말로 찾은 조항입니다. 판단·승인은 담당자와 결재선이 합니다.') + '</div>'
    + '</div></div></div>';
}
/* 11/4 근수님: 숫자는 정확하게 — 오늘 몇 번 썼고 하루 몇 번까지, 이 창은 몇 번 남았는지, 언제 다시 채워지는지. 서버가 세는 것은 횟수뿐 */
function cgNum(v){ const n = Math.floor(Number(v)); return isFinite(n) && n >= 0 ? n : null; }
function cgFmt(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function cgQuotaLines(r, sec){
  const used = cgNum(r.dayUsed), max = cgNum(r.dayMax), left = cgNum(r.userLeft), umax = cgNum(r.userMax);
  const lines = [];
  if(used != null && max){ const u = Math.min(used, max);
    lines.push('<b>오늘 무료 AI 답' + (r.pool === 'live' ? '(비번 몫)' : '') + '</b> — <span class="n">' + cgFmt(u) + '번</span> 사용 / 하루 <span class="n">' + cgFmt(max) + '번</span> (남은 <span class="n">' + cgFmt(max - u) + '번</span> · 매일 0시에 다시 채워짐)'); }
  if(left != null && umax){ const l = Math.min(left, umax);
    lines.push('<b>이 창</b> — <span class="n">' + cgFmt(umax - l) + '번</span> 사용 / <span class="n">' + cgFmt(umax) + '번</span> (남은 <span class="n">' + cgFmt(l) + '번</span> · 마지막 질문 6시간 뒤 다시 채워짐)'); }
  const s = Number(sec);
  if(sec != null && isFinite(s) && s >= 0) lines.push('답 만드는 데 <span class="n">' + s.toFixed(1) + '초</span>');
  lines.push('적으신 질문은 기록에 남지 않습니다. 답을 만들 때만 구글 무료 AI에 보내고, 창구 서버는 횟수만 셉니다.');
  return lines;
}
function cgQuota(r, sec){ return '<div class="cgq">' + cgQuotaLines(r, sec).join('<br>') + '</div>'; }
/* 11/4 근수님: 무료 한도 안에서 쓰는 데모지만, 직접 만들면 API를 붙여 더 많이 쓸 수 있다는 것까지 */
const CG_HOWTO = 'https://github.com/AImaestroresearch/pnu-agents-demo/blob/main/changgu/source/README.md';
function cgApiGuide(open){
  return '<details class="cgapi"' + (open ? ' open' : '') + '><summary>직접 만들어 더 많이 쓰려면</summary>'
    + '<p>이 창구는 비용 0원으로 돌리려고 <b>결제를 연결하지 않은 무료 AI 키</b>만 씁니다. 그래서 하루 정해진 횟수에서 멈추고, 다음 날 다시 채워집니다.</p><ol>'
    + '<li><b>우리 부서용으로 만들기</b> — 소스를 받아 내 구글 계정의 무료 서버(Apps Script)에 올리고 <b>내 무료 키</b>를 넣으면, 같은 화면이 우리 부서 규정으로 돌아갑니다. 키마다 무료 한도가 따로라 이 창구의 한도와 상관없습니다.</li>'
    + '<li><b>더 많이 쓰기</b> — 키를 만든 프로젝트에 결제를 연결하면(<b>유료 API</b>) 한도가 크게 늘고, 쓴 만큼만 요금이 나옵니다. 구글 약관상 유료 키로 보낸 질문은 AI 개선에 쓰지 않습니다. 쓰기 전에 최신 약관·요금표와 기관 예산·보안 절차를 확인하세요.</li>'
    + '<li><b>더 정확하게 쓰기</b> — 지금은 무료라 <b>가벼운 AI 모델</b>이 질문마다 관련 조각 10개만 읽고 답합니다. 그래서 여러 규정을 한꺼번에 비교하거나, 표가 복잡한 지침을 통째로 읽어야 하는 질문에는 「찾지 못했습니다」가 나올 수 있습니다. '
    + '기관에서 더 큰 모델과 넉넉한 사용량(유료 API·기관 구독)을 갖추면 한 번에 더 많은 규정을 읽고 비교해 답할 수 있습니다. 어디까지 무료로 되고 어디부터 투자가 필요한지 직접 써 보며 판단해 보세요.</li>'
    + '</ol><a href="' + CG_HOWTO + '" target="_blank" rel="noopener noreferrer">소스 받기 · 만드는 법 &#8599;</a></details>';
}
/* 규정 출구 맨 위 숫자판: 열 때 한 번(AI는 안 부름) + 답을 받을 때마다 고쳐 씀 */
let CG_INFO = null;
function cgRenderStat(r){
  const box = $('#cg-stat'); if(!box || !r || !r.ok) return;
  CG_INFO = Object.assign({}, CG_INFO || {}, r);
  const docs = cgNum(CG_INFO.docs), chunks = cgNum(CG_INFO.chunks);
  const lines = cgQuotaLines(CG_INFO);
  if(docs) lines.unshift('<b>넣어 둔 자료</b> — 공개 규정 <span class="n">' + cgFmt(docs) + '개</span> 파일 (찾기 조각 <span class="n">' + cgFmt(chunks || 0) + '개</span>)'
    + (CG_INFO.ai === false ? ' · 지금은 AI 답 없이 조항 원문만' : ''));
  box.innerHTML = '<div class="cgq">' + lines.join('<br>') + '</div>' + cgApiGuide(false);
}
function cgLoadStat(){
  if(typeof cgInfoSend !== 'function') return;
  cgInfoSend().then(cgRenderStat, function(){});
}
function cgAsk(target, q){
  if(CG_BUSY){ toast('앞 질문의 답을 만드는 중입니다'); return; }
  CG_BUSY = true; sjThink(true);
  const t0 = Date.now();
  $(target).innerHTML = '<div class="card rule real"><div class="in"><div class="h"><i></i>창구 서버에 묻는 중<span class="stamp">공개 규정 28개 파일</span></div><div class="b">'
    + '<div class="qbub">' + esc(q) + '</div><div class="cgwait">관련 조항을 찾아 답을 만들고 있습니다… 보통 4~10초 걸립니다.</div></div></div></div>';
  const done = function(html, joy){ CG_BUSY = false; sjThink(false); $(target).innerHTML = html; if(joy) sjMood('joy', 1600); };
  cgAskSend(q)
    .then(function(r){ done(cgCard(q, r, (Date.now() - t0) / 1000), r && r.mode === 'ai' && !r.notFound); if(r && r.ok && r.dayMax) cgRenderStat(r); },
          function(){ done(cgNoneCard('offline', null, q), false); });
}
