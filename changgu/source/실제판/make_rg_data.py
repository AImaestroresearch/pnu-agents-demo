# -*- coding: utf-8 -*-
"""창구 실제판 규정 찾기용 자료 만들기 (2026-11-03)
_규정본문/*.txt (규정봇 노트북 소스 28개와 같은 파일의 글자) → rg_data_NN.html (조각 JSON, 서버에만 올림, 깃 제외)
조각 = 약 900자 · 앞 조각과 150자 겹침 · 쪽 번호 유지.  python make_rg_data.py
"""
import os, re, json, glob, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_규정본문')
SIZE, OVER, PER_FILE = 900, 150, 330_000   # 조각 길이 · 겹침 · 파일 하나 최대 글자

# 현행 자료(옛 숫자보다 먼저) — 찾기 점수에 곱함
BOOST = {'[현행요약]': 1.6, '(2025.11.27 개정)_본문': 1.3, '연구비 관리 세부 지침 전문(2026. 9. 1.)': 1.2}

ART_RE = re.compile(r'제\d+조(?:의\d+)?\([^()\n]{1,40}\)')   # 조문 머리: 제16조(일비ㆍ숙박비ㆍ식비의 지급)
NO_HEAD_RE = re.compile(r'업무지침|사례집|기본지침|100문100답|현행요약|집행기준|집행지침|Q&A')


def clean(s):
    s = s.replace('\r', '').replace(' ', ' ').replace('​', '')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()

docs, chunks = [], []
for path in sorted(glob.glob(os.path.join(SRC, '*.txt'))):
    title = os.path.splitext(os.path.basename(path))[0]
    raw = open(path, encoding='utf-8').read()
    boost = next((v for k, v in BOOST.items() if k in title), 1.0)
    di = len(docs); docs.append({'t': title, 'b': boost})
    # 쪽 표시(<<p3>>)로 나눠 두고, 쪽 안에서 SIZE 단위로 자르되 문장/줄 끝에서 끊는다
    parts = re.split(r'<<p(\d+)>>\n?', raw)
    pages = [(0, parts[0])] if parts[0].strip() else []
    for i in range(1, len(parts), 2): pages.append((int(parts[i]), parts[i + 1]))
    if not pages: pages = [(0, raw)]
    # 11/4: 조각이 조문 중간에서 시작하면 앞에 그 조문 머리를 붙인다(「제16조(…) 이어서」) — AI도 채점기도 어느 조문인지 알게
    for pno, text in pages:
        text = clean(text)
        if len(text) < 20: continue
        # 줄 맨 앞 = 진짜 조문 머리. 해설서·사례집·집행지침처럼 남의 조문을 인용만 하는 문서는 붙이지 않음(엉뚱한 머리 방지)
        arts = [] if NO_HEAD_RE.search(title) else \
            [(m.start(), m.group(0)) for m in ART_RE.finditer(text) if m.start() == 0 or text[m.start() - 1] == chr(10)]
        pos = 0
        while pos < len(text):
            end = min(len(text), pos + SIZE)
            if end < len(text):
                cut = max(text.rfind('\n', pos + SIZE // 2, end), text.rfind('. ', pos + SIZE // 2, end))
                if cut > pos: end = cut + 1
            piece = text[pos:end].strip()
            before = [a for a in arts if a[0] <= pos and pos - a[0] <= 3000]   # 같은 쪽 안, 3천 자 안에서만
            head = before[-1][1] if before else ''
            if head and not ART_RE.match(piece):
                piece = '[' + head + ' 이어서] ' + piece
            if len(piece) >= 20: chunks.append([di, pno, piece])
            if end >= len(text): break
            pos = max(end - OVER, pos + 1)

# 파일로 나누기
for old in glob.glob(os.path.join(HERE, 'rg_data_*.html')): os.remove(old)
files, cur, size = [], [], 0
for c in chunks:
    if size + len(c[2]) > PER_FILE and cur: files.append(cur); cur, size = [], 0
    cur.append(c); size += len(c[2])
if cur: files.append(cur)
for i, part in enumerate(files, 1):
    open(os.path.join(HERE, 'rg_data_%02d.html' % i), 'w', encoding='utf-8').write(json.dumps(part, ensure_ascii=False, separators=(',', ':')))
open(os.path.join(HERE, 'rg_docs.html'), 'w', encoding='utf-8').write(json.dumps({'docs': docs, 'files': len(files), 'chunks': len(chunks)}, ensure_ascii=False))
print('문서 %d개 · 조각 %d개 · 파일 %d개 · 글자 %d' % (len(docs), len(chunks), len(files), sum(len(c[2]) for c in chunks)))
for d in docs: print(' ', d['b'], d['t'][:70])
