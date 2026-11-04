/**
 * 연구진흥과 창구 — 「실제로 쓰기」 (실제판) · Google Apps Script 웹 앱
 * 2026-11-03 1단계: 비번 문 + 공고봇 실제 연결  (2단계 = 규정 답하기, 나중에)
 *
 * 왜 따로 만들었나: 공개 창구(운영판)는 「입력도 안 받고 시트도 안 읽는다」를 검사로 지키고 있다.
 *   비번을 받고 공고봇 시트를 읽는 일은 그 약속과 섞지 않고 이 웹 앱에서만 한다.
 * 안에 든 것: 공고봇 「공고로그」 — IRIS 공개 공고 + AI 요약. 개인정보·연락처 없음.
 *   → 비번이 지키는 것은 「비밀」이 아니라 「사용량(나중에 AI 무료 한도)과 엉뚱한 사용」.
 * 서버가 받는 입력은 둘뿐: 비번 글자(맞는지 대 보고 버림, 저장 안 함) · 화면이 만든 무작위 번호(틀린 횟수 세기용).
 * 비번 바꾸기: 편집기 → 프로젝트 설정 → 스크립트 속성 LIVE_PASSWORD 값만 고치면 끝(이미 들어온 사람은 최대 6시간 뒤 다시 입력).
 */

/** 편집기에서 한 번 실행: 시트 읽기 권한 승인 + 공고가 몇 건 보이는지 확인(근수님 손 — 권한 창은 직접 눌러야 뜸) */
function setupCheck() {
  var rows = liveReadNoticeRows_();
  var items = rows ? liveBuildItems_(rows, liveToday_()) : [];
  var hasPw = !!PropertiesService.getScriptProperties().getProperty('LIVE_PASSWORD');
  Logger.log('%s · 공고 %s건 보임 · 비번 %s', rows ? '시트 읽기 성공' : '시트 읽기 실패(공개 보기 설정 확인)', items.length, hasPw ? '설정됨' : '아직 없음(스크립트 속성 LIVE_PASSWORD)');
}

var LIVE = {
  NOTICE_SHEET_ID: '1q4RwioZCEl9_i9n_Kmdna6u4DmM4JnPKyODvx8rFitE', // 공고봇 시트(누구나 보기 — 이미 창구 links.json 에 공개된 주소, 공개 CSV로만 읽음)
  NOTICE_TAB: '공고로그',
  TOKEN_SEC: 6 * 3600,        // 한 번 들어오면 6시간
  MAX_FAIL_PER_CLIENT: 5,     // 한 화면에서 5번 틀리면
  MAX_FAIL_ALL: 150,          // 전체 합쳐 150번 틀리면 (11/4: 강의에서 수강생이 한꺼번에 오타를 내도 반 전체가 막히지 않게 30 → 150)
  LOCK_SEC: 10 * 60,          // 10분 막음
  NEW_DAYS: 7,                // 「새로 올라온」 기준
  KEEP_CLOSED_DAYS: 14,       // 마감 지난 공고도 14일까지는 보여 줌(「마감」 표시)
  MAX_ITEMS: 150
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('연구진흥과 창구')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 익명 사용 횟수(창구 화면과 같음). kind = 'ask' | 'exit' | 'plan' | 'after' 만 받는다. 적은 말·개인정보는 받지 않는다. */
function recordUse(kind) {
  var key = (kind === 'exit') ? 'USE_EXIT' : (kind === 'ask') ? 'USE_ASK'
          : (kind === 'plan') ? 'USE_PLAN' : (kind === 'after') ? 'USE_AFTER' : null;
  if (!key) return getStats();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    var p = PropertiesService.getScriptProperties();
    p.setProperty(key, String(Number(p.getProperty(key) || 0) + 1));
    p.setProperty('LAST_USE', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'));
  } catch (e) {
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
  return getStats();
}

function getStats() {
  var p = PropertiesService.getScriptProperties();
  return { ask: Number(p.getProperty('USE_ASK') || 0), exit: Number(p.getProperty('USE_EXIT') || 0),
           plan: Number(p.getProperty('USE_PLAN') || 0), after: Number(p.getProperty('USE_AFTER') || 0),
           last: p.getProperty('LAST_USE') || '' };
}

/** 비번 확인 → 맞으면 6시간짜리 입장권(무작위 번호)을 준다. 비번은 저장하지 않는다. */
function liveLogin(pw, cid) {
  var real = PropertiesService.getScriptProperties().getProperty('LIVE_PASSWORD');
  if (!real) return { ok: false, msg: '아직 비번이 정해지지 않았습니다. 연구진흥과에 문의해 주세요.' };
  cid = liveCid_(cid);
  var cache = CacheService.getScriptCache();
  if (cache.get('LOCK_ALL') || cache.get('LOCK_' + cid)) {
    return { ok: false, msg: '여러 번 틀려 잠시 막혔습니다. 10분 뒤에 다시 해 주세요.' };
  }
  pw = String(pw == null ? '' : pw).slice(0, 100);
  if (!liveSafeEq_(pw, String(real))) {
    liveCountFail_(cache, cid);
    return { ok: false, msg: '비번이 다릅니다.' };
  }
  var token = Utilities.getUuid();
  cache.put('TOK_' + token, liveFp_(String(real)), LIVE.TOKEN_SEC);   // 입장권엔 비번의 지문만 — 비번을 바꾸면 옛 입장권은 바로 끝남(11/4)
  liveCountUse_();
  return { ok: true, token: token };
}

/** 공고 목록(입장권 필요). 공고봇 시트에서 화면에 필요한 칸만 골라 보낸다. */
function liveNotices(token) {
  if (!liveTokenOk_(token)) return { ok: false, expired: true, msg: '입장 시간이 지났습니다. 비번을 다시 넣어 주세요.' };
  var today = liveToday_(), cache = CacheService.getScriptCache();
  var hit = cache.get('NOTICES_' + today);
  if (hit) return { ok: true, today: today, items: JSON.parse(hit) };
  var rows = liveReadNoticeRows_();
  if (!rows) return { ok: false, msg: '공고를 잠시 불러오지 못했습니다. 조금 뒤 다시 해 주세요.' };
  var items = liveBuildItems_(rows, today);
  var json = JSON.stringify(items);
  if (json.length < 95000) cache.put('NOTICES_' + today, json, 600);   // 10분 동안은 다시 안 읽음
  return { ok: true, today: today, items: items };
}

/* ---------- 아래는 내부 도우미(이름 끝 _ = 화면에서 부를 수 없음) ---------- */

// 공고봇 시트는 「링크가 있는 누구나 보기」 → 공개 표 주소(CSV)로만 읽는다.
// 시트 열기 권한(근수님 계정의 모든 시트에 닿음)을 받지 않으려고 고른 방법. 공개 안 된 시트는 못 읽는다.
function liveReadNoticeRows_() {
  var url = 'https://docs.google.com/spreadsheets/d/' + LIVE.NOTICE_SHEET_ID +
            '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(LIVE.NOTICE_TAB);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) return null;
  var text = res.getContentText('UTF-8');
  if (!text || text.charAt(0) === '<') return null;                     // 로그인 화면 등 = 공개가 꺼짐
  var rows = Utilities.parseCsv(text);
  return rows && rows.length && String(rows[0][0]).trim() === '공고ID' ? rows : null;
}

// 시트 행 → 화면용 공고. 같은 공고ID가 여러 줄이면 AI 요약이 있는 마지막 줄을 쓴다.
function liveBuildItems_(rows, today) {
  if (!rows || rows.length < 2) return [];
  var head = rows[0], col = {};
  head.forEach(function (h, i) { col[String(h).trim()] = i; });
  var need = ['공고ID', '발견일시', '공고일', '전문기관', '소관부처', '제목', '접수시작', '접수마감', '링크', '분야', '사업명', '첨부공고문', 'AI요약'];
  for (var n = 0; n < need.length; n++) if (col[need[n]] == null) return [];
  var byId = {};
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r], id = String(row[col['공고ID']] || '').trim();
    if (!/^\d{3,10}$/.test(id)) continue;
    if (/^\s*[\(\[]?\s*TEST\s*[\)\]]|테스트\s*입니다/i.test(String(row[col['제목']] || ''))) continue;   // IRIS 시험용 공고
    var ai = String(row[col['AI요약']] || '');
    var prev = byId[id];
    if (prev && prev._hasAi && !/^개요:/.test(ai)) continue;
    byId[id] = {
      id: id,
      found: liveDate_(row[col['발견일시']]),
      posted: liveDate_(row[col['공고일']]),
      agency: liveClip_(row[col['전문기관']], 60),
      ministry: liveClip_(row[col['소관부처']], 60),
      title: liveClip_(row[col['제목']], 300),
      start: liveDate_(row[col['접수시작']]),
      end: liveDate_(row[col['접수마감']]),
      link: liveIrisUrl_(row[col['링크']]),
      field: liveClip_(row[col['분야']], 300),
      program: liveClip_(row[col['사업명']], 200),
      files: liveFiles_(row[col['첨부공고문']]),
      ai: liveAi_(ai),
      _hasAi: /^개요:/.test(ai)
    };
  }
  var newFrom = liveAddDays_(today, -LIVE.NEW_DAYS), keepFrom = liveAddDays_(today, -LIVE.KEEP_CLOSED_DAYS);
  var list = Object.keys(byId).map(function (k) { var o = byId[k]; delete o._hasAi; return o; })
    .filter(function (o) { return (o.end && o.end >= keepFrom) || (o.found && o.found >= newFrom); });
  list.sort(function (a, b) {
    var ac = a.end && a.end < today, bc = b.end && b.end < today;          // 마감 지난 것은 뒤로
    if (ac !== bc) return ac ? 1 : -1;
    return (a.end || '9999-99-99') < (b.end || '9999-99-99') ? -1 : 1;     // 마감 가까운 순
  });
  return list.slice(0, LIVE.MAX_ITEMS);
}

// 「개요: … / 대상: … / 규모: … / 마감: … / 추천: … / 주의: …」 → 칸별로. 요약 생략 사유는 note 로.
function liveAi_(s) {
  s = String(s || '');
  if (!s) return null;
  var m = s.match(/^\(요약 생략: ([\s\S]*)\)$/);
  if (m) return { note: liveClip_(m[1], 200) };
  var out = {}, keys = { '개요': 'overview', '대상': 'target', '규모': 'budget', '마감': 'deadline', '추천': 'recommend', '주의': 'caution' };
  s.split(/\n/).forEach(function (line) {
    var mm = line.match(/^(개요|대상|규모|마감|추천|주의):\s*([\s\S]*)$/);
    if (mm && mm[2].trim()) out[keys[mm[1]]] = liveClip_(mm[2], 600);
  });
  return Object.keys(out).length ? out : null;
}

// 첨부 칸 = 「파일명 | 주소」 줄들. IRIS 내려받기 주소만 남긴다.
function liveFiles_(s) {
  return String(s || '').split(/\n/).map(function (line) {
    var i = line.lastIndexOf(' | ');
    if (i < 0) return null;
    var url = liveIrisUrl_(line.slice(i + 3));
    return url ? { name: liveClip_(line.slice(0, i), 150), url: url } : null;
  }).filter(Boolean).slice(0, 6);
}

function liveIrisUrl_(u) {
  u = String(u || '').trim();
  return /^https:\/\/www\.iris\.go\.kr\/[A-Za-z0-9_\-./?=&%+]*$/.test(u) ? u : '';
}

// 「2026/11/13」「2026-11-13」「2026. 11. 3」「2026. 10. 26 오전 10:00:00」 → 「2026-11-13」
function liveDate_(s) {
  var m = String(s || '').match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function liveToday_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }

function liveAddDays_(ymd, d) {
  var p = ymd.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + d * 86400000);
  return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
}

function liveClip_(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

function liveCid_(cid) { return String(cid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'none'; }

function liveTokenOk_(token) {
  token = String(token || '');
  if (!/^[0-9a-f-]{36}$/.test(token)) return false;
  var real = PropertiesService.getScriptProperties().getProperty('LIVE_PASSWORD');
  if (!real) return false;
  return CacheService.getScriptCache().get('TOK_' + token) === liveFp_(String(real));
}

// 비번 지문(되돌릴 수 없는 짧은 요약). 비번 자체는 어디에도 따로 저장하지 않는다
function liveFp_(pw) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'changgu-live|' + pw, Utilities.Charset.UTF_8);
  return b.slice(0, 12).map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
}

// 길이가 달라도 끝까지 비교(맞춰 보는 시간으로 비번을 짐작하지 못하게)
function liveSafeEq_(a, b) {
  var diff = a.length ^ b.length, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function liveCountFail_(cache, cid) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    var one = Number(cache.get('FAIL_' + cid) || 0) + 1, all = Number(cache.get('FAIL_ALL') || 0) + 1;
    cache.put('FAIL_' + cid, String(one), LIVE.LOCK_SEC);
    cache.put('FAIL_ALL', String(all), LIVE.LOCK_SEC);
    if (one >= LIVE.MAX_FAIL_PER_CLIENT) cache.put('LOCK_' + cid, '1', LIVE.LOCK_SEC);
    if (all >= LIVE.MAX_FAIL_ALL) cache.put('LOCK_ALL', '1', LIVE.LOCK_SEC);
  } catch (e) {
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// 들어온 횟수만 센다(누가 들어왔는지는 모름)
function liveCountUse_() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    var p = PropertiesService.getScriptProperties();
    p.setProperty('USE_LIVE', String(Number(p.getProperty('USE_LIVE') || 0) + 1));
    p.setProperty('LAST_LIVE', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'));
  } catch (e) {
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
