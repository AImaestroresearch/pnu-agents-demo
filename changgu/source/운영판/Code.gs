/**
 * 연구진흥과 창구 v0 (운영판) — Google Apps Script 웹 앱
 * 6주차 미션 「GAS 자동화 앱 1개 배포」(2026-10-01) · 7주차 「다듬기」(10/3): 회의비 서류를 창구 안으로
 *
 * 서버가 하는 일은 두 가지뿐:
 *  1) 화면(index.html) 내려 주기 — 화면은 시연본/index.src.html 에서 `python build.py --deploy` 로 만든 단일 파일.
 *  2) 익명 사용 횟수 세기 — 'ask'(질문 한 번) / 'exit'(출구 열기) / 'plan'(회의비 서류 만들기) / 'after'(회의 뒤 마무리)
 *     네 가지 고정 낱말만. 적은 말·개인정보는 받지 않는다.
 * 입력을 받는 길(doPost, 요청 값 읽기)이 없다. 갈래 나누기·규정 검색·서류 점검은 전부 브라우저 안에서 끝난다.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('연구진흥과 창구')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 익명 사용 횟수(개인정보·입력값 없음). kind = 'ask' | 'exit' | 'plan' | 'after' 만 받는다. */
function recordUse(kind) {
  var key = (kind === 'exit') ? 'USE_EXIT' : (kind === 'ask') ? 'USE_ASK'
          : (kind === 'plan') ? 'USE_PLAN' : (kind === 'after') ? 'USE_AFTER' : null;
  if (!key) return getStats();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    var p = PropertiesService.getScriptProperties();
    var n = Number(p.getProperty(key) || 0) + 1;
    p.setProperty(key, String(n));
    p.setProperty('LAST_USE', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'));
    return getStats();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getStats() {
  var p = PropertiesService.getScriptProperties();
  return {
    ask: Number(p.getProperty('USE_ASK') || 0),
    exit: Number(p.getProperty('USE_EXIT') || 0),
    plan: Number(p.getProperty('USE_PLAN') || 0),
    after: Number(p.getProperty('USE_AFTER') || 0),
    last: p.getProperty('LAST_USE') || ''
  };
}
