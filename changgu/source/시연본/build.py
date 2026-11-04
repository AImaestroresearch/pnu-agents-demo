# -*- coding: utf-8 -*-
"""창구 빌드 — index.src.html + 폰트/마스코트 → 단일 HTML

두 가지를 같은 원본에서 만든다:
  python build.py            시연본  → 시연본/index.html   (10/30 발표장·데모허브용, 서버 호출 0)
  python build.py --deploy   운영판  → 운영판/index.html   (6주차 GAS 웹앱, 출구마다 실제 주소 버튼 + 사용 횟수)
  python build.py --public   공개판  → 공개판/index.html   (11/2~ 계속 쓰는 공개 주소, 서버 없음 · 실제 도구 버튼 · 소스 받기)
  python build.py --live     실제판  → 실제판/index.html   (11/3~ GAS 웹앱, 공고 출구는 비번 뒤 공고봇 실제 목록 · 취합은 가명 시범)

왜 이렇게 하나:
  QR로 폰에서 열어도, 발표장 인터넷이 끊겨도 같은 모습이어야 한다.
  그래서 외부 요청을 하나도 두지 않고, 쓰는 글자만 골라낸 폰트와 마스코트를 파일 안에 심는다.
  운영판은 여기에 links.json 의 주소(규정봇·공고봇·취합봇·담당자)와 GAS 사용 횟수 세기만 더한다.
"""
import base64, io, json, os, re, subprocess, sys, tempfile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DEPLOY = '--deploy' in sys.argv
PUBLIC = '--public' in sys.argv   # 11/2: 공개판 — 시연 띠 없이 계속 쓰는 판(정적, 서버 없음) + 소스 받기
LIVE = '--live' in sys.argv       # 11/3: 실제판 — 창구 화면 그대로, 공고 출구는 비번 뒤 실제 공고(서버 = 실제판 Code.gs)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OPS  = os.path.abspath(os.path.join(HERE, '..', '운영판'))
SRC  = os.path.join(HERE, 'index.src.html')
PUB  = os.path.abspath(os.path.join(HERE, '..', '공개판'))
LIV  = os.path.abspath(os.path.join(HERE, '..', '실제판'))
OUT  = os.path.join(OPS, 'index.html') if DEPLOY else os.path.join(PUB, 'index.html') if PUBLIC else os.path.join(LIV, 'index.html') if LIVE else os.path.join(HERE, 'index.html')
FONT = os.path.join(ROOT, 'Pretendard-1.3.9', 'web', 'static', 'woff2')
# 그림(자산/) — 9/28부터 산지니는 세 겹(make_sanjini_layers.py), 머리 로고는 부산대 상징. 옛 산지니.webp는 기록으로 둠
IMAGES = [('__SANJINI__', '산지니_몸.webp'), ('__SJ_WING__', '산지니_날개.webp'),
          ('__SJ_BLINK__', '산지니_눈감음.webp'), ('__PNU__', '부산대_상징.webp')]

EMPTY_LINKS = {
    'rule':   {'name': '규정봇',           'url': ''},
    'notice': {'name': '공고봇 대시보드',   'url': ''},
    'weekly': {'name': '주간회의 취합봇',   'url': ''},
    'human':  {'name': '연구진흥과 담당자', 'url': ''},
}

# 운영판에서만 들어가는 서버 연결(GAS). 시연본에는 이 문자열이 한 글자도 들어가지 않는다(테스트가 막는다).
GAS_DEPLOY = """/* 운영판: 익명 사용 횟수만 서버로 — 적으신 말은 보내지 않는다 */
function gasRun(){ try{ if(typeof google === 'undefined' || !google.script) return null; return google.script.run || null; }catch(e){ return null; } }
function showStat(s){ const el = $('#stat'); if(!el || !s) return; const n = Number(s.ask || 0) + Number(s.exit || 0) + Number(s.plan || 0) + Number(s.after || 0); el.textContent = '로그인 없이 바로 · 사용 ' + n + '회'; }
function countUse(kind){ const g = gasRun(); if(!g) return; if(kind !== 'ask' && kind !== 'exit' && kind !== 'plan' && kind !== 'after') return; try{ g.withSuccessHandler(showStat).withFailureHandler(function(){}).recordUse(kind); }catch(e){} }
function loadStats(){ const g = gasRun(); if(!g) return; try{ g.withSuccessHandler(showStat).withFailureHandler(function(){}).getStats(); }catch(e){} }"""
def _read(*parts): return open(os.path.join(*parts), encoding='utf-8').read()
# 공고 목록 그리기(notice_view.js)는 실제판·공개판이 같이 쓴다(11/4)
GAS_LIVE = (_read(LIV, 'notice_view.js') + _read(LIV, 'ask_view.js') + _read(LIV, 'live_part.js')) if LIVE else ''   # 11/4 규정 묻기 답 화면(ask_view.js)도 같이
def cg_api():
    """공개판이 부르는 창구 서버 주소 = 실제판 배포 주소(누구나 열리는 웹 앱 주소라 공개해도 됨). 가장 최근 배포URL_*.txt"""
    import glob
    files = sorted(glob.glob(os.path.join(LIV, '배포URL_*.txt')))
    if not files: return ''
    url = open(files[-1], encoding='utf-8').read().strip().split()[0]
    assert re.match(r'^https://script\.google\.com/macros/s/[\w-]+/exec$', url), '배포 주소 꼴이 아님: ' + url
    return url
GAS_DEMO = """/* 시연본: 서버가 없다. 세지도 보내지도 않는다 */
function countUse(){}
function loadStats(){}"""

# 운영판에서 바꾸는 문구(시연 전용 표현 → 운영 표현). 원본에 이 문장이 정확히 한 번 있어야 한다.
DEPLOY_TEXT = [
    ('<title>연구진흥과 창구 · 성과공유회 시연</title>', '<title>연구진흥과 창구</title>'),
    ('<div class="band"><b>2026. 10. 30. 성과공유회 시연용</b> · 이 페이지는 2026. 11. 16.에 닫습니다 · 여기 실린 지침은 모두 공개된 자료입니다</div>',  # 10/21 띠 문구 바뀜 → 11/2 맞춤
     '<div class="band"><b>연구진흥과 창구 v0</b> · 로그인 없이 누구나 · 적으신 말은 저장·전송되지 않습니다 · 여기 실린 지침은 모두 공개된 자료입니다</div>'),
    ('<span class="tag">시연본</span>', '<span class="tag">v0</span>'),
    ('세 가지 도구를 부서에서 실제로 쓰고 있고, 이 페이지는 그 모습을 보여 드리는 시연본입니다. 실제 운영본은 학교 계정 안에서 따로 돌아갑니다.',
     '세 가지 도구를 부서에서 실제로 쓰고 있고, 이 화면은 그 입구인 연구진흥과 창구(운영 v0)입니다. 규정봇·공고봇·취합봇은 각 출구의 버튼으로 열립니다. 서버는 화면을 내려 주고 익명 사용 횟수만 셉니다.'),
]

# 공개판에서 바꾸는 문구(11/2 근수님: 발표 뒤에도 실제로 쓰는 창구 · 검색에 걸리게 · 소스 받기)
PUBLIC_TEXT = [
    ('<title>연구진흥과 창구 · 성과공유회 시연</title>', '<title>연구진흥과 창구 · 부산대학교 연구처</title>'),
    ('<meta name="robots" content="noindex, nofollow"><!-- 링크로는 누구나, 검색에는 안 걸리게(11/16에 내림) -->',
     '<meta name="description" content="부산대학교 연구처 연구진흥과 창구 — 회의비 한도 같은 규정을 묻고, 서류 문구까지 바로 만들어 보는 공개 도구. 로그인 없이 누구나, 소스 코드 공개.">'),
    ('<div class="band"><b>2026. 10. 30. 성과공유회 시연용</b> · 이 페이지는 2026. 11. 16.에 닫습니다 · 여기 실린 지침은 모두 공개된 자료입니다</div>',
     '<div class="band"><b>연구진흥과 창구</b> · 실제로 작동하는 공개판 · 로그인 없이 누구나 · 새 질문은 답을 만들 때만 보내고 저장하지 않습니다 · 여기 실린 지침은 모두 공개된 자료입니다</div>'),
    ('<span class="tag">시연본</span>', '<span class="tag">공개판</span>'),
    ('세 가지 도구를 부서에서 실제로 쓰고 있고, 이 페이지는 그 모습을 보여 드리는 시연본입니다. 실제 운영본은 학교 계정 안에서 따로 돌아갑니다.',
     '세 가지 도구를 부서에서 실제로 쓰고 있고, 이 화면은 누구나 쓰실 수 있는 공개판입니다. 규정 질문은 창구 서버가 공개 규정으로 답하고, 공고는 공고봇이 모은 실제 목록이 열리며, 취합 데모는 출구 버튼으로 열립니다. 규정봇 자체는 부서 안에서만 열립니다. 소스 코드는 첫 화면에서 받으실 수 있습니다.'),
    ('<p class="psub">공개된 지침·기준에서 물어보신 항목을 찾아 근거와 함께 보여 드립니다. 이 화면은 검색이고, 실제 운영 중인 규정봇은 자료 전체를 읽고 답합니다.</p>',
     '<p class="psub">질문 버튼이든 새로 적으신 질문이든, 창구 서버가 규정봇(제미나이 노트북)과 같은 공개 규정 파일 28개에서 관련 조항을 찾아 무료 AI가 그 자리에서 근거 번호를 붙여 답하고, 근거 원문도 함께 보여 드립니다. 서버에 닿지 않을 때만 실제 규정봇에 미리 물어 둔 답을 대신 보여 드립니다.</p>'),
    ('<p class="psub">사람이 공고 사이트를 뒤지는 대신 봇이 찾아 읽고 요약해 보냅니다. 아래는 형식을 보여 드리는 <b>예시</b>입니다.</p>',
     '<p class="psub">사람이 공고 사이트를 뒤지는 대신 봇이 찾아 읽고 요약해 보냅니다. 아래는 공고봇이 매일 모으는 <b>실제 목록</b>을 이 화면을 열 때 불러온 것입니다(연결이 안 되면 옮겨 둔 기록을 보여 드립니다). AI 요약은 참고용이고, 마감·금액은 공고 원문으로 확인하세요.</p>'),
    ('적으신 말은 저장하지도 보내지도 않습니다. 이 파일 하나로 동작합니다.',
     '새 규정 질문은 답을 만들 때만 창구 서버와 구글 무료 AI로 보내고 기록에 남기지 않습니다(서버는 횟수만 셉니다). 회의비 서류 칸에 적으신 말은 저장하지도 보내지도 않습니다.'),
]

# 실제판에서 바꾸는 문구(11/3 근수님: 창구 화면 그대로, 공고·규정은 실제로 · 취합은 명단 때문에 가명 시범)
LIVE_TEXT = [
    ('<title>연구진흥과 창구 · 성과공유회 시연</title>', '<title>연구진흥과 창구</title>'),
    ('<div class="band"><b>2026. 10. 30. 성과공유회 시연용</b> · 이 페이지는 2026. 11. 16.에 닫습니다 · 여기 실린 지침은 모두 공개된 자료입니다</div>',
     '<div class="band"><b>연구진흥과 창구</b> · AI 작동판(AI가 규정을 찾아 직접 답합니다) · 공고 출구는 비번을 넣으면 공고봇이 모은 실제 공고가 열립니다 · 주간회의는 명단 보호를 위해 가명 시범 · 여기 실린 지침은 모두 공개된 자료입니다</div>'),
    ('<span class="tag">시연본</span>', '<span class="tag">AI 작동판</span>'),
    ('세 가지 도구를 부서에서 실제로 쓰고 있고, 이 페이지는 그 모습을 보여 드리는 시연본입니다. 실제 운영본은 학교 계정 안에서 따로 돌아갑니다.',
     '세 가지 도구를 부서에서 실제로 쓰고 있고, 이 화면은 그 입구인 연구진흥과 창구(AI 작동판)입니다. 공고 출구는 비번을 넣으면 공고봇이 매일 모은 실제 공고가 열리고, 규정 출구는 규정봇과 같은 공개 규정 파일 28개로 무료 AI가 답하며(회의비 서류 만들기 포함), 주간회의 출구는 명단 보호를 위해 가명 시범입니다.'),
    ('적으신 말은 저장하지도 보내지도 않습니다. 이 파일 하나로 동작합니다.',
     '규정 질문은 답을 만들 때만 서버와 구글 무료 AI로 보내고 기록에 남기지 않습니다(서버는 횟수만 셉니다). 그 밖에 서버로 가는 것은 익명 사용 횟수와, 공고를 열 때 넣는 비번(맞는지 확인만 하고 버림)뿐입니다. 회의비 서류 칸에 적으신 말은 보내지 않습니다.'),
    ('<p class="psub">공개된 지침·기준에서 물어보신 항목을 찾아 근거와 함께 보여 드립니다. 이 화면은 검색이고, 실제 운영 중인 규정봇은 자료 전체를 읽고 답합니다.</p>',
     '<p class="psub">규정봇과 같은 공개 규정 파일 28개에서 관련 조항을 찾아 무료 AI가 근거 번호를 붙여 답하고, 근거 원문도 함께 보여 드립니다. 하루 무료 한도가 차면 AI 없이 조항 원문만 보여 드리고, 다음 날 다시 쓰실 수 있습니다.</p>'),
    ('<p class="psub">사람이 공고 사이트를 뒤지는 대신 봇이 찾아 읽고 요약해 보냅니다. 아래는 형식을 보여 드리는 <b>예시</b>입니다.</p>',
     '<p class="psub">사람이 공고 사이트를 뒤지는 대신 봇이 찾아 읽고 요약해 보냅니다. 아래는 공고봇이 <b>매일 실제로 모은 공고</b>입니다. 비번을 한 번 넣으면 6시간 동안 열립니다.</p>'),
]

# 실제 기록(공개판만) — 공개판/실제_규정봇.json · 실제_공고.json
def read_real():
    qa = json.load(open(os.path.join(PUB, '실제_규정봇.json'), encoding='utf-8'))
    notices = json.load(open(os.path.join(PUB, '실제_공고.json'), encoding='utf-8'))
    return {'date': qa['date'], 'qa': qa['qa'], 'notices': notices}

src = open(SRC, encoding='utf-8').read()

def read_links():
    links_path = os.path.join(OPS, 'links.json')
    links = dict(EMPTY_LINKS)
    if os.path.exists(links_path):
        for k, v in json.load(open(links_path, encoding='utf-8')).items():
            if k in links and isinstance(v, dict):
                links[k] = {'name': v.get('name') or links[k]['name'], 'url': (v.get('url') or '').strip()}
    return links

# 0) 시연본/운영판/공개판 갈래 — 공개판 전용 블록(<!--PUBLIC-->)은 공개판에만
if not PUBLIC:
    src = re.sub(r'[ \t]*<!--PUBLIC-->[\s\S]*?<!--/PUBLIC-->\n?', '', src)
if PUBLIC:
    links = read_links()
    # 규정봇 노트북은 부서원만 열림 → 공개판엔 주소를 넣지 않고 안내 문장(PUBLIC_NOTE)만. 담당자 칸도 비움
    links['rule']['url'] = ''; links['human']['url'] = ''
    filled = [k for k, v in links.items() if v['url']]
    print('공개판: 주소 채워진 출구 %d (%s)' % (len(filled), ', '.join(filled) or '없음'))
    n_demo = len(re.findall(r'<!--DEMO-->[\s\S]*?<!--/DEMO-->', src))
    src = re.sub(r'<!--DEMO-->[\s\S]*?<!--/DEMO-->', '', src)
    print('시연 전용 블록 %d개 제거' % n_demo)
    for old, new in PUBLIC_TEXT:
        assert src.count(old) == 1, '공개판 치환 대상이 정확히 1회가 아님: ' + old[:40]
        src = src.replace(old, new)
    src = src.replace('<!--PUBLIC-->', '').replace('<!--/PUBLIC-->', '')
    src = src.replace("const MODE = '__MODE__';", "const MODE = 'public';")
    src = src.replace('const LINKS = __LINKS__;', 'const LINKS = ' + json.dumps(links, ensure_ascii=False) + ';')
    api = cg_api()
    if api:
        part = _read(LIV, 'notice_view.js') + _read(LIV, 'ask_view.js') + _read(PUB, 'public_part.js')
        src = src.replace('/*__GAS__*/', part.replace('__CG_API__', api))
        print('공개판: 창구 서버 연결 = 규정 묻기·공고 목록 (%s…)' % api[:60])
    else:
        src = src.replace('/*__GAS__*/', GAS_DEMO)
        print('공개판: 창구 서버 주소 없음 → 서버 없이(옮겨 둔 기록만)')
    real = read_real()
    print('공개판: 실제 규정봇 기록 %d건 · 실제 공고 %d건' % (len(real['qa']), len(real['notices'])))
    src = src.replace('const REAL = __REAL__;', 'const REAL = ' + json.dumps(real, ensure_ascii=False) + ';')
elif LIVE:
    links = read_links()
    for bad in ('AKfycbyzBp94', 'AKfycbwwkQrA'):   # 부서용 실명 취합봇·시험용 주소는 실제판에도 넣지 않는다(가명 데모만)
        assert bad not in json.dumps(links), '실제판에 넣으면 안 되는 주소: ' + bad
    filled = [k for k, v in links.items() if v['url']]
    print('실제판: 주소 채워진 출구 %d/4 (%s)' % (len(filled), ', '.join(filled) or '없음'))
    n_demo = len(re.findall(r'<!--DEMO-->[\s\S]*?<!--/DEMO-->', src))
    src = re.sub(r'<!--DEMO-->[\s\S]*?<!--/DEMO-->', '', src)
    print('시연 전용 블록 %d개 제거' % n_demo)
    for old, new in LIVE_TEXT:
        assert src.count(old) == 1, '실제판 치환 대상이 정확히 1회가 아님: ' + old[:40]
        src = src.replace(old, new)
    src = src.replace("const MODE = '__MODE__';", "const MODE = 'live';")
    src = src.replace('const LINKS = __LINKS__;', 'const LINKS = ' + json.dumps(links, ensure_ascii=False) + ';')
    src = src.replace('/*__GAS__*/', GAS_LIVE)
elif DEPLOY:
    links = read_links()
    filled = [k for k, v in links.items() if v['url']]
    print('운영판: 주소 채워진 출구 %d/4 (%s)' % (len(filled), ', '.join(filled) or '없음'))
    n_demo = len(re.findall(r'<!--DEMO-->[\s\S]*?<!--/DEMO-->', src))
    src = re.sub(r'<!--DEMO-->[\s\S]*?<!--/DEMO-->', '', src)
    print('시연 전용 블록 %d개 제거' % n_demo)
    for old, new in DEPLOY_TEXT:
        assert src.count(old) == 1, '운영판 치환 대상이 정확히 1회가 아님: ' + old[:40]
        src = src.replace(old, new)
    src = src.replace("const MODE = '__MODE__';", "const MODE = 'deploy';")
    src = src.replace('const LINKS = __LINKS__;', 'const LINKS = ' + json.dumps(links, ensure_ascii=False) + ';')
    src = src.replace('/*__GAS__*/', GAS_DEPLOY)
else:
    src = src.replace("const MODE = '__MODE__';", "const MODE = 'demo';")
    src = src.replace('const LINKS = __LINKS__;', 'const LINKS = ' + json.dumps(EMPTY_LINKS, ensure_ascii=False) + ';')
    src = src.replace('/*__GAS__*/', GAS_DEMO)
src = src.replace('const REAL = __REAL__;', 'const REAL = {"qa": [], "notices": []};')   # 시연본·운영판은 빈 값
for tok in ('__MODE__', '__LINKS__', '/*__GAS__*/', '__REAL__'):
    assert tok not in src, '토큰이 남음: ' + tok

# 1) 이 화면에 실제로 쓰이는 글자만 모은다 (+ 안전하게 기본 문장부호·숫자·영문)
used = set(src)
used |= set('0123456789 .,·:;!?()[]{}<>/\\-–—…"\'%&#@*+=~^|`·→←↑↓↗')
used |= set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
used |= set('①②③④⑤⑥⑦⑧⑨⑩○◎△▲▽▼◆■□§※')
chars = ''.join(sorted(c for c in used if c.isprintable() and c not in '\n\r\t'))
print('쓰이는 글자 %d자' % len(chars))

def subset(weight_file, out_path):
    """fonttools로 필요한 글자만 남긴 woff2를 만든다."""
    txt = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8')
    txt.write(chars); txt.close()
    cmd = [sys.executable, '-m', 'fontTools.subset', weight_file,
           '--text-file=' + txt.name, '--flavor=woff2', '--output-file=' + out_path,
           '--layout-features=*', '--no-hinting', '--desubroutinize']
    subprocess.run(cmd, check=True, capture_output=True)
    os.unlink(txt.name)
    return os.path.getsize(out_path)

def data_uri(path, mime):
    with open(path, 'rb') as f:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode('ascii'))

tmpdir = tempfile.mkdtemp()
# 고정 굵기 파일(Pretendard-1.3.9, 저장소 제외)이 없는 기기(9/28 노트북)에선 가변 글꼴에서 같은 굵기를 뽑는다.
# 고정 굵기 판은 가변 글꼴의 인스턴스라 모양이 같다.
# 11/2: 받아 간 분은 fonts/ 에 PretendardVariable.woff2 를 두면 된다. 우리 기기의 다른 위치는 글꼴위치.local.json(공개 묶음에 안 넣음)
VARIABLE = [os.path.join(HERE, 'fonts', 'PretendardVariable.woff2')]
_loc = os.path.join(HERE, '글꼴위치.local.json')
if os.path.exists(_loc):
    VARIABLE += [os.path.join(ROOT, *p) if not os.path.isabs(p[0]) else os.path.join(*p) for p in json.load(open(_loc, encoding='utf-8'))]

def from_variable(weight, out_path):
    vf = next((p for p in VARIABLE if os.path.exists(p)), None)
    if not vf: return None
    # 10/3: 굵기 뽑기가 한 번에 약 3분 → 같은 가변 글꼴(크기·시각이 같으면)에서 뽑은 것은 임시 폴더에 두고 다시 쓴다. 결과는 같다
    st = os.stat(vf)
    cached = os.path.join(tempfile.gettempdir(), 'changgu_font_cache', 'inst_%d_%d_%d.ttf' % (weight, st.st_size, int(st.st_mtime)))
    if not os.path.exists(cached):
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
        f = instancer.instantiateVariableFont(TTFont(vf), {'wght': weight})
        f.flavor = None
        os.makedirs(os.path.dirname(cached), exist_ok=True)
        f.save(cached + '.part'); os.replace(cached + '.part', cached)
    import shutil; shutil.copyfile(cached, out_path)
    return vf

pairs = [('__FONT400__', 'Pretendard-Regular.woff2', 400), ('__FONT800__', 'Pretendard-ExtraBold.woff2', 800)]
for token, name, weight in pairs:
    srcf = os.path.join(FONT, name)
    if not os.path.exists(srcf):
        inst = os.path.join(tmpdir, 'inst_%d.ttf' % weight)
        vf = from_variable(weight, inst)
        if not vf:
            print('폰트 없음, 건너뜀:', name); src = src.replace(token, ''); continue
        print('%s 없음 → 가변 글꼴에서 굵기 %d 뽑음 (%s)' % (name, weight, os.path.relpath(vf, ROOT)))
        srcf = inst
    outf = os.path.join(tmpdir, name)
    size = subset(srcf, outf)
    print('%s  %d KB → 심음' % (name, size // 1024))
    src = src.replace(token, data_uri(outf, 'font/woff2'))

for token, name in IMAGES:
    p = os.path.join(HERE, '자산', name)
    if os.path.exists(p):
        src = src.replace(token, data_uri(p, 'image/webp'))
        print('%s  %d KB → 심음' % (name, os.path.getsize(p) // 1024))
    else:
        print('그림 없음, 비움:', name); src = src.replace(token, '')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf-8').write(src)
print('완성: %s  %d KB' % (os.path.relpath(OUT, os.path.dirname(HERE)), os.path.getsize(OUT) // 1024))
