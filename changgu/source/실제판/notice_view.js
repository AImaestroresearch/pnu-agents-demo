/* 공고 목록 화면(실제판·공개판 같이 씀, 11/4 live_part.js 에서 떼어 냄). 데이터 LV_DATA = {today, items} 는 각 판이 채운다. */
let LV_DATA = null, LV_TAB = 'open';
(function(){
  try{
    const st = document.createElement('style');
    st.textContent = '.lvgate form{display:flex;gap:8px;margin:14px 0 6px}'
      + '.lvgate input,.lvq{flex:1;width:100%;font:inherit;font-size:16px;padding:11px 13px;border-radius:12px;border:1px solid var(--line);background:rgba(4,9,20,.6);color:var(--ink)}'
      + '.lvgate button{font:inherit;font-weight:800;padding:10px 18px;border-radius:12px;border:0;background:linear-gradient(140deg,var(--glow),var(--pnu-lit));color:#04121F;cursor:pointer}'
      + '.lvgate button:disabled{opacity:.5}.lvmsg{min-height:20px;font-size:13px;color:var(--warn)}'
      + '.lvtabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 10px}'
      + '.lvtabs button{font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink2);cursor:pointer}'
      + '.lvtabs button.on{background:var(--pnu);border-color:var(--pnu-lit);color:#fff}'
      + '.nt .d.off{background:rgba(125,144,171,.35);color:var(--ink2)}'
      + '.nt details{margin-top:6px;font-size:13px}.nt summary{cursor:pointer;color:var(--glow)}'
      + '.nt .files a{display:block;word-break:break-all;color:var(--glow);font-size:12.5px;margin:2px 0}'
      + '.nt .cau{color:var(--warn)}.lvempty{color:var(--muted);font-size:13px;padding:14px 0}';
    document.head.appendChild(st);
  }catch(e){}
})();
function lvAttr(s){ return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }   /* 따옴표까지 막는 주소용 */
function lvSafeUrl(u){ return /^https:\/\/www\.iris\.go\.kr\//.test(String(u || '')) ? String(u) : ''; }
function lvHead(sub, meta){ return '<div class="mh"><div class="subj">' + esc(sub) + '</div><div class="meta">' + esc(meta) + '</div></div>'; }
function lvDday(end, today){ if(!end || !today) return null; return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000); }
function lvAdd(ymd, d){ return new Date(Date.parse(ymd + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10); }
function lvGroups(items, today){
  const newFrom = lvAdd(today, -7);
  return {
    open: items.filter(o => { const d = lvDday(o.end, today); return d == null || d >= 0; }),
    soon: items.filter(o => { const d = lvDday(o.end, today); return d != null && d >= 0 && d <= 7; }),
    fresh: items.filter(o => o.found && o.found >= newFrom),
    all: items
  };
}
const LV_TABS = [['open', '접수 중'], ['soon', '마감 7일 안'], ['fresh', '새로 올라옴'], ['all', '전체']];
function lvList(){
  const g = lvGroups(LV_DATA.items || [], LV_DATA.today);
  $('#mail').innerHTML = lvHead('[연구공고] 공고봇이 모은 실제 공고 · 접수 중 ' + g.open.length + '건', 'IRIS 공개 정보 · 기준 ' + (LV_DATA.today || '') + ' · AI 요약은 참고용(마감·금액은 원문 확인)')
    + '<div class="mb"><div class="lvtabs">' + LV_TABS.map(t => '<button type="button" class="' + (t[0] === LV_TAB ? 'on' : '') + '" onclick="lvTab(\'' + t[0] + '\')">' + esc(t[1]) + ' ' + g[t[0]].length + '</button>').join('') + '</div>'
    + '<input class="lvq" id="lv-q" type="search" placeholder="낱말로 찾기 — 예: 반도체, 한국연구재단, 인문사회" aria-label="공고 찾기" oninput="lvFilter()">'
    + '<div id="lv-list"></div></div>';
  lvFilter();
}
function lvTab(k){ if(!LV_TABS.some(t => t[0] === k)) return; LV_TAB = k; const q = $('#lv-q') ? $('#lv-q').value : ''; lvList(); if(q){ $('#lv-q').value = q; lvFilter(); } }
function lvFilter(){
  const g = lvGroups(LV_DATA.items || [], LV_DATA.today);
  const q = String(($('#lv-q') && $('#lv-q').value) || '').trim().toLowerCase();
  const list = g[LV_TAB].filter(o => {
    if(!q) return true;
    const hay = [o.title, o.agency, o.ministry, o.field, o.program, o.ai && o.ai.overview, o.ai && o.ai.target, o.ai && o.ai.recommend].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.indexOf(w) >= 0);
  });
  $('#lv-list').innerHTML = list.length ? list.map(o => lvCard(o, LV_DATA.today)).join('') : '<div class="lvempty">해당하는 공고가 없습니다.</div>';
}
function lvCard(o, today){
  const d = lvDday(o.end, today);
  const badge = d == null ? '<div class="d">마감일 확인</div>' : d < 0 ? '<div class="d off">마감</div>' : '<div class="d' + (d <= 7 ? ' soon' : '') + '">D-' + d + '</div>';
  let h = '<div class="nt"><div class="top"><div class="t">' + esc(o.title) + '</div>' + badge + '</div>'
    + '<div class="org">' + esc([o.agency, o.ministry].filter(Boolean).join(' · ')) + (o.start || o.end ? ' · 접수 ' + esc(o.start || '?') + ' ~ ' + esc(o.end || '?') : '') + (o.found && o.found >= lvAdd(today, -7) ? ' · 새 공고' : '') + '</div>';
  const a = o.ai;
  if(a && !a.note){
    h += '<div class="ai"><b>AI 요약 (공고봇이 쓴 그대로)</b><br>'
      + [['개요', a.overview], ['대상', a.target], ['규모', a.budget], ['마감', a.deadline]].filter(x => x[1]).map(x => '<b>' + esc(x[0]) + '</b> ' + esc(x[1])).join('<br>')
      + (a.caution ? '<br><span class="cau">⚠ ' + esc(a.caution) + '</span>' : '') + '</div>'
      + (a.recommend ? '<div class="fit">추천 분야 · ' + esc(a.recommend) + '</div>' : '');
  } else if(a && a.note){
    h += '<div class="fit no">AI 요약 없음 · ' + esc(a.note) + '</div>';
  }
  const files = (o.files || []).filter(f => lvSafeUrl(f.url));
  if(files.length) h += '<details><summary>공고문 파일 ' + files.length + '개</summary><div class="files">' + files.map(f => '<a href="' + lvAttr(lvSafeUrl(f.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(f.name) + '</a>').join('') + '</div></details>';
  if(lvSafeUrl(o.link)) h += '<div class="fit"><a href="' + lvAttr(lvSafeUrl(o.link)) + '" target="_blank" rel="noopener noreferrer" style="color:inherit">공고 원문(IRIS) &#8599;</a></div>';
  return h + '</div>';
}
