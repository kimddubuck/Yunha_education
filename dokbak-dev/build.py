# '오늘도 독박육아' 홈페이지 만들기
#  play-data/plays.json (놀이 데이터) → dokbak/ (올릴 정적 사이트)
#  사용: python3 dokbak-dev/build.py
#  놀이를 고치거나 더하면 play-data 에서 고치고 이 스크립트를 다시 돌리면 페이지가 전부 새로 만들어져요.
import json, os, shutil, html, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEV = os.path.join(ROOT, 'dokbak-dev')
OUT = os.path.join(ROOT, 'dokbak')
BASE = 'https://dokbak.pages.dev'   # 도메인이 정해지면 여기만 바꿔요 (sitemap · 공유 주소에 쓰여요)
APP = 'https://gongdong-sos.pages.dev/'
CONTACT = 'ifb1321@gmail.com'       # 공동육아 SOS 이용약관에 공개된 운영자 문의 메일과 같아요
SHOW = {'확정', '해봄'}              # 후보(아직 안 해 본 놀이)는 사이트에 안 올려요
V = datetime.datetime.now().strftime('%Y%m%d%H%M')

e = lambda s: html.escape(str(s), quote=True)
CUR = ' aria-current="page"'
PRESSED = ' aria-pressed="true"'

# 놀이 원리 (play-data/principles.md 와 같은 내용)
PR = {
  '넣고빼기': ('📦', '"들어가면 어디로 가지?" 안과 밖을 알아 가요', 7),
  '옮기기': ('🥄', '여기서 저기로 나르는 것 자체가 재밌어요', 12),
  '숨기고찾기': ('🙈', '안 보여도 있다는 걸 알게 돼요', 6),
  '원인결과': ('💡', '"내가 하니까 변했다!" 하는 힘을 느껴요', 4),
  '굴리고던지기': ('⚽', '날아가고 굴러가는 길이 신기해요', 9),
  '감싸고풀기': ('🎁', '싸고, 덮고, 풀어서 짠! 꺼내요', 9),
  '꽂고잇기': ('🧷', '구멍에 맞춰 끼우고, 이어서 길게 만들어요', 14),
  '쌓고무너뜨리기': ('🧱', '높이 쌓다가 와르르! 둘 다 좋아해요', 8),
  '분류짝맞추기': ('🧦', '같은 것끼리 모으며 세상을 정리해요', 18),
  '흉내역할': ('🎭', '엄마 아빠가 하는 진짜 일을 해 보고 싶어요', 15),
  '변신': ('✨', '섞고, 녹이고, 모양이 바뀌는 게 마법 같아요', 12),
  '몸으로도전': ('🧗', '기어오르고, 넘고, 균형 잡는 게 짜릿해요', 7),
  '소리만들기': ('🥁', '내 손으로 소리를 만드는 게 신나요', 3),
  '당기고떼기': ('🩹', '살짝 버티다가 "쏙" 빠지는 손맛이 좋아요', 9),
}
PR_SLUG = {k: f'p{i+1:02d}' for i, k in enumerate(PR)}
# 원리마다 '어디서 나왔나'. None 이면 연구 근거 없이 놀이 만들기용으로 우리가 묶은 분류예요 (사이트에 그렇게 표시)
PR_SRC = {
  '넣고빼기': 'Athey(1990) 놀이 도식 · enclosure(담기)', '옮기기': 'Athey(1990) 놀이 도식 · transporting(나르기)',
  '굴리고던지기': 'Athey(1990) 놀이 도식 · trajectory(궤적)', '감싸고풀기': 'Athey(1990) 놀이 도식 · enveloping(감싸기)',
  '꽂고잇기': 'Athey(1990) 놀이 도식 · connecting(연결)', '변신': 'Athey(1990) 놀이 도식 · transforming(변형)',
  '숨기고찾기': 'Piaget · 대상영속성', '흉내역할': 'AAP 「The Power of Play」(2018) · Parten(1932)',
  '몸으로도전': 'Sandseter & Kennair(2011) · 위험한 놀이',
  '원인결과': None, '쌓고무너뜨리기': None, '분류짝맞추기': None, '소리만들기': None, '당기고떼기': None,
}
NOSRC = '놀이 만들기용 분류 · 연구 근거 없음'
# 출처 이름을 누르면 펼쳐지는 '누구예요?' 설명
BIO = {
  'Athey': ('Athey(1990) 놀이 도식', '크리스 애시(Chris Athey)는 영국의 유아교육 연구자예요. 런던 프뢰벨 교육원에서 1970년대에 어린아이들을 몇 년 동안 관찰한 "프뢰벨 유아교육 프로젝트"를 이끌었고, 그 결과를 1990년 책 『Extending Thought in Young Children』으로 냈어요. 장난감이 달라도 되풀이되는 아이의 행동 패턴을 "도식(schema)"이라고 불렀고, 영국 어린이집·유치원 교사 교육에서 널리 쓰여요.'),
  'Piaget': ('Piaget 대상영속성', '장 피아제(Jean Piaget, 1896~1980)는 스위스의 심리학자예요. 아이의 생각이 나이에 따라 단계적으로 자란다는 "인지발달 이론"을 세웠고, 눈앞에서 사라진 물건도 계속 있다는 걸 아기가 차츰 알게 되는 것을 "대상영속성"이라고 했어요. 지금 쓰이는 아동심리학 교과서 대부분의 바탕이 된 사람이에요.'),
  'AAP': ('AAP(2018) · Parten(1932)', '미국소아과학회(AAP)는 미국 소아과 의사들이 모인 학회예요. 2018년 보고서 「The Power of Play」의 대표 저자 마이클 요그먼(Michael Yogman)은 하버드 의대 소속 소아과 의사예요. 밀드레드 파튼(Mildred Parten)은 미국의 사회학자로, 1930년대 미네소타 대학에서 유치원 아이들이 노는 모습을 관찰해 혼자 놀기→나란히 놀기→어울려 놀기 같은 "같이 노는 단계"를 나눴어요.'),
  'Sandseter': ('Sandseter & Kennair(2011)', '엘렌 베아테 산세테르(Ellen Beate Hansen Sandseter)는 노르웨이 퀸 모드 유아교육대학 교수로, 아이들이 일부러 찾는 "살짝 무서운 놀이"를 오래 연구한 사람이에요. 함께 쓴 레이프 케나이르(Leif Kennair)는 노르웨이 과학기술대(NTNU)의 진화심리학자예요. 높은 곳, 빠른 속도, 몸싸움 같은 놀이가 두려움을 이겨 내는 데 도움이 된다고 봤어요.'),
}
def bio_of(src):
  for k, v in BIO.items():
    if src and src.startswith(k): return v
  return None
def src_chips(k, n):
  # 줄바꿈이 항목 사이에서만 일어나게 항목마다 nowrap 칩으로
  src = PR_SRC[k]
  if not src: return f'<span class="chip-m">🧪 {NOSRC}</span><span class="chip-m">놀이 {n}가지</span>'
  parts = src.split(' · ')
  return ''.join(f'<span class="chip-m">{e(x)}</span>' for x in parts) + f'<span class="chip-m">놀이 {n}가지</span>'
def src_details(k):
  b = bio_of(PR_SRC[k])
  if not b: return ''
  return f'<details class="srcd"><summary>👤 {e(b[0])} — 누구예요?</summary><p>{e(b[1])}</p></details>'
PR_NAME = {'넣고빼기': '넣고 빼기', '숨기고찾기': '숨기고 찾기', '원인결과': '원인과 결과', '굴리고던지기': '굴리고 던지기', '감싸고풀기': '감싸고 풀기', '꽂고잇기': '꽂고 잇기', '쌓고무너뜨리기': '쌓고 무너뜨리기', '분류짝맞추기': '분류·짝 맞추기', '흉내역할': '흉내·역할', '몸으로도전': '몸으로 도전', '소리만들기': '소리 만들기', '당기고떼기': '당기고 떼기'}
pn = lambda k: PR_NAME.get(k, k)

# 개월수 묶음 (주소 · 이름 · 범위)
BANDS = [('0-3m', '0~3개월', 0, 3), ('4-6m', '4~6개월', 4, 6), ('7-9m', '7~9개월', 7, 9), ('10-12m', '10~12개월', 10, 12),
         ('13-18m', '13~18개월', 13, 18), ('19-24m', '19~24개월', 19, 24), ('2y', '두 돌~세 돌 (25~36개월)', 25, 36),
         ('3y', '3~4세', 37, 48), ('4y', '4~5세', 49, 60), ('5y', '5~7세', 61, 96)]
BAND_INTRO = {
  '0-3m': '아직은 "보고 듣는" 시기예요. 엄마 얼굴, 흑백 무늬, 부드러운 소리가 최고의 장난감이에요. 짧게, 자주, 기분 좋을 때만 해요.',
  '4-6m': '손으로 잡고 입으로 확인하는 시기예요. 잡기 쉬운 천과 소리 나는 물건으로 "내가 하니까 변한다"를 느끼게 해 줘요.',
  '7-9m': '기고 앉기 시작하면 넣고 빼기, 까꿍, 무너뜨리기에 푹 빠져요. 바닥에 안전한 놀이 공간을 넓게 만들어 주세요.',
  '10-12m': '잡고 서고 따라 하는 시기예요. 짝짜꿍 같은 손놀이와 주고받기 놀이로 "같이 노는 재미"를 처음 알아 가요.',
  '13-18m': '걷기 시작하면 나르기, 꽂기, 떼기를 끝없이 반복해요. 생활 물건을 그대로 장난감으로 내주면 오래 집중해요.',
  '19-24m': '"내가 할래!" 시기예요. 붓고, 옮기고, 짝 맞추는 놀이로 스스로 해냈다는 기분을 많이 느끼게 해 주세요.',
  '2y': '흉내 내기와 역할놀이가 시작돼요. 밀가루 반죽, 소꿉놀이처럼 손과 말을 같이 쓰는 놀이가 잘 맞아요.',
  '3y': '규칙이 있는 놀이를 할 수 있게 돼요. 차례 지키기, 보물찾기, 가위질처럼 조금 어려운 도전을 좋아해요.',
  '4y': '친구와 함께하는 놀이가 즐거워지는 시기예요. 팀 놀이와 간단한 실험으로 "왜?"에 답해 주세요.',
  '5y': '스스로 계획하고 만드는 놀이를 좋아해요. 시장 놀이, 이야기 만들기처럼 생각을 말로 나누는 놀이가 좋아요.',
}
SHORT = {'2y': '2~3세', '3y': '3~4세', '4y': '4~5세', '5y': '5~7세'}   # 칩·탭용 짧은 이름 (추천기와 같게)
short = lambda s, n: SHORT.get(s, n.split(' (')[0])
PLACE_ICON = {'실내': '🏠', '실외': '🌳', '욕실': '🛁', '주방': '🍳'}
MESS = ['깔끔', '보통', '많이']

def age(m):
  return f'{m}개월' if m <= 36 else f'{m // 12}세'
def age_range(p):
  a, b = p['ageMin'], p['ageMax']
  if b <= 36: return f'{a}~{b}개월'
  if a <= 36: return f'{a}개월~{b // 12}세'
  return f'{a // 12}~{b // 12}세'
def in_band(p, lo, hi):
  return p['ageMin'] <= hi and p['ageMax'] >= lo

def page(title, desc, body, path, active='', extra_head=''):
  depth = path.count('/')
  up = '../' * depth
  nav = [('plays/', '놀이 찾기'), ('age/', '개월수별'), ('principles.html', '놀이 원리'), ('daycare/', '어린이집')]
  navh = ''.join(f'<a href="{up}{h or "./"}"{CUR if active == h else ""}>{t}</a>' for h, t in nav)
  return f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{BASE}/{path.replace('index.html', '')}">
<meta property="og:type" content="website"><meta property="og:site_name" content="오늘도 독박육아">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta name="theme-color" content="#2a9095">
<link rel="icon" href="{up}assets/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap">
<link rel="stylesheet" href="{up}assets/site.css?v={V}">
{extra_head}</head>
<body>
<header class="top"><div class="wrap">
  <a class="logo" href="{up}./"><img src="{up}assets/icon.svg" alt="" width="30" height="30"><b>오늘도 독박육아</b></a>
  <nav class="nav" aria-label="메뉴">{navh}</nav>
  <a class="top-sos" href="{APP}"><i>🆘 </i>공동육아 SOS</a>
</div></header>
<main>
{body}
</main>
<footer><div class="wrap">
  <a class="logo" href="{up}./"><img src="{up}assets/icon.svg" alt="" width="30" height="30"><b>오늘도 독박육아</b></a>
  <p>독박육아 하는 날을 덜 외롭게.<br>집에 있는 물건으로 하는 놀이와 공동육아 도구를 만들어요.</p>
  <div class="flinks"><a href="{up}about.html">소개</a><a href="{up}privacy.html">개인정보처리방침</a><a href="{up}terms.html">이용약관</a><a href="{APP}">공동육아 SOS</a><span>문의 {CONTACT}</span></div>
</div></footer>
</body>
</html>
'''

def card(p, up):
  return (f'<a class="card" href="{up}plays/{p["id"]}.html"><span class="meta">{age_range(p)} · {PLACE_ICON[p["place"]]} {p["place"]}{" · 👨‍👩‍👧 여럿이" if p["group"] else ""}</span>'
          f'<h3>{e(p["name"])}</h3><p>{e(p["steps"][0])}</p></a>')

SOS_BRIDGE = f'''<div class="bridge"><p>이 놀이, <b>혼자 하기 버거우면</b>?<br>같은 단지 엄마 아빠와 같이 해요.</p><a class="btn sos" href="{APP}">🆘 이 시간에 SOS 보내기</a></div>'''
SOS_BAND = f'''<div class="band">
  <div>
    <h2>🆘 혼자 버티기 힘든 날,<br>공동육아 SOS</h2>
    <p>원래 쓰던 단톡방은 그대로 두고,<br>약속만 여기서 잡아요.</p>
    <ul><li>🆘 힘든 날엔 SOS만 꾹</li><li>👀 SOS가 몰린 시간은 모두가 봐요</li><li>🙌 용기 낸 한 명이 모임을 열어요</li><li>🙋 가입 없이 링크 + 비밀번호 + 닉네임</li></ul>
    <div class="cta"><a class="btn w" href="{APP}">공동육아 SOS 열기</a><a class="btn o" href="{APP}guide.html">📖 그림 사용법</a></div>
  </div>
  <div class="ph" aria-hidden="true"><div class="s">
    <div class="r"><span>우리 단지 공동육아</span><span>👥 9</span></div>
    <div style="font-weight:700">🆘 내일 SOS 4명</div>
    <div class="d"><span>13시</span><span class="h">14시 2</span><span class="h">15시 3</span><span>16시</span></div>
    <div class="m">🙌 <b>15시 키즈룸 비눗방울 놀이</b><br>참석 3 · 미확정 1</div>
    <div class="b">💪 모임 열기</div>
  </div></div>
</div>'''

def build():
  rows = [p for p in json.load(open(os.path.join(ROOT, 'play-data', 'plays.json'), encoding='utf-8')) if p['status'] in SHOW]
  if os.path.isdir(OUT): shutil.rmtree(OUT)
  for d in ('assets', 'plays', 'age', 'principles'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
  shutil.copy(os.path.join(DEV, 'site.css'), os.path.join(OUT, 'assets', 'site.css'))
  shutil.copy(os.path.join(DEV, 'icon.svg'), os.path.join(OUT, 'assets', 'icon.svg'))
  files = {}

  # ── 놀이 하나하나 (검색으로 들어오는 페이지)
  for p in rows:
    same = [q for q in rows if q is not p and set(q['principles']) & set(p['principles']) and in_band(q, p['ageMin'], p['ageMax'])][:4]
    why = ''.join(f'<li>{PR[k][0]} <b>{pn(k)}</b>: {PR[k][1]} <a href="../principles/{PR_SLUG[k]}.html">더 보기</a></li>' for k in p['principles'])
    ld = {'@context': 'https://schema.org', '@type': 'HowTo', 'name': p['name'], 'totalTime': f'PT{p["minutes"]}M',
          'supply': [{'@type': 'HowToSupply', 'name': m} for m in p['materials']],
          'step': [{'@type': 'HowToStep', 'text': s} for s in p['steps']]}
    body = f'''<div class="wrap">
<p class="crumb"><a href="../">홈</a> › <a href="./">놀이 찾기</a> › {e(p['name'])}</p>
<div class="detail"><article>
  <div class="tags">{''.join(f'<span class="tag">{e(s)}</span>' for s in p['skills'])}</div>
  <h1 style="margin-top:8px">{e(p['name'])}</h1>
  <div class="facts">
    <div><span>추천 나이</span><b>{age_range(p)}</b></div>
    <div><span>장소</span><b>{PLACE_ICON[p['place']]} {p['place']}</b></div>
    <div><span>시간</span><b>약 {p['minutes']}분</b></div>
    <div><span>어지름</span><b>{MESS[p['mess']]}</b></div>
  </div>
  <div class="box why"><h2>💭 아이가 왜 좋아할까?</h2><ul>{why}</ul></div>
  <div class="box"><h2>🧺 준비물</h2><ul>{''.join(f'<li>{e(m)}</li>' for m in p['materials'])}</ul></div>
  <div class="box"><h2>👣 이렇게 해요</h2><ol>{''.join(f'<li>{e(s)}</li>' for s in p['steps'])}</ol></div>
  {f'<div class="box"><h2>💡 엄마 꿀팁</h2><p>{e(p["tip"])}</p></div>' if p['tip'] else ''}
  {f'<div class="box safe"><h2>⚠️ 안전하게</h2><p>{e(p["safety"])}</p></div>' if p['safety'] else ''}
  {'<p class="tag sun" style="margin-top:14px">👨‍👩‍👧 공동육아 모임에서 여럿이 하기 좋아요</p>' if p['group'] else ''}
</article>
<aside class="side">{SOS_BRIDGE}
  {f'<div class="box" style="margin-top:0"><h2>🔁 비슷한 놀이</h2><div class="cards" style="grid-template-columns:1fr">{"".join(card(q, "../") for q in same)}</div></div>' if same else ''}
</aside></div></div>'''
    files[f'plays/{p["id"]}.html'] = page(f'{p["name"]} · {age_range(p)} 엄마표 놀이 | 오늘도 독박육아',
      f'{age_range(p)} 아기와 집에서 하는 {p["name"]}. 준비물: {", ".join(p["materials"][:3])}. 하는 방법과 안전 수칙까지.',
      body, f'plays/{p["id"]}.html', 'plays/', f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n')

  # ── 놀이 찾기 (필터)
  mini = [{k: p[k] for k in ('id', 'name', 'ageMin', 'ageMax', 'place', 'group', 'principles')} | {'s': p['steps'][0], 'a': age_range(p)} for p in rows]
  body = f'''<div class="wrap"><section class="blk">
<div class="sh"><span class="ey">놀이 찾기</span><h1 style="font-size:clamp(26px,5vw,36px)">🔍 우리 아이랑 할 놀이 찾기</h1><p>개월수, 장소, 놀이 원리로 골라 보세요. 모두 집에 있는 물건으로 할 수 있어요.</p></div>
<div class="filters">
  <div class="row"><span>나이</span><div class="seg" data-k="b"><button type="button" data-v="" aria-pressed="true">전체</button>{''.join(f'<button type="button" data-v="{s}">{n.split(" (")[0]}</button>' for s, n, a, b in BANDS)}</div></div>
  <div class="row"><span>장소</span><div class="seg" data-k="p"><button type="button" data-v="" aria-pressed="true">전체</button>{''.join(f'<button type="button" data-v="{k}">{v} {k}</button>' for k, v in PLACE_ICON.items())}</div></div>
  <div class="row"><span>원리</span><div class="seg" data-k="r"><button type="button" data-v="" aria-pressed="true">전체</button>{''.join(f'<button type="button" data-v="{k}">{v[0]} {pn(k)}</button>' for k, v in PR.items())}</div></div>
  <div class="row"><span>인원</span><div class="seg" data-k="g"><button type="button" data-v="" aria-pressed="true">상관없음</button><button type="button" data-v="1">👨‍👩‍👧 여럿이 하기 좋은 것</button></div></div>
</div>
<p class="count" id="count"></p>
<div class="cards" id="list">{''.join(card(p, '../') for p in rows)}</div>
</section>
<section class="blk">{SOS_BRIDGE}</section></div>
<script>
const PLAYS = {json.dumps(mini, ensure_ascii=False)};
const BANDS = {json.dumps({s: [a, b] for s, n, a, b in BANDS})};
const ICON = {json.dumps(PLACE_ICON, ensure_ascii=False)};
const st = {{b: '', p: '', r: '', g: ''}};
const esc = s => String(s).replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]));
try{{ const q = new URLSearchParams(location.search); for(const k in st) if(q.get(k)) st[k] = q.get(k); }}catch(err){{}}
function draw(){{
  document.querySelectorAll('.filters .seg').forEach(s => s.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === st[s.dataset.k])));
  const [lo, hi] = st.b ? BANDS[st.b] : [0, 999];
  const list = PLAYS.filter(p => p.ageMin <= hi && p.ageMax >= lo && (!st.p || p.place === st.p) && (!st.r || p.principles.includes(st.r)) && (!st.g || p.group));
  document.getElementById('count').textContent = `놀이 ${{list.length}}개`;
  document.getElementById('list').innerHTML = list.map(p => `<a class="card" href="${{p.id}}.html"><span class="meta">${{p.a}} · ${{ICON[p.place]}} ${{p.place}}${{p.group ? ' · 👨‍👩‍👧 여럿이' : ''}}</span><h3>${{esc(p.name)}}</h3><p>${{esc(p.s)}}</p></a>`).join('') || '<p class="none">조건에 맞는 놀이가 아직 없어요. 조건을 하나 풀어 보세요.</p>';
  try{{ const q = new URLSearchParams(); for(const k in st) if(st[k]) q.set(k, st[k]); history.replaceState(null, '', q.toString() ? '?' + q : location.pathname); }}catch(err){{}}
}}
document.querySelector('.filters').addEventListener('click', ev => {{ const b = ev.target.closest('button'); if(!b) return; st[b.closest('.seg').dataset.k] = b.dataset.v; draw(); }});
draw();
</script>'''
  files['plays/index.html'] = page('엄마표 놀이 찾기 · 개월수·장소별 | 오늘도 독박육아', '0개월부터 7세까지, 집에 있는 물건으로 하는 엄마표 놀이를 개월수·장소·놀이 원리로 찾아보세요.', body, 'plays/index.html', 'plays/')

  # ── 개월수별
  for s, n, lo, hi in BANDS:
    lst = [p for p in rows if in_band(p, lo, hi)]
    tabs = ''.join(f'<a class="chip" href="{t}.html"{PRESSED if t == s else ""}>{short(t, m)}</a>' for t, m, a, b in BANDS)
    body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="./">개월수별</a> › {n}</p>
<section class="blk" style="padding-top:12px"><div class="chips grid4" style="margin:0 0 18px">{tabs}</div>
<div class="sh"><span class="ey">개월수별 놀이</span><h1 style="font-size:clamp(26px,5vw,36px)">📅 {n} 놀이 {len(lst)}가지</h1><p>{BAND_INTRO[s]}</p></div>
<div class="cards">{''.join(card(p, '../') for p in lst) or '<p class="none">준비 중이에요.</p>'}</div></section>
<section class="blk">{SOS_BRIDGE}</section></div>'''
    files[f'age/{s}.html'] = page(f'{n} 아기 놀이 {len(lst)}가지 · 엄마표 놀이 | 오늘도 독박육아', f'{n} 아기와 집에서 하는 엄마표 놀이 {len(lst)}가지. {BAND_INTRO[s]}', body, f'age/{s}.html', 'age/')
  body = f'''<div class="wrap"><section class="blk"><div class="sh"><span class="ey">개월수별 놀이</span><h1 style="font-size:clamp(26px,5vw,36px)">📅 우리 아기 개월수에 맞는 놀이</h1><p>개월수를 고르면 그 시기에 딱 맞는 놀이를 모아 보여 드려요.</p></div>
<div class="prs">{''.join(f'<a class="pr" href="{s}.html"><span class="meta">놀이 {sum(1 for p in rows if in_band(p, lo, hi))}가지</span><h3>{n}</h3><p>{BAND_INTRO[s]}</p></a>' for s, n, lo, hi in BANDS)}</div></section></div>'''
  files['age/index.html'] = page('개월수별 엄마표 놀이 | 오늘도 독박육아', '0~3개월부터 5~7세까지 개월수별로 맞는 엄마표 놀이를 모았어요.', body, 'age/index.html', 'age/')

  # ── 놀이 원리
  for k, (ic, why, frm) in PR.items():
    lst = [p for p in rows if k in p['principles']]
    body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="../principles.html">놀이 원리</a> › {pn(k)}</p>
<section class="blk" style="padding-top:12px"><div class="sh"><span class="ey">{'📚 연구 근거 · ' + PR_SRC[k] if PR_SRC[k] else '🧪 ' + NOSRC}</span><h1 style="font-size:clamp(26px,5vw,36px)">{ic} {pn(k)}</h1><p>{why}</p>{src_details(k)}{'' if PR_SRC[k] else '<p class="gnote">이 분류는 연구에서 가져온 게 아니라, 집 물건으로 놀이를 만들기 쉽게 우리가 묶은 거예요. 아래 놀이들은 그 분류로 만든 거고요.</p>'}</div>
<div class="cards">{''.join(card(p, '../') for p in lst) or '<p class="none">준비 중이에요.</p>'}</div></section></div>'''
    files[f'principles/{PR_SLUG[k]}.html'] = page(f'{pn(k)} 놀이 · 아이가 좋아하는 이유 | 오늘도 독박육아', f'{why}. {pn(k)} 원리로 하는 엄마표 놀이 {len(lst)}가지.', body, f'principles/{PR_SLUG[k]}.html', 'principles.html')
  body = f'''<div class="wrap"><section class="blk prose" style="max-width:none">
<div class="sh"><span class="ey">놀이 원리</span><h1 style="font-size:clamp(26px,5vw,36px)">🧠 아이는 왜 이걸 좋아할까?</h1><p>엄마표 놀이 대부분은 아래 원리 몇 개를 생활 물건으로 조합한 거예요.<br>원리를 알면 집에 있는 물건만 보고도 새 놀이를 만들 수 있어요.</p></div>
<h2>배움이 일어나는 놀이의 5가지 특징</h2>
<p class="src" style="margin:0 0 8px">Zosh 외, 「Learning through play: a review of the evidence」 (LEGO 재단, 2017)에서 정리한 특징이에요. 다섯 가지가 매 순간 다 있을 필요는 없대요.</p>
<ol class="rules"><li><b>즐거워요</b> (joyful)</li><li><b>의미가 있어요</b> (meaningful)</li><li><b>푹 빠져요</b> (actively engaging)</li><li><b>되풀이하며 시도해요</b> (iterative)</li><li><b>함께해요</b> (socially interactive)</li></ol>
<h2>📚 연구에서 확인된 놀이 패턴 {sum(1 for k in PR if PR_SRC[k])}가지</h2>
<p class="src" style="margin:0 0 8px">영국 Athey(1990)의 놀이 도식 연구, Piaget의 대상영속성, 미국소아과학회 보고서, Sandseter의 위험한 놀이 연구에서 가져왔어요. 우리말 이름은 우리가 붙였어요.</p>
<div class="prs">{''.join(f'<div class="pr pr2"><div class="meta chips-m">{src_chips(k, sum(1 for p in rows if k in p["principles"]))}</div><a href="principles/{PR_SLUG[k]}.html"><h3>{v[0]} {pn(k)}</h3><p>{v[1]}</p></a>{src_details(k)}</div>' for k, v in PR.items() if PR_SRC[k])}</div>
<div class="box"><h2>👤 이름 풀이: 이 사람들은 누구예요?</h2><ul>
<li><b>Athey (크리스 애시)</b> 영국 유아교육 연구자. 런던 프뢰벨 교육원에서 1970년대에 아이들을 몇 년간 관찰해 "놀이 도식"을 정리했고 1990년 책으로 냈어요.</li>
<li><b>Piaget (장 피아제, 1896~1980)</b> 스위스 심리학자. 아이의 생각이 단계적으로 자란다는 인지발달 이론을 세운, 아동심리학의 기본이 되는 사람이에요.</li>
<li><b>Parten (밀드레드 파튼)</b> 미국 사회학자. 1930년대 미네소타 대학에서 유치원 아이들의 노는 모습을 관찰해 "같이 노는 단계"를 나눴어요.</li>
<li><b>AAP (미국소아과학회)</b> 미국 소아과 의사들의 학회. 2018년 보고서 대표 저자는 하버드 의대 소아과 의사 마이클 요그먼이에요.</li>
<li><b>Sandseter (산세테르) & Kennair (케나이르)</b> 노르웨이 유아교육·진화심리학 교수. 아이들이 일부러 찾는 "살짝 무서운 놀이"를 연구했어요.</li>
<li><b>Zosh (조시) 외 · LEGO 재단</b> 미국 발달심리학자들(펜실베이니아 주립대·템플대·델라웨어대)이 레고 그룹이 세운 재단의 지원으로 쓴 보고서예요.</li></ul>
<p style="margin-top:8px"><a class="btn ghost" href="research.html">연구마다 자세히 보기</a></p></div>
<h2>🧪 놀이 만들기용 분류 {sum(1 for k in PR if not PR_SRC[k])}가지 (연구 근거 없음)</h2>
<p class="src" style="margin:0 0 8px">연구에서 가져온 게 아니에요. 집 물건으로 새 놀이를 만들 때 쓰려고 우리가 묶은 분류라서, 발달 근거로 읽지 말아 주세요.</p>
<div class="prs">{''.join(f'<div class="pr pr2"><div class="meta chips-m">{src_chips(k, sum(1 for p in rows if k in p["principles"]))}</div><a href="principles/{PR_SLUG[k]}.html"><h3>{v[0]} {pn(k)}</h3><p>{v[1]}</p></a></div>' for k, v in PR.items() if not PR_SRC[k])}</div>
<h2>새 놀이 만드는 공식</h2>
<p><b>원리 1~2개 + 집에 있는 물건 1~2개 + 아이 나이에 맞는 난이도</b></p>
<ul><li>꽂고 잇기 + 채반 → 채반 구멍에 빨대 꽂기</li><li>당기고 떼기 + 빨래집게 + 상자 → 상자 테두리 빨래집게 떼기</li><li>굴리고 던지기 + 휴지심 + 벽 → 벽에 휴지심 미끄럼틀 붙여 공 굴리기</li></ul>
<p>어리면 <b>크게·적게·느리게</b>, 크면 <b>작게·많게·규칙 더하기</b>로 난이도를 바꿔요.</p>
<div class="box why"><h2>📚 어디까지가 연구이고 어디부터가 우리 생각인가요?</h2><p>위 '연구에서 확인된 패턴'은 출처가 있는 내용이에요. '놀이 만들기용 분류'와 <b>새 놀이 만드는 공식, 놀이마다 적은 추천 나이·방법·꿀팁은 우리가 생각해서 쓴 것</b>이라 발달 근거로 보지 말고 참고만 해 주세요. 각 연구가 무슨 내용인지는 아래에서 볼 수 있어요.</p><p style="margin-top:8px"><a class="btn ghost" href="research.html">참고한 연구 보기</a></p></div>
<h2>⚠️ 생활 물건으로 놀 때 안전 원칙</h2>
<ul><li>3세 미만은 휴지심 구멍(지름 약 3.5cm)에 들어가는 크기는 질식 위험이 있어요. 꼭 지켜보거나 빼 주세요.</li><li>비닐봉지·랩·고무줄·끈은 얼굴이나 목에 닿지 않게 하고, 놀이가 끝나면 바로 치워요.</li><li>칼·가위·글루건으로 하는 준비는 어른만 해요.</li><li>물놀이는 얕은 물이라도 어른이 늘 옆에 있어요.</li></ul>
</section></div>'''
  files['principles.html'] = page('놀이 원리 · 연구에서 확인된 놀이 패턴 | 오늘도 독박육아', '연구에서 확인된 놀이 패턴 9가지와 놀이 만들기용 분류 5가지를 출처와 함께 나눠 보여 드려요.', body, 'principles.html', 'principles.html')

  # ── 홈
  feat = [p for p in rows if p['group']][:6]
  body = f'''<section class="hero" id="reco"><div class="wrap">
  <h1>오늘도 혼자 버티는 날,<br><em>뭐 하고 놀지</em>부터 정해요</h1>
  <p class="lead">나이와 장소만 고르면 집에 있는 물건으로<br>바로 할 수 있는 놀이 3개를 골라 드려요.</p>
  <div class="reco">
    <div class="form">
      <div class="field"><span>아기 나이</span><div class="seg g4" data-k="b"></div></div>
      <div class="field"><span>어디서</span><div class="seg g5" data-k="p"></div></div>
      <div class="field"><span>몇 명이</span><div class="seg g2" data-k="g"></div></div>
    </div>
    <div class="out">
      <div class="cards" id="reco3" style="grid-template-columns:1fr"></div>
      <div class="out-btns"><button type="button" class="btn ghost" id="shuffle">🔄 다른 놀이 보기</button><a class="btn ghost" id="moreLink" href="plays/">전체 보기 ›</a></div>
      {SOS_BRIDGE}
    </div>
  </div>
</div></section>

<section class="blk"><div class="wrap">
  <div class="sh"><span class="ey">개월수별 놀이</span><h2>📅 우리 아기 개월수에 맞는 놀이</h2></div>
  <div class="chips grid4">{''.join(f'<a class="chip" href="age/{s}.html">{short(s, n)}</a>' for s, n, a, b in BANDS)}</div>
</div></section>

<section class="blk"><div class="wrap">
  <div class="sh"><span class="ey">놀이 원리</span><h2>🧠 원리를 알면 집 물건이 다 장난감</h2><p>넣고 빼기, 당기고 떼기, 쌓고 무너뜨리기… 아이가 빠지는 데엔 이유가 있어요.</p></div>
  <div class="prs">{''.join(f'<a class="pr" href="principles/{PR_SLUG[k]}.html"><h3>{PR[k][0]} {pn(k)}</h3><p>{PR[k][1]}</p></a>' for k in list(PR)[:6])}</div>
  <p style="margin-top:12px"><a class="btn ghost" href="principles.html">14가지 원리 모두 보기</a></p>
</div></section>

<section class="blk"><div class="wrap">
  <div class="sh"><span class="ey">육아 정보</span><h2>📖 알아 두면 덜 헤매요</h2></div>
  <div class="prs">
    <a class="pr" href="daycare/"><span class="meta">21가지 주제 · 방문 체크리스트</span><h3>🏫 어린이집 기초 알기</h3><p>반 편성, 선생님 1명당 아이 수, 하루 일과, 비용, 입소 순서까지. 처음 보내는 분을 위해 정리했어요.</p></a>
    <a class="pr" href="brands.html"><span class="meta">프뢰벨 · 몬테소리 · 눈높이 · 씽크빅</span><h3>🏢 유아교육 회사 이름 풀이</h3><p>광고에서 보는 이름이 원래 누구고 어떤 회사인지, 공개 자료로 확인한 것만 적었어요.</p></a>
    <a class="pr" href="research.html"><span class="meta">미국소아과학회 · 누리과정 등</span><h3>📚 놀이에 대한 연구</h3><p>놀이가 왜 중요한지, 아이는 어떻게 노는지. 세계 연구와 우리나라 공공 자료를 쉽게 풀었어요.</p></a>
  </div>
</div></section>

<section class="blk"><div class="wrap">
  <div class="sh"><span class="ey">같이 하면 더 신나요</span><h2>👨‍👩‍👧 공동육아 모임에서 하기 좋은 놀이</h2></div>
  <div class="cards">{''.join(card(p, '') for p in feat)}</div>
</div></section>

<section class="blk" id="sos"><div class="wrap">{SOS_BAND}</div></section>
<script>
const PLAYS = {json.dumps(mini, ensure_ascii=False)};
const B = {json.dumps([[s, n.split(" (")[0], a, b] for s, n, a, b in BANDS], ensure_ascii=False)};
const ICON = {json.dumps(PLACE_ICON, ensure_ascii=False)};
const LBL = {{'0-3m': ['0~3', '개월'], '4-6m': ['4~6', '개월'], '7-9m': ['7~9', '개월'], '10-12m': ['10~12', '개월'], '13-18m': ['13~18', '개월'], '19-24m': ['19~24', '개월'], '2y': ['2~3', '세'], '3y': ['3~4', '세'], '4y': ['4~5', '세'], '5y': ['5~7', '세']}};
const OPT = {{b: B.map(x => [x[0], LBL[x[0]].join('')]), p: [['', '어디든'], ['실내', '🏠 집'], ['실외', '🌳 밖'], ['욕실', '🛁 욕실'], ['주방', '🍳 주방']], g: [['', '우리 아이만'], ['1', '👨‍👩‍👧 여럿이']]}};
const st = {{b: '13-18m', p: '', g: '', seed: 0}};
try{{ const m = localStorage.getItem('dokbakBand'); if(m && B.some(x => x[0] === m)) st.b = m; }}catch(err){{}}
const esc = s => String(s).replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]));
function segs(){{
  document.querySelectorAll('.form .seg').forEach(box => {{
    const k = box.dataset.k;
    box.innerHTML = OPT[k].map(([v, t]) => `<button type="button" data-v="${{v}}" aria-pressed="${{st[k] === v}}">${{t}}</button>`).join('');
  }});
}}
function pick(){{
  const [, , lo, hi] = B.find(x => x[0] === st.b);
  const ok = p => p.ageMin <= hi && p.ageMax >= lo && (!st.p || p.place === st.p);
  let list = PLAYS.filter(p => ok(p) && (!st.g || p.group));
  if(list.length < 3) list = list.concat(PLAYS.filter(p => ok(p) && !list.includes(p)));
  const r = list.length ? (st.seed * 3) % list.length : 0;
  return list.slice(r).concat(list.slice(0, r)).slice(0, 3);
}}
function render(){{
  const list = pick();
  document.getElementById('moreLink').href = 'plays/?b=' + st.b + (st.p ? '&p=' + st.p : '') + (st.g ? '&g=1' : '');
  document.getElementById('reco3').innerHTML = list.map(p => `<a class="card" href="plays/${{p.id}}.html"><span class="meta">${{p.a}} · ${{ICON[p.place]}} ${{p.place}}${{p.group ? ' · 👨‍👩‍👧 여럿이' : ''}}</span><h3>${{esc(p.name)}}</h3><p>${{esc(p.s)}}</p></a>`).join('') || '<p class="none">이 조합에 맞는 놀이를 아직 못 모았어요. 장소를 바꿔 보세요.</p>';
}}
document.querySelector('.form').addEventListener('click', ev => {{ const b = ev.target.closest('.seg button'); if(!b) return; const k = b.closest('.seg').dataset.k; st[k] = b.dataset.v; st.seed = 0; if(k === 'b') try{{ localStorage.setItem('dokbakBand', st.b); }}catch(err){{}} segs(); render(); }});
document.getElementById('shuffle').onclick = () => {{ st.seed++; render(); }};
segs(); render();
</script>'''
  files['index.html'] = page('오늘도 독박육아 · 개월수별 엄마표 놀이', '독박육아 하는 날, 아기 개월수만 고르면 집에 있는 물건으로 바로 할 수 있는 엄마표 놀이를 골라 드려요. 같이 키우는 공동육아 SOS까지.', body, 'index.html', '')

  # ── 소개 · 개인정보 · 약관 (광고 승인에 꼭 필요해요)
  prose = lambda t, h: f'<div class="wrap"><section class="blk prose">{h}</section></div>'
  files['about.html'] = page('소개 | 오늘도 독박육아', '오늘도 독박육아는 독박육아 하는 날을 덜 외롭게 만드는 놀이 정보 사이트예요.', prose('소개', f'''<h1>☕ 오늘도 독박육아</h1>
<p>혼자 아이를 보는 날, 제일 막막한 건 "오늘 뭐 하고 놀지?"예요. 이 사이트는 그 질문에 바로 답하려고 만들었어요.</p>
<h2>무엇을 하나요</h2><ul><li>개월수별로 집에 있는 물건으로 하는 놀이를 모아요.</li><li>아이가 왜 그 놀이를 좋아하는지 <a href="principles.html">놀이 원리</a>로 설명해요.</li><li>혼자 버티기 힘든 날엔 이웃과 함께하는 <a href="{APP}">공동육아 SOS</a>로 이어 드려요.</li></ul>
<h2>놀이 정보에 대해</h2><p>놀이 방법은 모두 직접 정리해 쓴 글이에요. 아이마다 발달 속도가 다르니 개월수는 참고로만 봐 주세요. 놀이할 때는 꼭 어른이 옆에서 지켜봐 주세요.</p>
<h2>문의</h2><p>{CONTACT}</p>'''), 'about.html')
  files['privacy.html'] = page('개인정보처리방침 | 오늘도 독박육아', '오늘도 독박육아 개인정보처리방침', prose('개인정보', f'''<h1>개인정보처리방침</h1>
<p>오늘도 독박육아(이하 "사이트")는 회원가입이 없고, 이름·연락처 같은 개인정보를 받지 않아요.</p>
<h2>저장하는 것</h2><ul><li>내 브라우저에만: 마지막으로 고른 아기 개월수 (다음에 왔을 때 편하게 보이려고). 서버로 보내지 않아요.</li></ul>
<h2>쿠키와 광고</h2><p>앞으로 광고(Google 애드센스)를 붙이면, Google 같은 광고 사업자가 쿠키를 써서 이 사이트와 다른 사이트 방문 기록을 바탕으로 광고를 보여 줄 수 있어요. 맞춤 광고는 <a href="https://adssettings.google.com" rel="noopener">Google 광고 설정</a>에서 끌 수 있어요. 광고를 붙이면 이 내용을 다시 알려 드려요.</p>
<h2>공동육아 SOS</h2><p>공동육아 SOS 앱은 따로 운영되며, 그 앱의 개인정보 안내를 따라요.</p>
<h2>문의</h2><p>{CONTACT}</p><p style="color:var(--soft)">시행일: {datetime.date.today():%Y년 %m월 %d일}</p>'''), 'privacy.html')
  files['terms.html'] = page('이용약관 | 오늘도 독박육아', '오늘도 독박육아 이용약관', prose('약관', f'''<h1>이용약관</h1>
<h2>1. 사이트 이용</h2><p>누구나 무료로 볼 수 있어요. 글과 놀이 정리는 운영자가 직접 쓴 것이라, 출처를 밝히면 개인적으로 공유해도 괜찮아요. 통째로 복사해 다른 곳에 올리는 건 안 돼요.</p>
<h2>2. 놀이 정보</h2><p>놀이는 일반적인 참고 정보예요. 아이의 나이·발달·건강에 맞는지는 보호자가 판단해 주세요. 모든 놀이는 어른이 옆에서 지켜볼 때 해 주세요. 놀이 중 생긴 사고에 대해 사이트가 책임지기 어려워요.</p>
<h2>3. 바뀔 수 있어요</h2><p>약관이 바뀌면 이 페이지에 알려 드려요.</p>
<h2>문의</h2><p>{CONTACT}</p><p style="color:var(--soft)">시행일: {datetime.date.today():%Y년 %m월 %d일}</p>'''), 'terms.html')


  # ── 참고한 연구
  rs = json.load(open(os.path.join(DEV, 'research.json'), encoding='utf-8'))
  def ritem(it):
    name = f'<a href="{e(it["url"])}" rel="noopener">{e(it["name"])}</a>' if it['url'] else e(it['name'])
    ppl = f'<p class="ppl">👤 <b>누구예요?</b> {e(it["people"])}</p>' if it.get('people') else ''
    return f'<div class="box ref"><h3>{name}</h3><p class="who">{e(it["who"])}</p>{ppl}<p>{e(it["sum"])}</p><p class="use">👉 {e(it["use"])}</p></div>'
  groups = ''.join(f'<h2>{e(g["title"])}</h2>' + ''.join(ritem(it) for it in g['items']) for g in rs['groups'])
  body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › <a href="principles.html">놀이 원리</a> › 참고한 연구</p><section class="blk prose" style="padding-top:12px">
<h1>📚 놀이에 대한 연구와 자료</h1><p>{e(rs["intro"])}</p>
{groups}
<p class="src">{e(rs["checked"])}</p></section></div>'''
  files['research.html'] = page('놀이 연구와 자료 · 놀이가 왜 중요할까 | 오늘도 독박육아', '미국소아과학회 놀이 보고서, 놀이 도식 이론, 사회적 놀이 단계, 안내된 놀이 연구, 누리과정까지. 엄마표 놀이의 바탕이 된 연구를 쉽게 정리했어요.', body, 'research.html', 'principles.html')

  # ── 꿀팁 가이드 (dokbak-dev/guides/*.json · 어린이집, 앞으로 유아식 등)
  VB = {'x': '근거 미확인', 'i': '간접 확인'}
  vb = lambda v: f'<span class="vb {v}">{VB[v]}</span>' if v in VB else ''
  def gblock(b):
    if b.get('v') == 'x': return ''   # 근거를 확인하지 못한 블록은 사이트에 싣지 않아요
    if 'list' in b: b = {**b, 'list': [x for x in b['list'] if x.get('v') != 'x']}
    mark = f'<p class="vline">{vb(b["v"])}{e(b.get("vt", ""))}</p>' if b.get('v') else ''
    if 'p' in b: return f'<p>{e(b["p"])}</p>'
    if 'note' in b: return f'<p class="gnote">{vb(b.get("v"))}{e(b["note"])}</p>'
    if 'list' in b: return mark + '<ul class="glist">' + ''.join(f'<li><b>{e(x["b"])}{vb(x.get("v"))}</b> {e(x.get("t", ""))}</li>' for x in b['list']) + '</ul>'
    if 'table' in b:
      head = ''.join(f'<th>{e(h)}</th>' for h in b['table']['head'])
      rows_ = ''.join('<tr>' + ''.join(f'<td>{e(c)}</td>' for c in r) + '</tr>' for r in b['table']['rows'])
      return mark + f'<div class="tablewrap"><table class="gtable"><thead><tr>{head}</tr></thead><tbody>{rows_}</tbody></table></div>'
    if 'timeline' in b: return mark + '<ol class="timeline">' + ''.join(f'<li><time>{e(t)}</time><span>{e(x)}</span></li>' for t, x in b['timeline']) + '</ol>'
    if 'ask' in b: return '<div class="ask"><h3>🙋 방문해서 물어보세요</h3><ul>' + ''.join(f'<li>{e(q)}</li>' for q in b['ask']) + '</ul></div>'
    return ''
  LEGEND = f'<div class="vlegend"><p>표시가 없는 내용은 정부 지침·법령 원문에서 확인한 것이에요.</p><p>{vb("i")} 원문이 아니라 정부 보도자료·기사·개편 전 자료로만 확인한 내용이에요.</p><p>근거를 확인하지 못한 관행·해석은 이 사이트에 싣지 않았어요.</p></div>'
  DAYCARE_SRC = '''<div class="box"><h2>📚 출처는 누구예요?</h2><ul>
<li><b>교육부 「보육사업안내」</b> 해마다 나오는 어린이집 운영 지침서예요. 반 편성, 선생님 한 명당 아이 수, 보육료, 부모가 내는 비용 같은 기준이 여기 적혀 있어요. 원래 보건복지부가 냈는데, 2024년 6월 27일 어린이집 업무가 교육부로 넘어가서(유보통합) 지금은 교육부가 내요.</li>
<li><b>영유아보육법</b> 어린이집에 관한 기본 법률이에요. CCTV 설치 의무 같은 내용이 여기 있어요.</li>
<li><b>「주택건설기준 등에 관한 규정」</b> 국토교통부 소관 규정으로, 아파트 단지에 어린이집을 두는 기준이 여기 있어요.</li>
<li><b>한국보육진흥원</b> 보건복지부 산하 공공기관으로, 어린이집 평가제 운영과 보육교사 교육을 맡아요. 평가제 내용은 이 기관의 보도자료와 2024년 평가 매뉴얼을 참고했어요.</li></ul>
<p class="src" style="margin-top:8px">원문을 직접 읽고 정리한 내용엔 표시가 없고, 보도자료·기사로만 확인한 내용엔 '간접 확인' 표시가 있어요. 근거를 확인하지 못한 관행·해석은 싣지 않았어요.</p></div>'''
  for gf in sorted(f for f in os.listdir(os.path.join(DEV, 'guides')) if f.endswith('.json')):
    G = json.load(open(os.path.join(DEV, 'guides', gf), encoding='utf-8'))
    sl = G['slug']; os.makedirs(os.path.join(OUT, sl), exist_ok=True)
    tool = ''
    if G.get('tool'):
      tool = f'<div class="bridge tool"><p><b>🧰 {e(G["tool"]["name"])}</b><br>{e(G["tool"]["desc"])}</p><a class="btn teal" href="{e(G["tool"]["url"])}" rel="noopener">열기</a></div>'
    secs = G['sections']
    for i, sec in enumerate(secs):
      prv = secs[i - 1] if i else None
      nxt = secs[i + 1] if i + 1 < len(secs) else None
      pager = '<div class="pager">' + (f'<a href="{prv["id"]}.html">‹ {e(prv["title"])}</a>' if prv else '<span></span>') + (f'<a href="{nxt["id"]}.html">{e(nxt["title"])} ›</a>' if nxt else '') + '</div>'
      blocks = ''.join(gblock(b) for b in sec['blocks'])
      body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="./">{e(G["title"])}</a> › {e(sec["title"])}</p>
<article class="blk prose guide" style="padding-top:12px"><span class="ey">{G["icon"]} {e(G["ey"])}</span><h1>{e(sec["title"])}</h1>
{blocks}
{LEGEND}<p class="src">{e(G["source"])}</p>{DAYCARE_SRC if sl == 'daycare' else ''}{pager}{tool}</article></div>'''
      first = next((b for b in sec['blocks'] if 'p' in b or 'list' in b), None)
      if first and 'p' in first: d = first['p']
      elif first: d = ' '.join(x['b'] for x in first['list'][:3])
      else: d = G['desc']
      files[f'{sl}/{sec["id"]}.html'] = page(f'{sec["title"]} · {G["title"]} | 오늘도 독박육아', d[:150], body, f'{sl}/{sec["id"]}.html', f'{sl}/')
    cards = ''.join(f'<a class="pr" href="{s2["id"]}.html"><h3>{e(s2["title"])}</h3></a>' for s2 in secs)
    body = f'''<div class="wrap"><section class="blk prose" style="max-width:none">
<div class="sh"><span class="ey">{G["icon"]} {e(G["ey"])}</span><h1 style="font-size:clamp(26px,5vw,36px)">{e(G["title"])}</h1><p>{e(G["intro"])}</p></div>
{tool}
<div class="prs" style="margin-top:14px">{cards}</div>
{DAYCARE_SRC if sl == 'daycare' else ''}
<p class="src">{e(G["source"])}</p>
{'<p style="margin-top:12px"><a class="btn ghost" href="../brands.html">🏢 프뢰벨·몬테소리·눈높이… 이름 풀이</a></p>' if sl == 'daycare' else ''}</section></div>'''
    files[f'{sl}/index.html'] = page(f'{G["title"]} | 오늘도 독박육아', G['desc'], body, f'{sl}/index.html', f'{sl}/')


  # ── 유아교육 회사·교육법 이름 풀이
  B = json.load(open(os.path.join(DEV, 'brands.json'), encoding='utf-8'))
  def bitem(it):
    srcs = ' · '.join(f'<a href="{e(u)}" rel="noopener">{e(t)}</a>' for t, u in it['src'])
    return (f'<div class="box ref"><h3>{e(it["name"])}{vb(it.get("v"))}</h3><p class="who">{e(it["kind"])}</p><p>{e(it["sum"])}</p>'
            + (f'<p class="gnote">{e(it["note"])}</p>' if it.get('note') else '') + f'<p class="src" style="margin-top:6px">출처: {srcs}</p></div>')
  body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › <a href="daycare/">어린이집</a> › 이름 풀이</p><section class="blk prose" style="padding-top:12px">
<h1>🏢 {e(B["title"])}</h1><p>{e(B["intro"])}</p>
{''.join(f'<h2>{e(g["title"])}</h2>' + ''.join(bitem(it) for it in g['items']) for g in B['groups'])}
{LEGEND}<p class="src">{e(B["checked"])}</p></section></div>'''
  files['brands.html'] = page('프뢰벨·몬테소리·눈높이·씽크빅은 누구? 유아교육 회사 이름 풀이 | 오늘도 독박육아', '프뢰벨과 몬테소리는 누구이고, 한국프뢰벨·영아다중·한솔교육·대교·웅진씽크빅·교원은 어떤 회사인지 공개 자료로 확인한 것만 정리했어요.', body, 'brands.html', 'daycare/')

  # ── 쓰기 + sitemap
  for path, txt in files.items():
    open(os.path.join(OUT, path), 'w', encoding='utf-8').write(txt)
  today = datetime.date.today().isoformat()
  urls = ''.join(f'<url><loc>{BASE}/{p.replace("index.html", "")}</loc><lastmod>{today}</lastmod></url>' for p in sorted(files))
  open(os.path.join(OUT, 'sitemap.xml'), 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
  open(os.path.join(OUT, 'robots.txt'), 'w').write(f'User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n')
  open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(page('페이지를 찾을 수 없어요 | 오늘도 독박육아', '', '<div class="wrap"><section class="blk prose"><h1>🙈 페이지를 찾을 수 없어요</h1><p><a href="/">홈으로 가기</a></p></section></div>', '404.html'))
  print(f'OK 놀이 {len(rows)}개 · 페이지 {len(files) + 1}개 → dokbak/')

build()
