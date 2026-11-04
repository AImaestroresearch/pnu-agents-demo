/**
 * 연구진흥과 창구 — 규정 묻기 (실제판 2단계, 2026-11-03)
 *
 * 왜: 규정봇(제미나이 노트북)은 바깥에서 부를 통로(API)가 없다. 그래서 노트북과 「같은 공개 규정 28개 파일」의
 *   글자를 이 서버에 넣고(rg_data_NN.html), 질문이 오면 ① 관련 조각을 찾고 ② 무료 제미나이 키로 근거 번호를 붙여 답한다.
 * 비용 0원: 키는 결제가 연결되지 않은 무료 등급 프로젝트의 키만 쓴다(넘치면 구글이 거절할 뿐 청구되지 않음).
 *   그 위에 이 서버가 하루·1분·한 사람 한도를 따로 건다. 한도가 차거나 AI가 막히면 AI 없이 「관련 조항 원문」만 보여 준다.
 * 저장하지 않는 것: 질문 글자(답을 만들 때 구글 AI에 보낼 뿐, 시트·속성·로그 어디에도 안 남김). 세는 것은 횟수뿐.
 * 키: 스크립트 속성 GEMINI_API_KEY (저장소에 없음). 한도 바꾸기: 스크립트 속성 RG_DAY_MAX · RG_USER_MAX(누구나 몫) · RG_LIVE_DAY_MAX · RG_LIVE_USER_MAX(비번 몫) · RG_MIN_MAX.
 */

var RG = {
  // 11/4 무료 횟수 두 몫: 누구나(공개 창구·비번 안 넣은 화면) 하루 500 · 비번 넣은 화면(대면 강의·부서) 하루 300 — 합쳐도 무료 가벼운 모델 하루 1,000번보다 작게
  DAY_MAX: 500,          // 누구나 몫 하루 AI 답
  USER_MAX: 10,          // 누구나 몫 한 화면이 6시간에 받는 AI 답
  LIVE_DAY_MAX: 300,     // 비번 몫 하루 AI 답 (밖에서 접속이 몰려도 강의 몫은 남게)
  LIVE_USER_MAX: 30,     // 비번 몫 한 화면 6시간
  MIN_MAX: 12,           // 1분에 전체 (무료 한도 1분 15번보다 작게)
  Q_MIN: 4, Q_MAX: 300,  // 질문 길이
  TOP: 10, PER_DOC: 4,   // AI에게 넘기는 조각 수 · 한 문서에서 최대 (11/4 하네스: 8·3 → 10·4, 한 번에 약 9천 자 = 무료 한도 안)
  SHOW: 5,               // AI 없이 보여 줄 조각 수
  MODELS: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'],
  HOWTO: 'https://aimaestroresearch.github.io/pnu-agents-demo/changgu/'   // 직접 만드는 법(공개 창구)
};

// 이번 요청이 쓰는 몫 — 비번 입장권이 맞으면 비번 몫, 아니면 누구나 몫(Apps Script 는 요청마다 따로 돌아 전역 변수가 안전)
var RG_P_ = null;
function rgPool_(token) {
  var live = !!token && liveTokenOk_(token);
  RG_P_ = live ? { name: 'live', day: 'RG_DAY_L', dayMaxProp: 'RG_LIVE_DAY_MAX', dayMax: RG.LIVE_DAY_MAX, userMaxProp: 'RG_LIVE_USER_MAX', userMax: RG.LIVE_USER_MAX, userKey: 'RG_UL_' }
               : { name: 'pub', day: 'RG_DAY', dayMaxProp: 'RG_DAY_MAX', dayMax: RG.DAY_MAX, userMaxProp: 'RG_USER_MAX', userMax: RG.USER_MAX, userKey: 'RG_U_' };
  return RG_P_;
}
function rgP_() { return RG_P_ || rgPool_(''); }

/** 편집기에서 한 번 실행: 자료가 잘 읽히는지 · 키가 있는지 · 어떤 모델이 되는지 확인 (질문 없이 시험 문장 하나만 보냄) */
function rgSetupCheck() {
  var t0 = Date.now(), d = rgData_();
  Logger.log('규정 자료: 문서 %s개 · 조각 %s개 · 읽는 데 %s ms', d.docs.length, d.chunks.length, Date.now() - t0);
  var hits = rgSearch_('회의비 1인당 한도', d);
  Logger.log('찾기 시험(회의비 1인당 한도) 1등: %s', hits.length ? d.docs[hits[0].c[0]].t + ' ' + hits[0].c[1] + '쪽' : '없음');
  var key = rgKey_();
  if (!key) { Logger.log('제미나이 키 아직 없음(스크립트 속성 GEMINI_API_KEY) — 지금은 AI 없이 조항 찾기만 됩니다.'); return; }
  RG.MODELS.forEach(function (m) {
    var r = rgCallModel_(m, key, '한 단어로만 답하세요: 하늘은 무슨 색인가요?');
    Logger.log('모델 %s → %s', m, r.ok ? '됨 (' + String(r.text).slice(0, 20) + ')' : '안 됨 ' + r.code);
  });
}

/** 공개 창구 화면(깃허브 주소)이 부르는 문. 받는 것: {a:'ask', q, cid} · {a:'notices'} · {a:'quota', cid} */
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.a === 'ask') out = rgAsk(body.q, body.cid, '');   // 공개 창구는 늘 누구나 몫
    else if (body.a === 'notices') out = publicNotices();
    else if (body.a === 'quota') out = rgInfo(body.cid, '');
    else out = { ok: false, msg: '알 수 없는 요청입니다.' };
  } catch (err) {
    out = { ok: false, msg: '잠시 연결이 안 됩니다. 조금 뒤 다시 해 주세요.' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** 공고 목록 — 공개 창구용(비번 없음). 공고봇 시트도 「누구나 보기」 공개 자료라서. 10분 묶어 읽기는 liveNotices 와 같음. */
function publicNotices() {
  var today = liveToday_(), cache = CacheService.getScriptCache();
  var hit = cache.get('NOTICES_' + today);
  if (hit) return { ok: true, today: today, items: JSON.parse(hit) };
  var rows = liveReadNoticeRows_();
  if (!rows) return { ok: false, msg: '공고를 잠시 불러오지 못했습니다. 조금 뒤 다시 해 주세요.' };
  var items = liveBuildItems_(rows, today);
  var json = JSON.stringify(items);
  if (json.length < 95000) cache.put('NOTICES_' + today, json, 600);
  rgCount_('USE_NOTICE');
  return { ok: true, today: today, items: items };
}

/** 화면에 보여 줄 숫자(11/4 근수님 「숫자를 정확하게」): 오늘 사용·하루 한도·이 창 남은 수 + 넣어 둔 자료 수. AI는 부르지 않는다 */
function rgInfo(cid, token) {
  rgPool_(token);
  var d = rgData_();
  return rgWithQuota_({ ok: true, docs: d.docs.length, chunks: d.chunks.length, ai: !!rgKey_(), today: liveToday_(), pool: rgP_().name }, liveCid_(cid));
}

/** 규정 묻기. 돌려주는 것: {ok, mode:'ai'|'search'|'none', answer, sources:[{n,doc,page,text}], msg, dayUsed, dayMax, userLeft, userMax} */
function rgAsk(q, cid, token) {
  rgPool_(token);
  q = String(q == null ? '' : q).replace(/\s+/g, ' ').trim();
  if (q.length < RG.Q_MIN) return { ok: false, msg: '질문을 조금 더 자세히 적어 주세요.' };
  if (q.length > RG.Q_MAX) return { ok: false, msg: '질문은 ' + RG.Q_MAX + '자 안으로 적어 주세요.' };
  if (rgHasPersonal_(q)) return { ok: false, msg: '주민번호·전화번호·메일 같은 개인정보가 들어 있는 것 같습니다. 빼고 다시 적어 주세요.' };
  cid = liveCid_(cid);

  var d = rgData_();
  var hits = rgSearch_(q, d);
  rgCount_('USE_RG');
  if (!hits.length) {
    return { ok: true, mode: 'none', answer: '', sources: [],
      msg: '넣어 둔 공개 규정 28종에는 이 질문과 관련된 내용이 없습니다. 이 질문에 답하려면 관련 규정을 더 넣어야 합니다. 낱말을 바꿔 다시 물어보시거나 연구진흥과에 문의해 주세요.' };
  }
  var top = rgPick_(hits, RG.TOP, RG.PER_DOC);
  var sources = top.map(function (h, i) { return rgSource_(d, h.c, i + 1); });
  var searchOnly = function (msg) {
    return rgWithQuota_({ ok: true, mode: 'search', answer: '', sources: sources.slice(0, RG.SHOW), msg: msg }, cid);
  };

  var key = rgKey_();
  if (!key) return searchOnly('지금은 AI 답 없이 관련 조항 원문만 보여 드립니다.');
  var gate = rgGate_(cid);
  if (!gate.ok) return searchOnly(gate.msg);

  var models = rgModels_(), sawMinute = false;
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var cache = CacheService.getScriptCache();
    if (cache.get('RG_OFF2_' + m)) continue;
    var r = rgCallModel_(m, key, rgPrompt_(q, sources));
    if (r.ok && r.text) r.text = rgTidy_(r.text, sources);
    if (r.ok && r.text) {
      if (!rgIsNotFound_(r.text)) return rgAnswer_(r.text, sources, m, cid, 1);
      // 11/4 근수님: 자료에 있는데 못 찾는 건 도구의 결함 → 바로 포기하지 않고 더 넓게(다음 조각들로) 한 번 더 묻는다
      var used = {}; top.forEach(function (h) { used[h.i] = 1; });
      var rest = hits.filter(function (h) { return !used[h.i]; });
      var top2 = rgPick_(rest, RG.TOP, RG.PER_DOC + 1);
      if (top2.length) {
        var sources2 = top2.map(function (h, k) { return rgSource_(d, h.c, k + 1); });
        rgDayAdd_();   // 두 번째로 물은 것도 하루 횟수에 정직하게 센다(한 사람 횟수는 한 번만)
        // 두 번째는 첫 조각 앞 5개 + 다음 조각을 함께, 같은 가벼운 모델로(11/4 근수님: 깊은 추론보다 찾기·하네스로 품질)
        sources2 = sources.slice(0, 5).concat(sources2).map(function (x, k) { return { n: k + 1, doc: x.doc, page: x.page, text: x.text }; });
        var m2 = m;
        var r2 = rgCallModel_(m2, key, rgPrompt_(q, sources2));
        if (r2.ok && r2.text) r2.text = rgTidy_(r2.text, sources2);
        if (r2.ok && r2.text && !rgIsNotFound_(r2.text)) return rgAnswer_(r2.text, sources2, m2, cid, 2);
        if (r2.ok && r2.text) r = r2;
      }
      // 두 번 찾아도 없으면 「못 한다 + 이런 규정이 더 필요」 — 화면이 「답할 수 없는 질문」으로 따로 보여 준다
      return rgWithQuota_({ ok: true, mode: 'ai', notFound: true, answer: r.text, sources: sources.slice(0, 3), model: m, tries: top2.length ? 2 : 1 }, cid);
    }
    if (r.code === 429 && r.daily) cache.put('RG_OFF2_' + m, '1', rgSecToMidnight_());   // 그 모델 하루 무료 한도 참 → 오늘 자정(태평양 시각 기준 리셋 전)까지 쉬고 다음 모델
    else if (r.code === 429) { sawMinute = true; cache.put('RG_OFF2_' + m, '1', Math.min(120, Math.max(30, (r.wait || 60) + 5))); }   // 1분 한도 → 잠깐만 쉼
    else if (r.code === 404 || r.code === 400) cache.put('RG_OFF2_' + m, '1', 21600);   // 이름이 없는 모델 → 6시간 건너뜀
  }
  rgRefund_(cid);   // AI 답을 못 줬으면 하루·한 사람 횟수에서 뺀다
  if (sawMinute) return searchOnly('지금 묻는 분이 많아 무료 AI가 잠시 쉬고 있습니다. 1분 뒤 다시 해 주세요. 아래는 AI 없이 찾은 관련 조항 원문입니다.');
  return searchOnly('오늘 무료 AI 답변이 다 쓰였습니다. 내일 다시 써 보세요. 아래는 AI 없이 찾은 관련 조항 원문입니다. 같은 도구를 직접 만드실 수도 있습니다.');
}

// 하루 한도로 꺼진 모델을 언제까지 쉴지(초): 구글 무료 한도는 태평양 시각 자정에 다시 채워짐 → 넉넉히 다음 리셋까지, 최대 6시간(캐시 한계)
function rgSecToMidnight_() {
  var now = new Date(), pt = new Date(now.getTime() - 8 * 3600 * 1000);   // 태평양 표준시 근사(UTC-8)
  var left = 86400 - (pt.getUTCHours() * 3600 + pt.getUTCMinutes() * 60 + pt.getUTCSeconds());
  return Math.max(300, Math.min(21600, left + 60));
}
function rgIsNotFound_(text) { return /^\s*넣어 둔 공개 규정에서는 찾지 못했습니다/.test(String(text)); }
// AI 답 정리(11/4 점검표): 줄 이름(「1줄:」 등)·굵은 글씨 표시를 지우고, 「※ 더 확인하시려면 …」 줄이 없으면 근거 문서 이름으로 붙인다
function rgTidy_(text, sources) {
  var lines = String(text || '').replace(/\r/g, '').split('\n').map(function (l) {
    return l.replace(/^\s*(?:\d\s*줄|첫째\s*줄|둘째\s*줄|셋째\s*줄|넷째\s*줄|마지막\s*줄|결론|근거|예외)\s*[:：]\s*/, '').replace(/\*\*/g, '').trim();
  }).filter(function (l) { return l; });
  // 가벼운 모델이 가끔 섞는 한자·일본어 표기(5万円 등)를 한국어로 — 11/4 점검표에서 실제로 나옴
  var t = lines.join('\n').replace(/(\d)\s*万\s*円/g, '$1만 원').replace(/万/g, '만').replace(/円/g, '원').replace(/人/g, '인');
  lines = t.split('\n');
  if (!lines.some(function (l) { return /^※\s*더 확인하시려면/.test(l); })) {
    if (rgIsNotFound_(t)) t += '\n※ 더 확인하시려면 학교 규정집이나 국가법령정보센터를 보시거나 연구진흥과에 문의해 주세요.';
    else {
      // 근거 문서 이름: 답에 붙은 번호 중 원문 규정(우리가 만든 「현행요약」 말고)부터
      var cand = rgCited_(t, sources.length).map(function (n) { return sources[n - 1]; }).concat(sources);
      var first = cand.filter(function (x) { return x && !/^\[현행요약\]/.test(x.doc); })[0];
      var name = first ? String(first.doc).replace(/\.(txt|pdf|hwpx?)$/i, '') : '';
      t += '\n※ 더 확인하시려면 ' + (name ? '「' + name + '」 원문을' : '근거 규정 원문을') + ' 보시거나 연구진흥과에 문의해 주세요.';
    }
  }
  return t;
}
function rgAnswer_(text, sources, m, cid, tries) {
  var used = rgCited_(text, sources.length);
  return rgWithQuota_({ ok: true, mode: 'ai', answer: text, sources: used.length ? used.map(function (n) { return sources[n - 1]; }) : sources.slice(0, 3),
                        model: m, tries: tries }, cid);
}
// 하루 횟수만 하나 더(두 번째로 물을 때)
function rgDayAdd_() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    var p = PropertiesService.getScriptProperties(), today = liveToday_();
    var day = String(p.getProperty(rgP_().day) || '').split('|');
    p.setProperty(rgP_().day, today + '|' + ((day[0] === today ? Number(day[1] || 0) : 0) + 1));
  } catch (e) {
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/* ---------- 아래는 내부 도우미(이름 끝 _ = 화면에서 부를 수 없음) ---------- */

var RG_DATA_ = null;
function rgData_() {
  if (RG_DATA_) return RG_DATA_;
  var meta = JSON.parse(HtmlService.createHtmlOutputFromFile('rg_docs').getContent());
  var chunks = [];
  for (var i = 1; i <= meta.files; i++) {
    var part = JSON.parse(HtmlService.createHtmlOutputFromFile('rg_data_' + ('0' + i).slice(-2)).getContent());
    for (var j = 0; j < part.length; j++) { part[j][3] = part[j][2].toLowerCase(); chunks.push(part[j]); }   // [3] = 찾기용(영문 소문자)
  }
  meta.docs.forEach(function (doc) {
    doc.l = String(doc.t).toLowerCase();
    // 11/4 점검표: 규정 질문의 근거는 해설서보다 법령 조문이 먼저 — 대통령령·법률·시행령·시행규칙 문서는 점수를 조금 더
    if (/대통령령|\(법률\)|시행령|시행규칙|교육부령/.test(doc.t)) doc.b = (doc.b || 1) * 1.25;
  });
  RG_DATA_ = { docs: meta.docs, chunks: chunks };
  return RG_DATA_;
}

function rgKey_() { return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || ''; }
function rgNum_(name, dflt) { var v = Number(PropertiesService.getScriptProperties().getProperty(name)); return v > 0 ? v : dflt; }
function rgModels_() {
  var v = PropertiesService.getScriptProperties().getProperty('RG_MODELS');
  return v ? v.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : RG.MODELS;
}

// 주민번호 · 휴대폰 · 메일
function rgHasPersonal_(q) {
  return /\d{6}\s*-\s*[1-4]\d{6}/.test(q) || /01[016789][\s-]?\d{3,4}[\s-]?\d{4}/.test(q) || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(q);
}

var RG_STOP_ = ('얼마 얼마나 얼마인가요 어떻게 무엇 뭐 뭔가요 언제 어디 어디서 알려 알려줘 알려주세요 주세요 해주세요 궁금 궁금합니다 ' +
  '있나요 있어요 있는지 없나요 해야 하나요 되나요 돼요 가요 인가요 할까요 일까요 하면 되는 경우 관련 대한 대해 대해서 ' +
  '그리고 또는 혹은 정도 무슨 어느 어떤 이거 저거 그거 가능한가요 가능한지 하는지 되는지 싶어요 싶습니다 합니다 입니다').split(' ');
// 질문 낱말 → 문서 제목 낱말(제목에 그 말이 없어도 그 문서를 우선) — 11/4
var RG_TITLE_ALIAS_ = { '연구과제': '연구비', '연구개발': '연구비', '연구개발비': '연구비', '국가연구개발사업': '연구비', '과제': '연구비',
  '대학원혁신': 'bk21', '대학원혁신지원비': 'bk21', '육성사업': '육성사업', '국립대학육성사업': '육성사업', '출장': '여비', '여비': '여비' };
// 같은 뜻 다른 말 — 질문에 왼쪽 말이 있으면 오른쪽 말로도 찾는다(규정 원문에 쓰인 말). 11/4 하네스에서 놓친 것부터
var RG_SYN_ = { '공용차량': ['공무용 차량', '공무용차량'], '관용차': ['공무용 차량'], '관용차량': ['공무용 차량'], '자가용': ['자가용 차량'],
  '출장': ['여행'], '국외출장': ['국외 여행'], '해외출장': ['국외 여행'], '출장비': ['여비'],   // 여비 규정 원문은 「출장」 대신 「여행」
  '밥값': ['식비', '음식물'], '식대': ['식비'], '회식': ['식비', '음식물'], '점심값': ['식비'], '숙소': ['숙박비'], '호텔': ['숙박비'], '숙박': ['숙박비'],
  '비행기': ['항공운임'], '항공권': ['항공운임'], '기차': ['철도운임'], 'ktx': ['철도운임'], '택시': ['자동차운임'],
  '수당': ['사례비'], '자문료': ['자문'], '강사비': ['강사료'], '선물': ['금품'], '축의금': ['경조사비'], '조의금': ['경조사비'], '부의금': ['경조사비'],
  '증빙': ['증빙서류'], '영수증': ['증빙서류'], '카드': ['법인카드', '연구비카드'] };
var RG_END_ = /(인가요|인가|인지요|인지|입니까|습니까|나요|가요|까요|되나|하나|어요|아요|해요|세요|할지|한지|일지|일까)$/;
var RG_JOSA_ = /(에서는|에서도|으로는|으로도|에게서|이라도|까지는|부터는|에서|으로|에게|한테|까지|부터|이랑|이나|이고|인데|이면|에는|에도|은|는|이|가|을|를|의|에|로|도|만|와|과|랑|나|요)$/;

function rgTerms_(q) {
  var toks = String(q).toLowerCase().replace(/[^0-9a-z가-힣\s]/g, ' ').split(/\s+/).filter(Boolean);
  var seen = {}, terms = [];
  function add(t, w) { if (t.length >= 2 && !seen[t] && RG_STOP_.indexOf(t) < 0) { seen[t] = 1; terms.push({ t: t, w: w }); } }
  toks.forEach(function (tok) {
    tok = tok.replace(RG_END_, '');
    if (tok.length < 2) return;
    var base = tok.length > 2 ? tok.replace(RG_JOSA_, '') : tok;
    if (base.length < 2) base = tok;
    add(base, 1);
    if (/^[가-힣]{4,}$/.test(base)) for (var i = 0; i + 2 <= base.length; i++) add(base.slice(i, i + 2), 0.35);   // 붙여 쓴 낱말 대비
    (RG_SYN_[base] || RG_SYN_[tok] || []).forEach(function (y) { add(y, 0.9); });   // 11/4: 같은 뜻 다른 말(공용차량 → 공무용 차량)
  });
  return terms;
}

// 낱말이 들어간 조각을 세어 점수: 드문 낱말일수록 크게(idf) · 여러 낱말을 함께 가질수록 크게 · 현행 자료는 조금 더
function rgSearch_(q, d) {
  var terms = rgTerms_(q), N = d.chunks.length;
  if (!terms.length) return [];
  var score = {}, have = {}, idfOf = {};
  terms.forEach(function (tm, ti) {
    var df = 0, hitIdx = [], tfs = [];
    for (var i = 0; i < N; i++) {
      var s = d.chunks[i][3] || d.chunks[i][2].toLowerCase(), p = s.indexOf(tm.t);
      if (p < 0) continue;
      var tf = 1; while (tf < 5 && (p = s.indexOf(tm.t, p + tm.t.length)) >= 0) tf++;
      df++; hitIdx.push(i); tfs.push(tf);
    }
    if (!df) return;
    var idf = Math.log(1 + N / df);
    idfOf[tm.t] = idf;
    for (var k = 0; k < hitIdx.length; k++) {
      var c = hitIdx[k];
      score[c] = (score[c] || 0) + tm.w * idf * (1 + Math.log(tfs[k]));
      if (tm.w === 1) (have[c] = have[c] || {})[ti] = 1;
    }
  });
  // 문서 제목에 든 낱말(예: 「BK21」 「육성사업」)은 그 문서 조각에 점수를 더한다 — 이미 다른 낱말이 맞은 조각만
  // 11/4: 「연구과제」처럼 제목과 말이 다른 경우는 RG_TITLE_ALIAS_ 로 이어 준다(연구과제 → 연구비 지침)
  terms.forEach(function (tm, ti) {
    if (tm.w !== 1) return;
    var alias = RG_TITLE_ALIAS_[tm.t] || '';
    Object.keys(score).forEach(function (k) {
      var l = d.docs[d.chunks[k][0]].l;
      if (l && (l.indexOf(tm.t) >= 0 || (alias && l.indexOf(alias) >= 0))) { score[k] += 2.5; (have[k] = have[k] || {})[ti] = 1; }
    });
  });
  // 11/4: 질문 속 낱말이 붙어서 나오는 조각(「위원회 참석 수당」「지급 단가」)에 점수를 더한다 — 흩어져 나오는 조각보다 위로
  var mains = terms.filter(function (tm) { return tm.w === 1 && idfOf[tm.t]; });
  for (var a = 0; a + 1 < mains.length; a++) {
    var t1 = mains[a].t, t2 = mains[a + 1].t, bonus = 1.6 * (idfOf[t1] + idfOf[t2]) / 2;
    Object.keys(score).forEach(function (k) {
      var s = d.chunks[k][3] || d.chunks[k][2].toLowerCase();
      if (s.indexOf(t1 + t2) >= 0 || s.indexOf(t1 + ' ' + t2) >= 0) score[k] += bonus;
    });
  }
  var full = terms.filter(function (tm) { return tm.w === 1; }).length || 1;
  return Object.keys(score).map(function (k) {
    var c = d.chunks[k], cov = have[k] ? Object.keys(have[k]).length / full : 0;
    var lenNorm = 0.6 + 0.4 * Math.min(2, c[2].length / 900);
    return { i: +k, c: c, s: score[k] * (0.4 + cov) * (d.docs[c[0]].b || 1) / lenNorm };
  }).filter(function (h) { return h.s > 0; })
    .sort(function (a, b) { return b.s - a.s; });
}

function rgPick_(hits, n, perDoc) {
  var out = [], per = {};
  for (var i = 0; i < hits.length && out.length < n; i++) {
    var di = hits[i].c[0];
    if ((per[di] || 0) >= perDoc) continue;
    per[di] = (per[di] || 0) + 1; out.push(hits[i]);
  }
  return out;
}

function rgSource_(d, c, n) {
  return { n: n, doc: d.docs[c[0]].t, page: c[1] || 0, text: c[2] };
}

// 답 모양(11/4 근수님 「규정 질문은 빠르게 확인하고 업무를 진행하길 바란다 — 길 필요 없다」 + 국내외 조사: 결론 먼저·짧게·근거 바로 확인)
function rgPrompt_(q, sources) {
  var lines = [
    '당신은 부산대학교 연구진흥과 「연구비·회계 규정 안내」 도우미입니다.',
    '아래 [자료]는 공개된 규정·지침에서 찾은 조각입니다. 반드시 [자료]에 적힌 내용만으로 답하세요.',
    '',
    '[답 모양 — 바쁜 직원이 한눈에 보고 바로 일할 수 있게, 짧게. 아래 예처럼 쓰고, 「1줄:」 같은 줄 이름은 쓰지 않습니다]',
    '첫째 줄은 결론, 둘째 줄은 근거(규정 이름·조항·개정일), 셋째 줄은 예외·조건이 있을 때만, 마지막은 ※ 줄입니다.',
    '셋째 줄(예외·조건)은 [자료]의 해당 문장을 거의 그대로 옮깁니다. 「~할 수 없다」를 「조건이 따를 수 있다」처럼 흐리거나, 여러 문장을 섞어 뜻을 바꾸지 않습니다. 옮길 문장이 없으면 셋째 줄은 쓰지 않습니다. 예)',
    '1인당 50,000원 이내입니다 [2].',
    '「○○ 사업비 집행지침」 제9조(2026. 3. 개정) [2]',
    '다과·식대를 포함하며, 회의록과 참석자 확인서가 필요합니다 [2].',
    '※ 더 확인하시려면 「○○ 사업비 집행지침」 원문을 보시거나 연구진흥과에 문의해 주세요.',
    '',
    '[규칙]',
    '1. 마지막 줄을 빼고 3줄, 200자 안으로 씁니다. 인사·서론·되풀이·머리글·표·굵은 글씨는 쓰지 않습니다.',
    '2. 금액·날짜·비율은 [자료]의 글자 그대로 옮깁니다. 계산하거나 짐작하지 않습니다.',
    '3. 근거 번호 [n]은 그 조각에 실제로 그 내용이 있을 때만 붙입니다. 둘 이상이면 [1][3]처럼 하나씩 붙입니다.',
    '4. 같은 항목이 여러 판으로 있으면 개정일이 가장 최근인 자료와 「현행요약」을 따릅니다. 옛 판 숫자는 쓰지 않습니다.',
    '5. 질문에 재원(BK21·국립대학육성사업·연구과제 연구비·대학회계 등)이 적혀 있으면 그 재원의 자료로만 답합니다. 다른 재원의 기준은 한 문장에 섞지 않습니다.',
    '   질문에 재원이 없는데 재원마다 기준이 다르면, 결론 줄을 재원별로 한 줄씩 나눠 씁니다. 한 재원만 골라 답하지 않습니다.',
    '   예) 「회의비 한도?」 → BK21 대학원혁신지원비 1인 50,000원 [n] / 국립대학육성사업 1인 50,000원 이내 [n] / 연구과제 연구비 식비 1인 50,000원 [n] (자료에 있는 재원만).',
    '   신분(직원·교수 등)이나 지역 등급에 따라 금액이 다르고 질문에 신분이 없으면, 「일반 직원」 기준을 먼저 쓰고 교수·부교수 금액을 한 줄 덧붙입니다.',
    '   「BK21」처럼 이름이 같아도 재원이 둘이면(교육연구단 사업비 = 한국연구재단 「4단계 BK21 예산편성 및 집행기준」 / 대학원혁신지원비 = 부산대 「BK21 대학원혁신 사업비 편성 및 집행지침」) 둘 다 한 줄씩 씁니다.',
    '6. 「찾지 못했습니다」는 [자료]를 끝까지 다시 읽어도 답이 정말 없을 때만 씁니다. 조문이 「별표 ○에 따라」처럼 다른 곳을 가리키면 그것이 답입니다(예: 「별표 4에 정해져 있습니다」).',
    '   [자료]로 답할 수 없으면 억지로 답을 만들지 말고 아래 세 줄만 씁니다(괄호 안만 알맞게 채우고, 줄 이름은 쓰지 않습니다).',
    '넣어 둔 공개 규정에서는 찾지 못했습니다.',
    '이 질문에 답하려면 (필요한 규정·지침의 이름이나 종류)이 있어야 합니다.',
    '※ 더 확인하시려면 (그 규정을 볼 수 있는 곳: 국가법령정보센터, 학교 규정집, 해당 부서 안내 등)을 보시거나 연구진흥과에 문의해 주세요.',
    '7. 말투는 공손하고 자연스러운 존댓말(-입니다, -해 주세요)로 씁니다. 「~하시길 바랍니다」 「~바랍니다?」 같은 딱딱하거나 어색한 말은 쓰지 않습니다.',
    '8. 한국어로만 씁니다. 금액은 「50,000원」 「5만 원」처럼 씁니다(한자·일본어 표기 금지). ※ 줄은 맨 끝 한 줄(더 확인하시려면 …)만 씁니다.',
    '',
    '[질문]', q, '', '[자료]'
  ];
  sources.forEach(function (s) {
    lines.push('[' + s.n + '] 『' + s.doc + '』' + (s.page ? ' ' + s.page + '쪽' : ''));
    lines.push(s.text);
    lines.push('');
  });
  return lines.join('\n');
}

function rgCallModel_(model, key, prompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
                                generationConfig: { temperature: 0, maxOutputTokens: 900 } })   // 11/4 점검표: 같은 질문엔 같은 답(흔들림 줄이기)
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      // 11/4: 429 거절 이유를 읽는다 — 1분 한도(잠깐 쉬면 됨)인지 하루 한도(오늘은 끝)인지. 같은 「429」라도 대응이 다르다
      var body = String(res.getContentText('UTF-8') || '').slice(0, 4000);
      var wait = Number((body.match(/"retryDelay"\s*:\s*"(\d+)/) || [])[1] || 0);
      return { ok: false, code: code, daily: /PerDay|per day|daily/i.test(body), wait: wait };
    }
    var j = JSON.parse(res.getContentText('UTF-8'));
    var parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    var text = parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('').trim();
    return text ? { ok: true, text: text } : { ok: false, code: 204 };
  } catch (e) {
    return { ok: false, code: 0 };
  }
}

// 답에 실제로 붙은 근거 번호만 골라 화면에 보여 준다
function rgCited_(text, max) {
  var seen = {}, out = [];
  // [3] 도, AI가 묶어 쓴 [3, 6] 도 알아본다(11/4 실제 답에서 묶어 씀)
  String(text).replace(/\[(\d{1,2}(?:\s*[,，]\s*\d{1,2})*)\]/g, function (_, g) {
    g.split(/[,，]/).forEach(function (n) { n = +n; if (n >= 1 && n <= max && !seen[n]) { seen[n] = 1; out.push(n); } });
    return _;
  });
  return out.sort(function (a, b) { return a - b; });
}

// 한도 문: 1분 전체 · 한 사람 6시간 · 하루 전체. 통과하면 횟수를 미리 올린다(AI가 실패하면 rgRefund_ 로 되돌림).
function rgGate_(cid) {
  var cache = CacheService.getScriptCache(), lock = LockService.getScriptLock();
  var minKey = 'RG_MIN_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMddHHmm');
  var userKey = rgP_().userKey + cid, today = liveToday_();
  try { lock.waitLock(5000); } catch (e) { return { ok: false, msg: '지금 묻는 분이 많습니다. 잠시 뒤 다시 해 주세요. 아래는 관련 조항 원문입니다.' }; }
  try {
    var p = PropertiesService.getScriptProperties();
    var day = String(p.getProperty(rgP_().day) || '').split('|');
    var dayN = day[0] === today ? Number(day[1] || 0) : 0;
    var minN = Number(cache.get(minKey) || 0), userN = Number(cache.get(userKey) || 0);
    if (dayN >= rgNum_(rgP_().dayMaxProp, rgP_().dayMax))
      return { ok: false, msg: '오늘 무료 AI 답변이 다 쓰였습니다. 내일 다시 써 보세요. 아래는 AI 없이 찾은 관련 조항 원문입니다. 같은 도구를 직접 만드실 수도 있습니다.' };
    if (userN >= rgNum_(rgP_().userMaxProp, rgP_().userMax))
      return { ok: false, msg: '한 분이 무료로 받으실 수 있는 AI 답(' + rgNum_(rgP_().userMaxProp, rgP_().userMax) + '번)을 다 쓰셨습니다. 내일 다시 써 보세요. 아래는 관련 조항 원문입니다.' };
    if (minN >= rgNum_('RG_MIN_MAX', RG.MIN_MAX))
      return { ok: false, msg: '지금 묻는 분이 많습니다. 1분 뒤 다시 해 주세요. 아래는 관련 조항 원문입니다.' };
    p.setProperty(rgP_().day, today + '|' + (dayN + 1));
    cache.put(minKey, String(minN + 1), 120);
    cache.put(userKey, String(userN + 1), 21600);
    return { ok: true, left: rgNum_(rgP_().userMaxProp, rgP_().userMax) - userN - 1 };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// 화면에 보여 줄 횟수(11/4 근수님 「총한도도 적어 주고」): 오늘 전체 AI 답 몇 번 썼나 / 전체 한도 · 이 창 남은 수 / 한 사람 한도. 세는 것은 횟수뿐
function rgQuota_(cid) {
  var p = PropertiesService.getScriptProperties(), today = liveToday_();
  var day = String(p.getProperty(rgP_().day) || '').split('|');
  var userMax = rgNum_(rgP_().userMaxProp, rgP_().userMax);
  var userN = Number(CacheService.getScriptCache().get(rgP_().userKey + cid) || 0);
  return { dayUsed: day[0] === today ? Number(day[1] || 0) : 0, dayMax: rgNum_(rgP_().dayMaxProp, rgP_().dayMax),
           userLeft: Math.max(0, userMax - userN), userMax: userMax, pool: rgP_().name };
}
function rgWithQuota_(out, cid) {
  var q = rgQuota_(cid);
  for (var k in q) out[k] = q[k];
  return out;
}

function rgRefund_(cid) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    var p = PropertiesService.getScriptProperties(), today = liveToday_();
    var day = String(p.getProperty(rgP_().day) || '').split('|');
    if (day[0] === today && Number(day[1]) > 0) p.setProperty(rgP_().day, today + '|' + (Number(day[1]) - 1));
    var cache = CacheService.getScriptCache(), userN = Number(cache.get(rgP_().userKey + cid) || 0);
    if (userN > 0) cache.put(rgP_().userKey + cid, String(userN - 1), 21600);
  } catch (e) {
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function rgCount_(name) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(2000);
    var p = PropertiesService.getScriptProperties();
    p.setProperty(name, String(Number(p.getProperty(name) || 0) + 1));
  } catch (e) {
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
