import re
# '오늘도 독박육아' 홈페이지 만들기
#  play-data/plays.json (놀이 데이터) → dokbak/ (올릴 정적 사이트)
#  사용: python3 dokbak-dev/build.py
#  놀이를 고치거나 더하면 play-data 에서 고치고 이 스크립트를 다시 돌리면 페이지가 전부 새로 만들어져요.
import json, os, shutil, html, datetime, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEV = os.path.join(ROOT, 'dokbak-dev')
OUT = os.path.join(ROOT, 'dokbak')
# 구글 서치 콘솔 · 네이버 서치어드바이저 '소유 확인' HTML 태그의 content 값만 넣어요 (비밀 키 아님, 비우면 안 넣어요)
SITE_VERIFY = [('google-site-verification', 'LrGoRs0_pYU-t2djW8amVjiKnZZFiM2-S4NpfnuWqSw'),   # dokbak.pages.dev
               ('google-site-verification', 'ZFMTOLEzDx_o9xWt52lDTOJko_3P7FKUIH1PbmnYO5o'),   # 독박육아.com
               ('naver-site-verification', '24c64ae8aaef959ea969cfde87a96b063cd368ef'),   # dokbak.pages.dev
               ('naver-site-verification', 'b140624f961775ae4658a9c4c45730b8fdad0d27')]   # 독박육아.com
BASE = 'https://xn--iq1br1ns0hr0b.com'   # 독박육아.com (한글 도메인의 영문 표기). sitemap · 대표 주소에 쓰여요
APP = 'https://gongdong-sos.pages.dev/'
CONTACT = 'ifb1321@gmail.com'       # 공동육아 SOS 이용약관에 공개된 운영자 문의 메일과 같아요
SHOW = {'확정', '해봄'}       # 후보(AI가 원리로 새로 만든 놀이, 아직 직접 해 보기 전)는 애드센스 승인 전까지 올리지 않아요. 직접 해 보고 '해봄'으로 바꾸면 올라가요
AI_ON = '후보' in SHOW   # AI 놀이를 올릴 때만 'AI가 만든 놀이' 안내를 보여요
AI_FOOT = '<p class="src" style="margin:0 0 6px">🧪 새 놀이 표시는 AI(인공지능)가 놀이 원리로 만든 놀이예요. 참고용으로만 봐 주세요.</p>' if AI_ON else ''
V = datetime.datetime.now().strftime('%Y%m%d%H%M')

e = lambda s: html.escape(str(s), quote=True)
from urllib.parse import quote
TOPIC_OF_PAGE = {}   # 글 주소 → 육아 정보 주제 (관련 검색어용, build 때 채워요)
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
# 🤝 육아 지원 시설 목록 (공공데이터 파일) → 지도 함수가 쓰는 모듈. 좌표는 함수가 카카오로 바꿔서 시도별로 캐시해요
def _road(addr):
  # 카카오 주소 검색은 '도로명 + 건물번호'까지만 넣는 게 잘 찾아요 (층·건물 이름은 빼요)
  m = re.match(r'^(.*?(?:로|길)(?:\s*\d+번?길)?\s*\d+(?:-\d+)?)', addr)
  if m: return m.group(1).strip()
  return re.sub(r'\s+\S*\d+층.*$', '', re.sub(r'\s*\(.*$', '', addr)).strip()   # 지번 주소: 괄호·층 뒤는 빼요
def write_care(path):
  import csv
  os.makedirs(os.path.dirname(path), exist_ok=True)
  out = []
  with open(os.path.join(DEV, 'data', '공동육아나눔터_전국_20251110.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
      r = {k.strip(): (v or '').strip() for k, v in r.items()}
      a = re.sub(r'\s+', ' ', r['주소(도로명)'])
      out.append({'k': 'n', 's': r['시도'], 'n': f"{r['운영기관']} 공동육아나눔터", 'a': a, 'q': _road(a), 't': r['연락처']})
  with open(os.path.join(DEV, 'data', '육아종합지원센터_부산_20260522.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
      r = {k.strip(): (v or '').strip() for k, v in r.items()}
      a = '부산광역시 ' + re.sub(r'\s*\(.*?\)\s*$', '', r['주소'])
      out.append({'k': 'c', 's': '부산', 'n': r['센터명'], 'a': a, 'q': _road(a), 't': r['연락처']})
  open(path, 'w').write('// 자동 생성 (dokbak-dev/build.py · data/*.csv). 직접 고치지 마세요\nexport default ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
  return out

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

# 원문 링크: 확실히 열리는 주소만 (논문 DOI·PubMed·WHO·CDC·질병관리청 등). 나머지는 이름만 보여요.
# 📚 육아 정보 주제 탭: 육아 상식·연구·이유식 글을 출처 종류가 아니라 주제로 묶어요
# 🔎 네이버 키워드 도구로 많이 찾는 말을 페이지 <title>에만 덧붙여요 (화면 제목은 그대로)
STG_CARD = '<a class="box" href="../food/stages.html" style="display:block;margin:0 0 14px;color:inherit;text-decoration:none"><b>🥣 이유식 단계표</b> — 6~8·9~11·12~23개월 하루 끼니·한 끼 양·질감 한눈에 보기 ›</a>'   # 🥣 이유식 단계표 바로가기 (🍚 먹기 주제 맨 위)
TOPIC_SEO = {'sleep': '수면교육·분리수면·배변훈련·양치', 'food': '아기 이유식·간식·편식', 'lang': '말 늦은 아기·책 읽기·영상 노출', 'together': '공동육아'}
AGE_SEO = {'10-12m': '(돌 아기)', '13-18m': '(돌 지난 아기)'}
PLAY_SEO = {'shadow': ' (집에서 그림자극장)', 'c-puppet-shadow-story': ' (그림자극장)'}
TOPICS = [('play', '🧸', '놀이·발달'), ('mind', '💛', '마음·행동'), ('lang', '🗣', '말·책·미디어'), ('food', '🍚', '먹기·이유식'),
          ('sleep', '😴', '잠·배변·양치'), ('health', '🩺', '건강·검진·안전'), ('together', '🤝', '공동육아')]
TOPIC_SHORT = {'play': '놀이', 'mind': '마음', 'lang': '말·미디어', 'food': '먹기', 'sleep': '잠·습관', 'health': '건강·안전', 'together': '공동육아'}   # 작은 탭에 쓰는 짧은 이름
TOPIC_OF = {   # 글 id → 주제 (여기 없는 글은 아래 기본 규칙으로)
  'mouthing-dropping': 'play', 'same-book-again': 'play', 'why-questions': 'play',
  'stranger-separation-anxiety': 'mind', 'crying-curve': 'mind', 'tantrum-how-common': 'mind', 'toddler-biting': 'mind',
  'attachment-secure-base': 'mind', 'still-face': 'mind', 'praise-effort': 'mind', 'discipline-no-spanking': 'mind', 'postpartum-depression': 'mind',
  'babbling-first-words': 'lang', 'late-talker-milestones': 'lang', 'who-movement-screen-under5': 'lang',
  'night-waking': 'sleep', 'safe-sleep-aap-2022': 'sleep', 'sleep-hours-by-age': 'sleep', 'safe-sleep-sids': 'sleep',
  'teething-signs': 'health', 'choking-prevention': 'health', 'car-seat-rear-facing': 'health'}
TOPIC_INTRO = {'play': '아이가 왜 그렇게 노는지, 놀이가 발달에 어떻게 이어지는지에 대한 연구와 공공 자료예요.',
  'mind': '울음, 낯가림, 떼, 깨물기부터 애착·훈육·부모 마음까지, 아이와 부모의 마음에 대한 글이에요.',
  'lang': '말 배우기, 책 읽기, 영상·전자 장난감·TV가 말과 발달에 미치는 영향에 대한 연구예요.',
  'food': '이유식 시작부터 편식·재촉·간식·설탕·주스까지, 먹이기에 대한 기관 안내와 연구예요.',
  'sleep': '안전한 잠자리, 수면교육, 분리수면, 배변 훈련, 양치에 대한 연구와 안내예요.',
  'health': '영유아 검진, 발달 질문지, 예방접종, 구강검진과 이앓이·질식·카시트 같은 안전 수칙이에요.',
  'together': '엄마 모임, 또래 지지, 놀이모임이 부모 마음과 아이 발달에 어떤 도움이 되는지 본 연구예요.'}
OK_HOSTS = ('doi.org', 'pubmed.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov', 'www.healthychildren.org', 'pmc.ncbi.nlm.nih.gov', 'www.who.int', 'www.cdc.gov', 'jamanetwork.com', 'health.kdca.go.kr', 'en.wikipedia.org', 'kimddubuck.github.io')
def okurl(u):
  m = re.match(r'https://([^/]+)/', u or '')
  return bool(m) and m.group(1) in OK_HOSTS
def link(u, t):
  return f'<a href="{e(u)}" rel="noopener">{e(t)}</a>' if okurl(u) else e(t)

def sum3box(x):
  return ('<div class="sum3"><p class="sum3-h">📌 3줄 요약</p><ol>' + ''.join(f'<li>{e(t)}</li>' for t in x['sum3']) + '</ol></div>') if x.get('sum3') else ''
def endbox(x):   # 맨 위 '📌 3줄 요약'과 같은 말을 끝에서 또 하지 않아요 (요약이 없는 글만 끝 정리를 보여요)
  return f'<div class="endbox"><p class="sum3-h">✅ 정리하면</p><p>{e(x["end"])}</p></div>' if x.get('end') and not x.get('sum3') else ''

# Cloudflare Pages는 /a.html 을 /a 로 넘겨요(308). 검색엔진에는 넘어간 뒤 주소를 알려 줘야 '가져올 수 없음'·중복이 안 생겨요
def pretty(path):
  return re.sub(r'(^|/)index\.html$', r'\1', path)[:-5] if path.endswith('.html') and not re.search(r'(^|/)index\.html$', path) else re.sub(r'(^|/)index\.html$', r'\1', path)
# 📖 어려운 말 → 초등학생도 알 쉬운 말 (글 페이지에서 처음 나올 때 점선 밑줄 + 글 끝 '어려운 말 풀이'). 긴 말을 먼저 찾아요
GLOSS_DIRS = ('research', 'tips', 'food', 'support', 'daycare', 'principles')
GLOSS = sorted([
  ('실행기능', '계획을 세우고, 참고, 한 가지에 집중하는 뇌의 힘이에요.'),
  ('자기조절', '화나거나 신날 때 스스로 마음과 행동을 다스리는 힘이에요.'),
  ('메타분석', '여러 연구 결과를 한데 모아 다시 계산해 본 연구예요.'),
  ('체계적 문헌고찰', '정해진 방법으로 관련 연구를 빠짐없이 찾아 모아 정리한 연구예요.'),
  ('무작위 대조', '참여한 사람을 제비뽑기처럼 무작위로 나눠, 한쪽만 해 보고 비교하는 실험이에요.'),
  ('대조군', '비교하려고 따로 아무것도 하지 않은 쪽 사람들이에요.'),
  ('관찰 연구', '실험을 하지 않고 있는 그대로 지켜보며 기록한 연구예요. 무엇이 원인인지는 딱 잘라 말하기 어려워요.'),
  ('코호트', '같은 무리의 사람들을 오랫동안 따라가며 살핀 연구 방식이에요.'),
  ('상관관계', '두 가지가 함께 나타난다는 뜻이에요. 하나가 다른 하나의 원인이라는 뜻은 아니에요.'),
  ('학술지', '연구 논문을 싣는 전문 잡지예요. 다른 전문가가 먼저 검토하고 실어요.'),
  ('초록', '논문 맨 앞에 붙은 짧은 요약이에요.'),
  ('임상', '병원처럼 실제 환자나 사람을 직접 만나 돌보는 현장을 말해요.'),
  ('백분위', '같은 나이 아이 100명을 줄 세웠을 때 몇 번째쯤인지를 나타내는 숫자예요.'),
  ('철결핍성 빈혈', '몸에 철분이 모자라서 피가 산소를 잘 나르지 못하는 상태예요. 쉽게 지치고 얼굴이 창백해질 수 있어요.'),
  ('빈혈', '피가 몸 구석구석에 산소를 잘 나르지 못하는 상태예요. 쉽게 지치고 얼굴이 창백해질 수 있어요.'),
  ('알레르기', '몸이 어떤 음식이나 물질에 지나치게 반응해서 두드러기·가려움 같은 증상이 생기는 거예요.'),
  ('영아돌연사증후군', '건강해 보이던 돌 전 아기가 잠자다가 뚜렷한 이유 없이 숨지는 일이에요.'),
  ('독성 스트레스', '도와주는 어른 없이 오래 계속되는 아주 심한 스트레스예요.'),
  ('애착', '아기와 늘 돌봐 주는 사람 사이에 생기는 깊은 믿음과 정이에요.'),
  ('분리불안', '엄마 아빠와 떨어질 때 크게 불안해하고 우는 거예요.'),
  ('옹알이', '말을 배우기 전 아기가 "아바바" 하고 내는 소리예요.'),
  ('소근육', '손가락처럼 작고 세밀하게 움직이는 근육이에요.'),
  ('대근육', '팔·다리처럼 크게 움직이는 근육이에요. 걷기·뛰기에 쓰여요.'),
  ('스크린 타임', 'TV·휴대폰·태블릿 같은 화면을 보는 시간이에요.'),
  ('중위소득', '우리나라 가구를 소득 순서로 줄 세웠을 때 딱 가운데 있는 가구의 소득이에요.'),
  ('바우처', '정해진 곳에서 돈처럼 쓸 수 있는 이용권이에요.'),
  ('보육료', '어린이집에 다니는 데 드는 비용이에요.'),
  ('퓨레', '채소나 과일을 곱게 갈아 부드럽게 만든 음식이에요.'),
  ('보충식', '젖이나 분유 말고 더 먹이는 음식, 곧 이유식이에요.'),
  ('발달 선별검사', '아이 발달이 나이에 맞게 자라는지 간단히 살펴보는 검사예요.'),
], key=lambda x: -len(x[0]))
# 🔎 페이지 주제별 관련 검색어 (네이버 키워드 도구에서 많이 찾던 말 위주)
KW_TOPIC = {
  'sleep': ['수면교육', '분리수면', '아기 낮잠', '밤에 깨는 아기', '배변훈련', '아기 양치'],
  'food': ['이유식', '이유식 시작', '이유식 단계표', '소고기 이유식', '아기 간식', '편식'],
  'lang': ['아기 언어발달', '말 늦은 아기', '책 읽기', '아기 영상 노출', '동요 추천'],
  'play': ['아기놀이', '엄마표 놀이', '개월수별 놀이', '촉감놀이', '집에서 놀이'],
  'mind': ['떼쓰기', '애착', '분리불안', '아기 훈육', '칭찬'],
  'health': ['영유아검진', '예방접종', '아기 키 몸무게', '아기 백분위', '안전수면'],
  'together': ['공동육아', '독박육아', '육아 모임'],
}
KW_DIR = {
  'plays': ['아기놀이', '엄마표 놀이', '집에서 아기 놀이', '개월수별 놀이'],
  'age': ['개월수별 놀이', '아기놀이', '엄마표 놀이', '돌 아기 놀이'],
  'principles': ['놀이 원리', '아기 발달', '엄마표 놀이'],
  'support': ['첫만남이용권', '부모급여', '육아휴직', '아이돌봄서비스', '6+6 육아휴직'],
  'daycare': ['어린이집', '어린이집 입소', '어린이집 비용', '어린이집 평가'],
}

def page_keywords(path):
  top = path.split('/')[0] if '/' in path else ''
  if path.startswith('info/'): return KW_TOPIC.get(path[5:-5], [])
  if top in ('research', 'tips', 'food'):
    return KW_TOPIC.get(TOPIC_OF_PAGE.get(path, ''), []) or (KW_TOPIC['food'] if top == 'food' else [])
  if top in KW_DIR: return KW_DIR[top]
  return {'index.html': ['독박육아', '공동육아', '아기놀이', '엄마표 놀이', '이유식', '수면교육'], 'growth.html': ['아기 키 몸무게', '아기 백분위', '영유아검진', '머리둘레', '이유식 양'],
          'songs.html': ['동요 추천', '아기 동요', '율동', '자장가'], 'food.html': KW_TOPIC['food'], 'research.html': ['육아 연구', '아기 발달', '놀이 연구'],
          'tips.html': ['육아 상식', '육아 정보'], 'support.html': KW_DIR['support'], 'map.html': ['소아과', '키즈카페', '놀이터', '육아 지도']}.get(path, [])

NOINDEX = {'404.html', 'search.html', 'admin.html'} | {f'principles/{PR_SLUG[k]}.html' for k, v in PR_SRC.items() if not v}   # 연구 근거 없는 '놀이 만들기용 분류'는 검색엔진에 안 내보내요
# 개인정보처리방침·이용약관 시행일: 내용을 바꿀 때만 손으로 고쳐요 (빌드할 때마다 바뀌면 안 돼요)
POLICY_DATE = '2026년 10월 15일'

def page(title, desc, body, path, active='', extra_head=''):
  depth = path.count('/')
  up = '../' * depth
  # 메뉴 6개로 묶어요. 묶음 안의 작은 탭(subnav)은 그 묶음 페이지 위에 보여요
  GROUPS = [('plays/', '놀이', [('plays/', '🔍 놀이 찾기'), ('age/', '📅 개월수별'), ('principles.html', '🧠 놀이 원리'), ('songs.html', '🎵 동요 추천')]),
            ('growth.html', '우리 아이 지금', []),
            ('info/play.html', '육아 정보', [(f'info/{sl}.html', f'{ic} {TOPIC_SHORT[sl]}') for sl, ic, nm in TOPICS], ['tips.html', 'research.html', 'food.html']),
            ('daycare/', '어린이집', []),
            ('support.html', '국가지원', []),
            ('map.html', '육아 지도', [])]
  has = lambda h: h not in ('tips.html', 'support.html') or os.path.exists(os.path.join(DEV, 'columns', h.replace('.html', '.json')))
  GROUPS = [(g[0], g[1], [c for c in g[2] if has(c[0])], g[3] if len(g) > 3 else []) for g in GROUPS if has(g[0])]
  grp = next((g for g in GROUPS if active == g[0] or any(active == c[0] for c in g[2]) or active in g[3]), None)
  navh = ''.join(f'<a href="{up}{h or "./"}"{CUR if grp and grp[0] == h else ""}>{t}</a>' for h, t, _, _ in GROUPS)
  subnav = f'<nav class="subnav" aria-label="{e(grp[1])} 안에서 고르기"><div class="wrap">' + ''.join(f'<a href="{up}{h}"{CUR if active == h else ""}>{t}</a>' for h, t in grp[2]) + '</div></nav>' if grp and grp[2] else ''
  return f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{'<meta name="robots" content="noindex,follow">' if path in NOINDEX else f'<link rel="canonical" href="{BASE}/{pretty(path)}"><meta property="og:url" content="{BASE}/{pretty(path)}">'}
<meta property="og:type" content="website"><meta property="og:site_name" content="오늘도 독박육아">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta name="theme-color" content="#2a9095">{''.join(f'<meta name="{k}" content="{e(v)}">' for k, v in SITE_VERIFY if v)}
<link rel="icon" href="{up}assets/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap">
<link rel="stylesheet" href="{up}assets/site.css?v={V}">
{extra_head}</head>
<body>
<header class="top"><div class="wrap">
  <a class="logo" href="{up}./"><img src="{up}assets/icon.svg" alt="" width="30" height="30"><b>오늘도 독박육아</b></a>
  <nav class="nav" aria-label="메뉴">{navh}</nav>
  <a class="top-search" href="{up}search.html" aria-label="통합 검색"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></a>
  <a class="top-sos" href="{APP}" aria-label="공동육아 SOS"><i>🆘 </i><span class="sos-long">공동육아 </span>SOS</a>
</div></header>
{subnav}<main>
{body}
</main>
<footer><div class="wrap">
  <a class="logo" href="{up}./"><img src="{up}assets/icon.svg" alt="" width="30" height="30"><b>오늘도 독박육아</b></a>
  <p>독박육아 하는 날을 덜 외롭게.<br>육아휴직하고 독박육아하는 아빠가 육아 정보 홈페이지와 <a href="{APP}">공동육아 웹앱</a>을 만들었어요.</p>
  {AI_FOOT}<div class="flinks"><a href="{up}about.html">소개</a><a href="{up}privacy.html">개인정보처리방침</a><a href="{up}terms.html">이용약관</a><a href="{APP}">공동육아 SOS</a><a href="{up}contact.html">문의</a><span>{CONTACT}</span></div>
</div></footer>
{'' if path == 'admin.html' else BEACON}
</body>
</html>
'''

# 📊 자체 방문 통계: 페이지를 열면 /api/hit 로 '어느 페이지·어디서 왔는지'만, 바깥 링크(공동육아 SOS 등)를 누르면 '어디로 나갔는지'만 보내요. 운영자 기기(dk_me)는 따로 세요 (쿠키 없음, 오늘 첫 방문·이번 방문 첫 페이지 표시만 브라우저에 둬요)
BEACON = '''<script>(function(){try{if(navigator.webdriver||location.hostname==='localhost')return;var me=0;try{me=localStorage.getItem('dk_me')?1:0}catch(e){}var send=function(o){var b=JSON.stringify(o);if(!(navigator.sendBeacon&&navigator.sendBeacon('/api/hit',b)))fetch('/api/hit',{method:'POST',body:b,keepalive:true})};var d=new Date(Date.now()+324e5).toISOString().slice(0,10),v=0,s=0;try{if(localStorage.getItem('dk_v')!==d){localStorage.setItem('dk_v',d);v=1}}catch(e){}try{if(!sessionStorage.getItem('dk_s')){sessionStorage.setItem('dk_s','1');s=1}}catch(e){}send({p:location.pathname,r:document.referrer,q:location.search,v:v,s:s,m:me});document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="http"]');if(a&&a.host!==location.host)send({o:a.href,p:location.pathname,m:me})},true)}catch(e){}})();</script>'''
NEWBOX = '<div class="box newp"><h2>🧪 AI가 만든 새 놀이예요</h2><p>이 놀이는 사람이 해 본 놀이가 아니라, <b>AI(인공지능)가</b> <a href="../principles.html">놀이 원리</a>와 집에 있는 생활용품을 조합해서 만든 거예요. <b>참고용으로만</b> 봐 주세요. 3세 미만 질식 위험 크기, 끈·자석·비닐, 넘어짐, 물 같은 <a href="../principles.html#safety">안전 원칙</a>으로 하나하나 검토했지만 <b>아직 직접 해 보기 전</b>이에요. 아이마다 다르니 반응을 보며 쉽게·어렵게 조절하고, 늘 옆에서 지켜봐 주세요. 해 보고 다듬으면 이 표시를 떼요.</p></div>'

# 🌱 키우는 힘: 놀이마다 적은 발달 영역. 설명은 '이 놀이에서 아이가 실제로 하는 것' 수준으로만 적어요 (효과를 장담하는 말은 안 써요)
SKILL = {
  '오감': ('👀', '보고 듣고 만지고 냄새 맡으며 세상을 알아 가요'),
  '소근육': ('🤏', '손가락·손목을 써서 집고, 꽂고, 돌려요. 숟가락질·그리기의 바탕이에요'),
  '대근육': ('🏃', '기고, 걷고, 뛰고, 균형을 잡아요'),
  '언어': ('💬', '말을 듣고, 따라 하고, 이름을 붙이고, 이야기해요'),
  '인지': ('🧠', '기억하고, 비교하고, 순서와 원인을 알아 가요'),
  '사회성': ('🤝', '차례를 지키고, 나누고, 다른 사람 마음을 헤아려요'),
  '창의': ('🎨', '하나를 다른 것으로 바꾸고, 자기만의 답을 만들어요'),
  '정서': ('💛', '기분을 알아차리고 말로 하고, 스스로 가라앉혀요'),
}

def card(p, up):
  return (f'<a class="card" href="{up}plays/{p["id"]}.html"><span class="meta">{age_range(p)} · {PLACE_ICON[p["place"]]} {p["place"]}{" · 👨‍👩‍👧 여럿이" if p["group"] else ""}{" · 🧪 새 놀이" if p["status"] == "후보" else ""}</span>'
          f'<h3>{e(p["name"])}</h3><p>{e(p["steps"][0])}</p><span class="sk">{" · ".join(SKILL[k][0] + " " + k for k in p["skills"])}</span></a>')

SOS_BRIDGE = f'''<div class="appcard"><p class="ac-q">오늘도 독박육아?<br><b>우리 같이 <span class="nw">공동육아해요 🤝</span></b></p>
<a class="ac-top" href="{APP}"><img src="/assets/sos-app.png" alt="" width="52" height="52"><span><span class="nw"><b>공동육아 SOS</b><em>웹앱</em></span><small>같은 단지 엄마 아빠와 시간 맞춰 같이 키우는 웹앱</small></span></a>
<ul class="ac-f"><li>🆘 SOS 달력</li><li>🙌 모임 열기</li><li>🍚 식단공유</li><li>🙈 익명게시판</li></ul>
<p class="ac-s">설치 없이 링크로 바로 열려요 · 홈 화면에 추가하면 앱처럼 써요 · 가입 없이 닉네임만</p>
<div class="ac-b"><a class="btn teal" href="{APP}">🆘 앱 열기</a><a class="btn ghost" href="{APP}guide.html">📖 사용법</a></div></div>'''
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
    <div class="m">🙌 <b>15시 키즈룸 비눗방울 놀이</b><br>참석 3 · ❤️ 2</div>
    <div class="b">💪 모임 열기</div>
  </div></div>
</div>'''

ADMIN_BODY = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'admin.html'), encoding='utf-8').read()

def build():
  rows = [p for p in json.load(open(os.path.join(ROOT, 'play-data', 'plays.json'), encoding='utf-8')) if p['status'] in SHOW]
  if os.path.isdir(OUT): shutil.rmtree(OUT)
  for d in ('assets', 'plays', 'age', 'principles'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
  shutil.copy(os.path.join(DEV, 'site.css'), os.path.join(OUT, 'assets', 'site.css'))
  shutil.copy(os.path.join(DEV, 'icon.svg'), os.path.join(OUT, 'assets', 'icon.svg'))
  shutil.copy(os.path.join(ROOT, 'sos', 'assets', 'icon-sos-192.png'), os.path.join(OUT, 'assets', 'sos-app.png'))   # 공동육아 SOS 앱 아이콘 (앱 소개 카드)
  # 🗺 육아 지도: 지도 라이브러리(Leaflet, BSD-2) · 지도 스크립트 · 공공데이터 심부름꾼 함수(Cloudflare Pages Functions)
  shutil.copytree(os.path.join(DEV, 'vendor', 'leaflet'), os.path.join(OUT, 'assets', 'leaflet'))
  shutil.copy(os.path.join(DEV, 'map.js'), os.path.join(OUT, 'assets', 'map.js'))
  shutil.copy(os.path.join(DEV, 'growth.js'), os.path.join(OUT, 'assets', 'growth.js'))
  shutil.copy(os.path.join(DEV, 'leavepay.js'), os.path.join(OUT, 'assets', 'leavepay.js'))
  if os.path.isdir(os.path.join(DEV, 'play-photos')): shutil.copytree(os.path.join(DEV, 'play-photos'), os.path.join(OUT, 'assets', 'plays'))   # 👨‍🍼 아빠가 해 본 놀이 사진 (plays.json 의 photo)
  shutil.copytree(os.path.join(DEV, 'functions'), os.path.join(OUT, 'functions'))
  write_care(os.path.join(OUT, 'functions', '_lib', 'care.js'))
  # 🧪 AI가 만든 놀이(후보)는 공개 페이지로 만들지 않고, 관리자 비밀번호로만 받아 보게 서버 함수 안에 넣어요 (/api/aiplays)
  ai_ = [{k: p[k] for k in ('id', 'name', 'ageMin', 'ageMax', 'place', 'group', 'minutes', 'mess', 'principles', 'skills', 'materials', 'steps', 'tip', 'safety', 'keywords', 'swaps') if k in p} | {'a': age_range(p)}
         for p in json.load(open(os.path.join(ROOT, 'play-data', 'plays.json'), encoding='utf-8')) if p['status'] == '후보']
  open(os.path.join(OUT, 'functions', '_lib', 'aiplays.js'), 'w', encoding='utf-8').write('export default ' + json.dumps(ai_, ensure_ascii=False) + ';\n')
  files = {}

  # ── 놀이 하나하나 (검색으로 들어오는 페이지)
  # 📚 놀이 원리 → 근거 연구 글, 🌱 키우는 힘 → 육아 정보 주제 (놀이 페이지 아래 '같이 읽으면 좋은 글')
  PR_READ = {k: ['schema'] for k in ('넣고빼기', '옮기기', '굴리고던지기', '감싸고풀기', '꽂고잇기', '변신')} | {'숨기고찾기': ['piaget'], '흉내역할': ['play-aap', 'parten'], '몸으로도전': ['risky']}
  SK_TOPIC = {'언어': 'lang', '정서': 'mind', '사회성': 'mind', '대근육': 'play', '소근육': 'play', '오감': 'play', '인지': 'play', '창의': 'play'}
  RTITLE = {it['id']: it['t'] for g in json.load(open(os.path.join(DEV, 'research.json'), encoding='utf-8'))['groups'] for it in g['items']}
  TNAME = {sl: (ic, nm) for sl, ic, nm in TOPICS}
  def src_line(k): return ('<br><small class="src">📚 근거: ' + e(PR_SRC[k]) + '</small>') if PR_SRC.get(k) else ''
  for p in rows:
    same = [q for q in rows if q is not p and set(q['principles']) & set(p['principles']) and in_band(q, p['ageMin'], p['ageMax'])][:4]
    why = ''.join(f'<li>{PR[k][0]} <b>{pn(k)}</b>: {PR[k][1]} <a href="../principles/{PR_SLUG[k]}.html">더 보기</a>{src_line(k)}</li>' for k in p['principles'])
    # 📅 이 놀이를 할 수 있는 개월수 (개월수별 놀이 페이지로)
    bands = [(sl, nm) for sl, nm, lo, hi in BANDS if in_band(p, lo, hi)]
    ages = ''.join(f'<a class="chip" href="../age/{sl}.html">{e(nm)}</a>' for sl, nm in bands)
    # 📖 같이 읽으면 좋은 글: 원리의 근거 연구 + 키우는 힘에 맞는 육아 정보 주제 (+ 여럿이면 공동육아)
    reads = []
    for k in p['principles']:
      for rid in PR_READ.get(k, []):
        if rid in RTITLE and ('../research/' + rid + '.html') not in [h for h, _ in reads]: reads.append(('../research/' + rid + '.html', '📚 ' + RTITLE[rid]))
    for t in dict.fromkeys(SK_TOPIC[k] for k in p['skills'] if k in SK_TOPIC):
      reads.append((f'../info/{t}.html', f'{TNAME[t][0]} 육아 정보: {TNAME[t][1]}'))
    if p['group']: reads.append(('../info/together.html', f'{TNAME["together"][0]} 육아 정보: {TNAME["together"][1]}'))
    readbox = ('<div class="box"><h2>📖 같이 읽으면 좋은 글</h2><ul>' + ''.join('<li><a href="' + h + '">' + e(t) + '</a></li>' for h, t in reads[:5]) + '</ul></div>') if reads else ''
    photo = ('<img src="../assets/plays/' + e(p['photo']) + '" alt="' + e(p['name']) + ' 해 본 사진" loading="lazy">') if p.get('photo') else ''
    dad = ('<div class="box dad"><h2>👨‍🍼 아빠가 해 봤어요</h2><p>' + e(p['dad']) + '</p>' + photo + '</div>') if p.get('dad') else ''
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
  {NEWBOX if p['status'] == '후보' else ''}
  {f'<div class="box safe"><h2>⚠️ 먼저 읽어 주세요</h2><p>{e(p["safety"])}</p></div>' if p['status'] == '후보' and p['safety'] else ''}
  <div class="box why"><h2>💭 아이가 왜 좋아할까?</h2><ul>{why}</ul></div>
  <div class="box grow"><h2>🌱 이 놀이로 자라는 힘</h2><ul>{''.join(f'<li>{SKILL[k][0]} <b>{k}</b>: {SKILL[k][1]}</li>' for k in p['skills'])}</ul></div>
  <div class="box"><h2>🧺 준비물</h2><ul>{''.join(f'<li>{e(m)}</li>' for m in p['materials'])}</ul></div>
  {f'<div class="box swap"><h2>🔁 없으면 이걸로</h2><ul>{"".join(f"<li>{e(x)}</li>" for x in p.get("swaps", []))}</ul></div>' if p.get('swaps') else ''}
  <div class="box"><h2>👣 이렇게 해요</h2><ol>{''.join(f'<li>{e(s)}</li>' for s in p['steps'])}</ol></div>
  {dad}
  {f'<div class="box"><h2>💡 꿀팁</h2><p>{e(p["tip"])}</p></div>' if p['tip'] else ''}
  {f'<div class="box safe"><h2>⚠️ 안전하게</h2><p>{e(p["safety"])}</p></div>' if p['safety'] and p['status'] != '후보' else ''}
  {'<p class="tag sun" style="margin-top:14px">👨‍👩‍👧 공동육아 모임에서 여럿이 하기 좋아요</p>' if p['group'] else ''}
  {f'<div class="box"><h2>📅 이 개월수에 해 보세요</h2><div class="chips" style="margin:0">{ages}</div></div>' if ages else ''}
  {readbox}
</article>
<aside class="side">{SOS_BRIDGE}
  {f'<div class="box" style="margin-top:0"><h2>🔁 비슷한 놀이</h2><div class="cards" style="grid-template-columns:1fr">{"".join(card(q, "../") for q in same)}</div></div>' if same else ''}
</aside></div></div>'''
    files[f'plays/{p["id"]}.html'] = page(f'{p["name"]}{PLAY_SEO.get(p["id"], "")} · {age_range(p)} 엄마표 놀이 | 오늘도 독박육아',
      f'{age_range(p)} 아기와 집에서 하는 {p["name"]}. 준비물: {", ".join(p["materials"][:3])}. 하는 방법과 안전 수칙까지.',
      body, f'plays/{p["id"]}.html', 'plays/', f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n')

  # ── 놀이 찾기 (필터)
  mini = [{k: p[k] for k in ('id', 'name', 'ageMin', 'ageMax', 'place', 'group', 'principles', 'skills')} | {'s': p['steps'][0], 'a': age_range(p)} | ({'n': 1} if p['status'] == '후보' else {}) for p in rows]
  body = f'''<div class="wrap"><section class="blk">
<div class="sh"><span class="ey">놀이 찾기</span><h1 style="font-size:clamp(26px,5vw,36px)">🔍 우리 아이랑 할 놀이 찾기</h1><p>개월수, 장소, 키우고 싶은 힘으로 골라 보세요. 모두 집에 있는 물건으로 할 수 있어요.</p></div>
<div class="filters">
  <div class="row"><span>나이</span><div class="seg" data-k="b"><button type="button" data-v="" aria-pressed="true">전체</button>{''.join(f'<button type="button" data-v="{s}">{n.split(" (")[0]}</button>' for s, n, a, b in BANDS)}</div></div>
  <div class="row"><span>장소</span><div class="seg" data-k="p"><button type="button" data-v="" aria-pressed="true">전체</button>{''.join(f'<button type="button" data-v="{k}">{v} {k}</button>' for k, v in PLACE_ICON.items())}</div></div>
  <div class="row"><span>키우는 힘</span><div class="seg" data-k="s"><button type="button" data-v="" aria-pressed="true">전체</button>{''.join(f'<button type="button" data-v="{k}">{v[0]} {k}</button>' for k, v in SKILL.items())}</div></div>
  <div class="row"><span>원리</span><div class="seg" data-k="r"><button type="button" data-v="" aria-pressed="true">전체</button>{''.join(f'<button type="button" data-v="{k}">{v[0]} {pn(k)}</button>' for k, v in PR.items())}</div></div>
  <div class="row"><span>인원</span><div class="seg" data-k="g"><button type="button" data-v="" aria-pressed="true">상관없음</button><button type="button" data-v="1">👨‍👩‍👧 여럿이 하기 좋은 것</button></div></div>
</div>
<p class="count" id="count"></p>
{'<p class="src" style="margin:0 0 10px">🧪 새 놀이 = AI(인공지능)가 놀이 원리로 만든 놀이예요. 사람이 해 본 건 아니라 참고용이에요.</p>' if AI_ON else ''}<div class="cards" id="list">{''.join(card(p, '../') for p in rows)}</div>
</section>
<section class="blk">{SOS_BRIDGE}</section></div>
<script>
const PLAYS = {json.dumps(mini, ensure_ascii=False)};
const BANDS = {json.dumps({s: [a, b] for s, n, a, b in BANDS})};
const ICON = {json.dumps(PLACE_ICON, ensure_ascii=False)};
const st = {{b: '', p: '', r: '', g: '', s: ''}};
const SK = {json.dumps({k: v[0] for k, v in SKILL.items()}, ensure_ascii=False)};
const esc = s => String(s).replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]));
try{{ const q = new URLSearchParams(location.search); for(const k in st) if(q.get(k)) st[k] = q.get(k); }}catch(err){{}}
function draw(){{
  document.querySelectorAll('.filters .seg').forEach(s => s.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === st[s.dataset.k])));
  const [lo, hi] = st.b ? BANDS[st.b] : [0, 999];
  const list = PLAYS.filter(p => p.ageMin <= hi && p.ageMax >= lo && (!st.p || p.place === st.p) && (!st.r || p.principles.includes(st.r)) && (!st.s || p.skills.includes(st.s)) && (!st.g || p.group));
  document.getElementById('count').textContent = `놀이 ${{list.length}}개`;
  document.getElementById('list').innerHTML = list.map(p => `<a class="card" href="${{p.id}}.html"><span class="meta">${{p.a}} · ${{ICON[p.place]}} ${{p.place}}${{p.group ? ' · 👨‍👩‍👧 여럿이' : ''}}${{p.n ? ' · 🧪 새 놀이' : ''}}</span><h3>${{esc(p.name)}}</h3><p>${{esc(p.s)}}</p><span class="sk">${{p.skills.map(k => SK[k] + ' ' + k).join(' · ')}}</span></a>`).join('') || '<p class="none">조건에 맞는 놀이가 아직 없어요. 조건을 하나 풀어 보세요.</p>';
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
    files[f'age/{s}.html'] = page(f'{n}{AGE_SEO.get(s, "")} 아기놀이 {len(lst)}가지 · 엄마표 놀이 | 오늘도 독박육아', f'{n} 아기와 집에서 하는 엄마표 놀이 {len(lst)}가지. {BAND_INTRO[s]}', body, f'age/{s}.html', 'age/')
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
<h2>🧪 놀이 만들기용 분류 {sum(1 for k in PR if not PR_SRC[k])}가지 (연구 근거 없음)</h2>
<p class="src" style="margin:0 0 8px">연구에서 가져온 게 아니에요. 집 물건으로 새 놀이를 만들 때 쓰려고 우리가 묶은 분류라서, 발달 근거로 읽지 말아 주세요.</p>
<div class="prs">{''.join(f'<div class="pr pr2"><div class="meta chips-m">{src_chips(k, sum(1 for p in rows if k in p["principles"]))}</div><a href="principles/{PR_SLUG[k]}.html"><h3>{v[0]} {pn(k)}</h3><p>{v[1]}</p></a></div>' for k, v in PR.items() if not PR_SRC[k])}</div>
<h2>새 놀이 만드는 공식</h2>
<p><b>원리 1~2개 + 집에 있는 물건 1~2개 + 아이 나이에 맞는 난이도</b></p>
<ul><li>꽂고 잇기 + 채반 → 채반 구멍에 빨대 꽂기</li><li>당기고 떼기 + 빨래집게 + 상자 → 상자 테두리 빨래집게 떼기</li><li>굴리고 던지기 + 휴지심 + 벽 → 벽에 휴지심 미끄럼틀 붙여 공 굴리기</li></ul>
<p>어리면 <b>크게·적게·느리게</b>, 크면 <b>작게·많게·규칙 더하기</b>로 난이도를 바꿔요.</p>
<div class="box why"><h2>📚 어디까지가 연구이고 어디부터가 우리 생각인가요?</h2><p>위 '연구에서 확인된 패턴'은 출처가 있는 내용이에요. '놀이 만들기용 분류'와 <b>새 놀이 만드는 공식, 놀이마다 적은 추천 나이·방법·꿀팁은 우리가 생각해서 쓴 것</b>이라 발달 근거로 보지 말고 참고만 해 주세요. 각 연구가 무슨 내용인지는 아래에서 볼 수 있어요.</p><p style="margin-top:8px"><a class="btn ghost" href="research.html">참고한 연구 보기</a></p></div>
<h2 id="safety">⚠️ 생활 물건으로 놀 때 안전 원칙</h2>
<ul><li>3세 미만은 휴지심 구멍(지름 약 3.5cm)에 들어가는 크기는 질식 위험이 있어요. 병뚜껑·구슬·마른 콩·단추는 3세 미만 놀이에 쓰지 않아요.</li><li>비닐봉지·랩·고무줄·끈은 얼굴이나 목에 닿지 않게 하고, 끈은 20cm보다 짧게, 목에 거는 끈은 달지 않아요. 놀이가 끝나면 바로 치워요.</li><li>자석은 삼키면 장이 붙을 수 있어 아주 위험해요. 손바닥만 한 두꺼운 광고 자석만 쓰고, 자석 장난감의 작은 자석은 안 써요.</li><li>칼·가위·글루건·압정으로 하는 준비는 어른만 해요.</li><li>물놀이는 얕은 물이라도 어른이 늘 옆에 있어요.</li><li>12개월 미만 아기는 수건·이불로 흔들거나 말지 않고, 얼굴 위로 천을 떨어뜨리지 않아요.</li><li>어떤 놀이든 어른이 옆에서 지켜보는 게 기본이에요. 새 놀이(🧪)는 아직 직접 해 보기 전이라 더 천천히 시작해 주세요.</li></ul>
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
  <div class="sh"><span class="ey">바로 써 보는 도구</span><h2>🧰 넣으면 바로 알려 줘요</h2></div>
  <div class="tools">
    <a href="growth.html"><b>👶 우리 아이 지금</b><span>생년월만 넣으면 키·몸무게 등수, 먹는 양, 검진 시기</span></a>
    <a href="support/leave-pay-calc.html"><b>💰 육아휴직 급여 계산기</b><span>통상임금만 넣으면 달마다 받는 돈 (6+6 포함)</span></a>
    <a href="food/stages.html"><b>🥣 이유식 단계표</b><span>개월수별 끼니 수·한 끼 양을 종이컵으로</span></a>
    <a href="map.html"><b>🗺 육아 지도</b><span>내 주변 소아과, 지금 문 연 약국</span></a>
    <a href="plays/"><b>🔎 놀이 찾기</b><span>개월수·장소·키우고 싶은 힘으로 골라요</span></a>
    <a href="#sos"><b>🆘 공동육아 SOS</b><span>독박인 시간을 눌러 이웃과 모임을 열어요</span></a>
  </div>
</div></section>

<section class="blk"><div class="wrap">
  <div class="sh"><span class="ey">개월수별 놀이</span><h2>📅 우리 아기 개월수에 맞는 놀이</h2></div>
  <div class="chips grid4">{''.join(f'<a class="chip" href="age/{s}.html">{short(s, n)}</a>' for s, n, a, b in BANDS)}</div>
  <h2 style="margin-top:18px">🌱 키우고 싶은 힘으로 찾기</h2>
  <div class="chips grid4">{''.join(f'<a class="chip" href="plays/?s={k}">{v[0]} {k}</a>' for k, v in SKILL.items())}</div>
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
    <a class="pr" href="food.html"><span class="meta">질병관리청 · WHO · 미국소아과학회</span><h3>🥄 이유식·유아식 연구</h3><p>언제 시작하고, 뭘 먹이고, 뭘 피할지. 나라 기관과 세계 연구에 적힌 내용만 모았어요.</p></a>
    <a class="pr" href="research.html"><span class="meta">미국소아과학회 · 누리과정 등</span><h3>📚 놀이·교육 연구</h3><p>놀이가 왜 중요한지, 아이는 어떻게 노는지. 세계 연구와 우리나라 공공 자료를 쉽게 풀었어요.</p></a>
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
  document.getElementById('reco3').innerHTML = list.map(p => `<a class="card" href="plays/${{p.id}}.html"><span class="meta">${{p.a}} · ${{ICON[p.place]}} ${{p.place}}${{p.group ? ' · 👨‍👩‍👧 여럿이' : ''}}${{p.n ? ' · 🧪 새 놀이' : ''}}</span><h3>${{esc(p.name)}}</h3><p>${{esc(p.s)}}</p></a>`).join('') || '<p class="none">이 조합에 맞는 놀이를 아직 못 모았어요. 장소를 바꿔 보세요.</p>';
}}
document.querySelector('.form').addEventListener('click', ev => {{ const b = ev.target.closest('.seg button'); if(!b) return; const k = b.closest('.seg').dataset.k; st[k] = b.dataset.v; st.seed = 0; if(k === 'b') try{{ localStorage.setItem('dokbakBand', st.b); }}catch(err){{}} segs(); render(); }});
document.getElementById('shuffle').onclick = () => {{ st.seed++; render(); }};
segs(); render();
</script>'''
  files['index.html'] = page('오늘도 독박육아 · 개월수별 아기놀이·엄마표 놀이', '독박육아 하는 날, 아기 개월수만 고르면 집에 있는 물건으로 바로 할 수 있는 엄마표 놀이를 골라 드려요. 같이 키우는 공동육아 SOS까지.', body, 'index.html', '')

  # ── 소개 · 개인정보 · 약관 (광고 승인에 꼭 필요해요)
  prose = lambda t, h: f'<div class="wrap"><section class="blk prose">{h}</section></div>'
  files['about.html'] = page('소개 | 오늘도 독박육아', '오늘도 독박육아는 독박육아 하는 날을 덜 외롭게 만드는 놀이 정보 사이트예요.', prose('소개', f'''<h1>☕ 오늘도 독박육아</h1>
<p>혼자 아이를 보는 날, 제일 막막한 건 "오늘 뭐 하고 놀지?"예요. 이 사이트는 그 질문에 바로 답하려고 만들었어요.</p>
<h2 id="how">📝 자료를 고르고 옮기는 방법</h2><ul><li>정부 기관(질병관리청·식약처·보건복지부 등), 학회, 학술지에 실린 연구처럼 <b>누가 썼는지 분명한 자료</b>만 골라요.</li><li>원문 전체를 옮기지 않고 초록·보도자료·공식 안내에 적힌 내용을 <b>쉬운 말로 옮겨요</b>. 자료에 없는 내용은 덧붙이지 않아요.</li><li>글마다 원문 링크와 쓴 사람(기관·저자)을 밝혀요. 출처는 2026년 10월에 검색으로 확인했어요.</li><li>금액·조건처럼 바뀔 수 있는 내용은 신청 전에 공식 누리집에서 꼭 다시 확인해 주세요.</li></ul>
<h2>👨‍🍼 만든 사람</h2><p><b>육아휴직을 하고 아이를 혼자 보는 아빠</b>가 직접 만들었어요. 독박육아를 하면서 필요했던 것들을 하나씩 만들었어요.</p><ul><li><b>오늘도 독박육아</b>: 집에 있는 물건으로 바로 할 수 있는 놀이와, 믿을 만한 기관·연구에서 가져온 육아 정보를 쉬운 말로 모았어요.</li><li><b><a href="{APP}">공동육아 SOS</a></b>: 혼자 버티기 힘든 날, 같은 단지 엄마 아빠와 시간을 맞춰 함께 보려고 만든 앱이에요.</li></ul><p>놀이는 직접 해 본 것만 올리고, 육아 정보는 글마다 누가 쓴 자료인지 출처를 밝혀요.</p>
<h2>무엇을 하나요</h2><ul><li>개월수별로 집에 있는 물건으로 하는 놀이를 모아요.</li><li>아이가 왜 그 놀이를 좋아하는지 <a href="principles.html">놀이 원리</a>로 설명해요.</li><li>혼자 버티기 힘든 날엔 이웃과 함께하는 <a href="{APP}">공동육아 SOS</a>로 이어 드려요.</li></ul>
<h2>놀이 정보에 대해</h2><p>{'놀이는 두 가지예요. 직접 해 보고 정리한 놀이와, <b>🧪 새 놀이</b> 표시가 붙은 <b>AI(인공지능)가 만든 놀이</b>예요. AI 놀이는 놀이 원리와 안전 원칙에 맞춰 만들고 검토했지만 사람이 해 본 건 아니라서 <b>참고용</b>이에요.' if AI_ON else '여기 놀이는 <b>직접 해 보고 정리한 놀이</b>예요. 새 놀이는 직접 해 본 뒤에 하나씩 올려요.'} 아이마다 발달 속도가 다르니 개월수는 참고로만 봐 주세요. 놀이할 때는 꼭 어른이 옆에서 지켜봐 주세요.</p>
<h2>문의</h2><p>{CONTACT}</p>'''), 'about.html')
  files['privacy.html'] = page('개인정보처리방침 | 오늘도 독박육아', '오늘도 독박육아 개인정보처리방침', prose('개인정보', f'''<h1>개인정보처리방침</h1>
<p>오늘도 독박육아(이하 "사이트")는 회원가입이 없고, 이름·연락처 같은 개인정보를 받지 않아요.</p>
<h2>저장하는 것</h2><ul><li>내 브라우저에만: 마지막으로 고른 아기 개월수 (다음에 왔을 때 편하게 보이려고). 서버로 보내지 않아요.</li><li>내 브라우저에만: 「👶 우리 아이 지금」에 적은 태어난 해·달·날, 성별, 키·몸무게. 계산도 휴대폰 안에서만 하고 서버로 보내지 않아요. 브라우저 기록을 지우면 같이 지워져요.</li></ul>
<h2>방문 통계 (Cloudflare Web Analytics)</h2><p>사이트를 더 낫게 만들기 위해 <b>Cloudflare Web Analytics</b>로 방문 통계를 봐요. 이 도구는 <b>쿠키를 쓰지 않고</b>, 누가 왔는지 개인을 알아보지 않아요. 집계되는 것은 날짜별 방문·조회 수, 많이 본 페이지, 어디서 들어왔는지(검색·링크 등), 기기와 브라우저 종류, 나라·지역 단위의 대략적인 위치예요. IP 주소는 집계에만 잠깐 쓰이고 저장하지 않아요. 자세한 내용은 <a href="https://www.cloudflare.com/web-analytics/" rel="noopener">Cloudflare 안내</a>를 봐 주세요.</p>
<h2>방문 통계 (사이트 자체 집계)</h2><p>어떤 글이 도움이 되는지 보려고 사이트가 직접 방문 수를 세요. 페이지를 열 때 <b>날짜, 본 페이지 주소, 들어온 곳(네이버·구글처럼 사이트 이름만, 검색 주소에 들어 있으면 검색어), 기기 종류(휴대폰·태블릿·PC)</b>만 서버(Cloudflare)에 남겨요. <b>IP 주소, 쿠키, 이름 같은 개인을 알아볼 수 있는 정보는 저장하지 않아요.</b> 다른 사이트로 가는 링크(공동육아 SOS 등)를 누르면 <b>어느 사이트로 나갔는지</b>도 세요. 같은 사람이 하루에 여러 번 세어지지 않도록 브라우저 저장소에 '오늘 방문함' 표시(날짜 한 줄)만 남겨요. 이 숫자는 운영자만 봐요.</p>
<h2>🗺 육아 지도</h2><p>「📍 내 위치」를 누르면 브라우저가 위치 허용을 물어봐요. 허용하면 내 위치는 <b>이 휴대폰에서만</b> 지도를 옮기는 데 쓰고, 서버에는 약 100m 단위로 반올림한 좌표만 보내요. 서버는 이 반올림한 좌표를 공공데이터포털(건강보험심사평가원·국립중앙의료원·행정안전부)에 전달해 주변 병원·약국·놀이시설을 찾고, 카카오 로컬 API에는 어느 시도인지 확인하는 데만 보내요. 위치는 어디에도 저장하지 않고, 같은 동네의 검색 결과만 잠깐 캐시해요.</p>
<h2>쿠키와 광고 (Google 애드센스)</h2><p>이 사이트는 Google 애드센스 광고를 실을 수 있어요. 광고를 실으면 이렇게 돼요.</p><ul><li>Google을 포함한 제3자 광고 공급업체는 <b>쿠키</b>를 써서, 이용자가 이 사이트나 다른 사이트를 방문한 기록을 바탕으로 광고를 보여 줘요.</li><li>Google은 광고 쿠키를 써서 이 사이트와 인터넷의 다른 사이트 방문 기록을 바탕으로 광고를 게재할 수 있어요.</li><li>맞춤 광고는 <a href="https://adssettings.google.com" rel="noopener">Google 광고 설정</a>에서 끌 수 있어요. 다른 광고 공급업체의 맞춤 광고는 <a href="https://www.aboutads.info/choices/" rel="noopener">aboutads.info</a>에서 끌 수 있어요.</li><li>Google이 정보를 어떻게 쓰는지는 <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">Google 파트너 사이트 정보 이용 안내</a>에서 볼 수 있어요.</li></ul>
<h2>공동육아 SOS</h2><p>공동육아 SOS 앱은 따로 운영되며, 그 앱의 개인정보 안내를 따라요.</p>
<h2>문의</h2><p>{CONTACT}</p><p style="color:var(--soft)">시행일: {POLICY_DATE}</p>'''), 'privacy.html')
  files['contact.html'] = page('문의 | 오늘도 독박육아', '오늘도 독박육아 문의하기 · 잘못된 정보 알리기 · 놀이 제안', prose('문의', f'''<h1>✉️ 문의</h1>
<p>궁금한 점, 잘못된 정보, 이런 놀이·정보가 있으면 좋겠다는 제안을 메일로 보내 주세요.</p>
<div class="box"><h2>📮 메일</h2><p style="font-size:18px;margin:0"><a href="mailto:{CONTACT}">{CONTACT}</a></p><p class="src" style="margin:6px 0 0">보통 며칠 안에 답장해요. 아이 이름·연락처 같은 개인정보는 꼭 필요할 때만 적어 주세요.</p></div>
<h2>이런 걸 알려 주세요</h2><ul><li>🩺 글 내용이 공식 안내나 연구와 다를 때 (출처 링크를 함께 보내 주시면 빨리 고쳐요)</li><li>💰 국가지원 금액·조건이 바뀌었을 때</li><li>🧸 해 보니 좋았던 놀이, 바꿔 보니 더 좋았던 방법</li><li>🆘 <a href="{APP}">공동육아 SOS</a> 앱 사용 중 불편한 점</li></ul>'''), 'contact.html')
  files['terms.html'] = page('이용약관 | 오늘도 독박육아', '오늘도 독박육아 이용약관', prose('약관', f'''<h1>이용약관</h1>
<h2>1. 사이트 이용</h2><p>누구나 무료로 볼 수 있어요. 글과 놀이 정리는 운영자가 직접 쓴 것이라, 출처를 밝히면 개인적으로 공유해도 괜찮아요. 통째로 복사해 다른 곳에 올리는 건 안 돼요.</p>
<h2>2. 놀이 정보</h2><p>놀이는 일반적인 참고 정보예요. 아이의 나이·발달·건강에 맞는지는 보호자가 판단해 주세요. 모든 놀이는 어른이 옆에서 지켜볼 때 해 주세요. 놀이 중 생긴 사고에 대해 사이트가 책임지기 어려워요.</p>
<h2>2-1. 건강·발달·지원 정보</h2><p>육아 정보·연구·이유식 글은 공식 기관 안내와 연구를 쉽게 옮긴 <b>일반 정보</b>예요. 의사의 진료나 상담을 대신하지 않아요. 아이 건강·발달이 걱정되면 소아청소년과 의사와 상의해 주세요. 국가지원 금액·조건은 바뀔 수 있으니 신청 전에 공식 누리집에서 꼭 확인해 주세요.</p>
<h2>3. 바뀔 수 있어요</h2><p>약관이 바뀌면 이 페이지에 알려 드려요.</p>
<h2>문의</h2><p>{CONTACT}</p><p style="color:var(--soft)">시행일: {POLICY_DATE}</p>'''), 'terms.html')


  # ── 참고한 연구
  rs = json.load(open(os.path.join(DEV, 'research.json'), encoding='utf-8'))
  def badge(big, small=''):
    return f'<span class="bd-badge"><b>{e(big)}</b>{f"<small>{e(small)}</small>" if small else ""}</span>'
  def brow(href, title, meta, bdg):
    return f'<a class="bd-row" href="{href}"><span class="bd-main"><span class="bd-t">{e(title)}</span><span class="bd-meta">{e(meta)}</span></span>{bdg}</a>'
  def rboard(gs, folder):
    return ''.join(f'<p class="bd-cat" data-cat="{e(g.get("cat", ""))}">{e(g["title"])}</p><div class="bd" data-cat="{e(g.get("cat", ""))}">' + ''.join(brow(f'{folder}/{it["id"]}.html', it['t'], it['src'], badge(it['yr'], it['kind']) if it['yr'] else badge(it['kind'])) for it in g['items']) + '</div>' for g in gs)
  # 세부 분류 칩: 누르면 그 분류의 묶음만 보여요 (주소 #분류 로 기억)
  RCATS = [('놀이', '🧸'), ('잠·습관', '😴'), ('먹기', '🍚'), ('말 배우기', '🗣'), ('공동육아', '🤝'), ('공공 자료', '🇰🇷')]
  def rchips(gs):
    cnt = {c: sum(len(g['items']) for g in gs if g.get('cat') == c) for c, _ in RCATS}
    chips = '<button type="button" data-rc="" aria-pressed="true">전체</button>' + ''.join(f'<button type="button" data-rc="{e(c)}" aria-pressed="false">{ic} {e(c)} <small>{cnt[c]}</small></button>' for c, ic in RCATS if cnt[c])
    return f'''<div class="seg rchips" id="rchips">{chips}</div>
<script>(function(){{const w=document.getElementById('rchips');const go=c=>{{w.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rc===c)));document.querySelectorAll('[data-cat]').forEach(el=>{{el.hidden=!!c&&el.dataset.cat!==c;}});}};w.addEventListener('click',ev=>{{const b=ev.target.closest('button');if(!b)return;go(b.dataset.rc);history.replaceState(null,'',b.dataset.rc?'#'+encodeURIComponent(b.dataset.rc):location.pathname);}});const h=decodeURIComponent(location.hash.slice(1));if(h&&[...w.querySelectorAll('button')].some(b=>b.dataset.rc===h))go(h);}})();</script>'''
  def rposts(gs, folder, list_href, list_name):
    items = [it for g in gs for it in g['items']]
    for i, it in enumerate(items):
      prv = items[i - 1] if i else None; nxt = items[i + 1] if i + 1 < len(items) else None
      pager = '<div class="pager">' + (f'<a href="{prv["id"]}.html">‹ 이전 글</a>' if prv else '<span></span>') + f'<a href="../{list_href}">☰ 목록</a>' + (f'<a href="{nxt["id"]}.html">다음 글 ›</a>' if nxt else '<span></span>') + '</div>'
      orig = link(it['url'], it['name'])
      ppl = f'<p class="ppl">👤 <b>누구예요?</b> {e(it["people"])}</p>' if it.get('people') else ''
      when = f' · {e(it["yr"])}' if it['yr'] else ''
      body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="../{list_href}">{list_name}</a></p>
<article class="blk prose post" style="padding-top:12px"><h1>{e(it["t"])}</h1><p class="post-meta">{e(it["src"])}{when} · {e(it["kind"])}</p>
{sum3box(it)}{'' if it.get('sum3') else f'<p class="lead2">{e(it["sum"])}</p>'}{''.join(f'<h2>{e(x["h"])}</h2><p>{e(x["p"])}</p>' for x in it.get('secs', []))}{'' if it.get('sum3') else f'<p class="use">👉 {e(it["use"])}</p>'}{endbox(it)}{ppl}
<h2>📚 출처</h2><div class="box ref"><p class="who" style="margin:0">📄 원문: {orig}<br>{e(it["who"])}</p></div>{''.join(f'<div class="box ref"><p class="who" style="margin:0">📄 {link(x.get("url"), x["name"])}<br>{e(x["who"])}</p><p class="ppl">👤 <b>누가 쓴 자료예요?</b> {e(x["people"])}</p></div>' for x in it.get('src2', []))}
<p class="src">🔎 출처는 2026년 10월에 확인했어요 · <a href="../about.html#how">자료를 고르고 옮기는 방법</a></p>{pager}</article></div>'''
      files[f'{folder}/{it["id"]}.html'] = page(f'{it["t"]} · {list_name} | 오늘도 독박육아', it['sum'][:150], body, f'{folder}/{it["id"]}.html', list_href)
  body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › 연구·논문</p><section class="blk prose" style="padding-top:12px">
<h1>📚 연구·논문</h1><p>놀이, 잠·습관, 먹기, 말 배우기, 공동육아에 대해 연구와 공공 자료가 뭐라고 했는지 모았어요. 글마다 누가 쓴 자료인지 밝혔고, 자료에 적힌 내용만 옮겼어요. 아래 칩을 누르면 분류별로 볼 수 있어요.</p>
{rchips(rs['groups'])}
{rboard(rs['groups'], 'research')}
<p class="src">{e(rs["checked"])}</p><p style="margin-top:10px"><a class="btn ghost" href="food.html">🥄 이유식·유아식 연구도 보기</a></p></section></div>'''
  files['research.html'] = page('연구·논문 · 놀이·잠·먹기·말·공동육아 | 오늘도 독박육아', '놀이, 수면·양치·배변 습관, 편식·간식, 말 배우기, 공동육아에 대한 연구와 공공 자료를 저자·출처와 함께 쉽게 정리했어요.', body, 'research.html', 'research.html')
  rposts(rs['groups'], 'research', 'research.html', '연구·논문')
  fd = rs['food']
  body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › 이유식</p><section class="blk prose" style="padding-top:12px">
<h1>🥄 이유식·유아식 연구</h1><p>{e(fd["intro"])}</p>
<a class="box" href="food/stages.html" style="display:block;margin:0 0 14px;color:inherit;text-decoration:none"><b>🥣 이유식 단계표</b> — 6~8·9~11·12~23개월 하루 끼니·한 끼 양·질감 한눈에 보기 ›</a>
{rboard(fd['groups'], 'food')}
<p class="src">{e(rs["checked"])}</p><p style="margin-top:10px"><a class="btn ghost" href="research.html">📚 놀이·교육 연구도 보기</a></p></section></div>'''
  files['food.html'] = page('아기 이유식 시작 시기·소고기·철분 · 이유식 연구 | 오늘도 독박육아', '질병관리청·식약처·대한소아청소년과학회 이유식 안내와 WHO 이유식 지침, 땅콩 알레르기 LEAP 연구, 아기 주도 이유식 연구, 꿀·주스 권고까지 자료에 적힌 내용만 정리했어요.', body, 'food.html', 'food.html')
  rposts(fd['groups'], 'food', 'food.html', '이유식')

  # ── 칼럼 게시판 (dokbak-dev/columns/*.json · 육아 상식, 지원)
  BOARDS = [('tips', '육아 상식', '💡', '초보 엄마 아빠가 궁금해하는 것들을 연구와 공식 기관 자료로 풀었어요. 글마다 누가 쓴 자료인지 밝혀 두었고, 자료에 적힌 내용만 옮겼어요.',
             '아기는 왜 낯을 가리고 떼를 쓸까? 시기별 행동, 잠과 안전, 말과 책, 애착과 훈육까지 연구와 공식 기관 자료로 정리했어요.'),
            ('support', '지원', '🎁', '부모급여, 아동수당, 첫만남이용권, 육아휴직처럼 나라에서 받을 수 있는 지원을 정부 누리집 자료로 정리했어요. 금액과 조건은 바뀔 수 있으니 신청 전에 원문을 꼭 확인하세요.',
             '부모급여·아동수당·첫만남이용권·보육료·육아휴직 급여 등 나라에서 주는 육아 지원을 정부 자료로 정리했어요.')]
  CALC_BOX = '<a class="box" href="leave-pay-calc.html" style="display:block;margin:0 0 14px;color:inherit;text-decoration:none"><b>💰 육아휴직 급여 계산기</b> — 통상임금만 넣으면 달마다 받는 돈을 바로 계산해요 ›</a>'
  short_age = lambda c: re.sub(r'\s*\(.*?\)', '', c.get('age', ''))
  for slug, bname, bicon, bintro, bdesc in BOARDS:
    fp = os.path.join(DEV, 'columns', slug + '.json')
    if not os.path.exists(fp): continue
    posts = json.load(open(fp, encoding='utf-8'))
    cats = []
    for c in posts:
      if c['cat'] not in cats: cats.append(c['cat'])
    def cbadge(c):
      return badge(c['yr'], '기준') if c.get('yr') else badge(c.get('age', '').replace('개월', '개월\u200b'), '')
    lst = ''.join(f'<p class="bd-cat">{e(cat)}</p><div class="bd">' + ''.join(brow(f'{slug}/{c["id"]}.html', c['t'], c['lead'], badge(c['yr'][:4], '기준') if c.get('yr') else f'<span class="bd-badge wide"><b>{e(short_age(c))}</b></span>') for c in posts if c['cat'] == cat) + '</div>' for cat in cats)
    body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › {bname}</p><section class="blk prose" style="padding-top:12px">
<h1>{bicon} {bname}</h1><p>{e(bintro)}</p>
{CALC_BOX.replace('href="', 'href="support/') if slug == 'support' else ''}{lst}
<p class="src">2026년 10월에 검색으로 확인한 자료예요. 원문 전체가 아니라 검색으로 확인한 원문 문장을 바탕으로 정리했어요.</p></section></div>'''
    files[f'{slug}.html'] = page(f'{bname} | 오늘도 독박육아', bdesc, body, f'{slug}.html', f'{slug}.html')
    for i, c in enumerate(posts):
      prv = posts[i - 1] if i else None; nxt = posts[i + 1] if i + 1 < len(posts) else None
      pager = '<div class="pager">' + (f'<a href="{prv["id"]}.html">‹ 이전 글</a>' if prv else '<span></span>') + f'<a href="../{slug}.html">☰ 목록</a>' + (f'<a href="{nxt["id"]}.html">다음 글 ›</a>' if nxt else '<span></span>') + '</div>'
      secs = ''.join(f'<h2>{e(x["h"])}</h2><p>{e(x["p"])}</p>' for x in c['secs'])
      note = f'<p class="gnote">⚠️ {e(c["note"])}</p>' if c.get('note') else ''
      srcs = ''.join(f'<div class="box ref"><p class="who" style="margin:0">📄 {link(x.get("url"), x["name"])}<br>{e(x["who"])}</p><p class="ppl">👤 <b>누가 쓴 자료예요?</b> {e(x["people"])}</p></div>' for x in c['src'])
      meta = ' · '.join(v for v in [c['cat'], c.get('age', ''), c.get('basis') or ((c['yr'][:4] + '년 기준') if c.get('yr') else '')] if v)
      body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="../{slug}.html">{bname}</a> › {e(c["cat"])}</p>
<article class="blk prose post" style="padding-top:12px"><h1>{e(c["t"])}</h1><p class="post-meta">{e(meta)}</p>
<p class="lead2">{e(c["lead"])}</p>{CALC_BOX if c['id'] in ('parental-leave-pay', 'six-plus-six') else ''}{sum3box(c)}{secs}{note}{endbox(c)}
<h2>📚 출처</h2>{srcs}
<p class="src">🔎 자료에 적힌 내용만 옮겼어요 · <a href="../about.html#how">자료를 고르고 옮기는 방법</a></p>{pager}</article></div>'''
      files[f'{slug}/{c["id"]}.html'] = page(f'{c["t"]} · {bname} | 오늘도 독박육아', c['lead'][:150], body, f'{slug}/{c["id"]}.html', f'{slug}.html')

  # ── 💰 육아휴직 급여 계산기 (support/leave-pay-calc.html · 계산은 assets/leavepay.js)
  LP_SRC = [('육아휴직급여 제도안내', '고용24(work24.go.kr) · 고용노동부 제도안내', 'https://m.work24.go.kr/cm/c/f/1100/selecSystInfo.do?systClId=SC00000251&systId=SI00000402', '고용노동부가 운영하는 고용보험·육아휴직급여 안내와 신청 누리집이에요. 달마다 몇 %, 상한 얼마인지와 신청 기한이 여기 있어요.'),
            ("생후 18개월 이내 자녀가 있다면 '6+6 부모육아휴직제'", '대한민국 정책브리핑(korea.kr) · 고용노동부 카드뉴스', 'https://www.korea.kr/multi/visualNewsView.do?newsId=148930202', '6+6 부모육아휴직제의 달마다 상한(250·250·300·350·400·450만 원)이 이 자료에 있어요.'),
            ('고용보험법 시행령 제95조(육아휴직 급여)·제95조의3(부모 모두 육아휴직 시 특례)', '국가법령정보센터(law.go.kr)', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B3%A0%EC%9A%A9%EB%B3%B4%ED%97%98%EB%B2%95%EC%8B%9C%ED%96%89%EB%A0%B9', '육아휴직 급여의 비율·상한·하한(월 70만 원)과 6+6 특례의 법 조문이에요.')]
  lsrc = ''.join(f'<details class="srcd"><summary>📄 {e(n)} <small>{e(k)}</small></summary><p>{e(t)} <a href="{u}" rel="noopener">원문 열기</a></p></details>' for n, k, u, t in LP_SRC)
  lbody = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="../support.html">지원</a> › 육아휴직 급여 계산기</p>
<section class="blk" style="padding-top:12px"><div class="sh"><span class="ey">💰 계산기</span><h1 style="font-size:clamp(26px,5vw,36px)">육아휴직 급여, 달마다 얼마 받을까?</h1><p>통상임금과 휴직 시작일, 개월수를 넣으면 달마다 받는 돈과 합계를 계산해요. 시작일을 넣으면 몇 월 며칠부터 며칠까지가 몇 개월째인지, 이번 달은 얼마인지도 보여 줘요. 부부가 함께 쓰는 6+6 부모육아휴직제, 한부모 근로자도 고를 수 있어요. 넣은 숫자는 이 휴대폰에만 남아요.</p></div>
<div class="box gform">
  <div class="row"><span>누가 쓰나요</span><div class="seg" id="lpMode"><button type="button" data-v="g" aria-pressed="true">🙋 나 혼자</button><button type="button" data-v="s" aria-pressed="false">👫 부부 함께 (6+6)</button><button type="button" data-v="h" aria-pressed="false">👤 한부모</button></div></div>
  <div class="row"><span>통상임금</span><div class="gin"><input id="lpW" type="text" inputmode="decimal" placeholder="한 달 통상임금 (만 원) 예: 320" aria-label="내 통상임금 (만 원)"></div></div>
  <div class="row"><span>휴직 시작일</span><div class="gin"><input id="lpD" type="date" aria-label="내 휴직 시작일"></div></div>
  <div class="row"><span>휴직 기간</span><div class="gin"><select id="lpN" aria-label="내 휴직 개월수"></select></div></div>
  <div id="lpPartner" hidden>
    <div class="row"><span>배우자 통상임금</span><div class="gin"><input id="lpW2" type="text" inputmode="decimal" placeholder="배우자 통상임금 (만 원)" aria-label="배우자 통상임금 (만 원)"></div></div>
    <div class="row"><span>배우자 시작일</span><div class="gin"><input id="lpD2" type="date" aria-label="배우자 휴직 시작일"></div></div>
    <div class="row"><span>배우자 기간</span><div class="gin"><select id="lpN2" aria-label="배우자 휴직 개월수"></select></div></div>
  </div>
  <p class="src" style="margin:8px 0 0">통상임금은 기본급처럼 매달 정해서 받는 돈이에요. 급여명세서의 기본급과 고정수당을 더해 보면 돼요. 야근 수당, 성과급처럼 달마다 달라지는 돈은 빼요.</p>
</div>
<div id="lpOut" class="lp-out" aria-live="polite"></div>

<div class="box prose"><h2>🧮 이렇게 계산해요</h2>
<div class="lp-tw"><table class="lp-t"><thead><tr><th>달</th><th>나 혼자 (일반)</th><th>한부모</th><th>부부 함께 (6+6)</th></tr></thead><tbody>
<tr><td>1~2개월째</td><td>100% · 상한 250만</td><td>100% · 상한 300만</td><td>100% · 상한 250만</td></tr>
<tr><td>3개월째</td><td>100% · 상한 250만</td><td>100% · 상한 300만</td><td>100% · 상한 300만</td></tr>
<tr><td>4개월째</td><td>100% · 상한 200만</td><td>100% · 상한 200만</td><td>100% · 상한 350만</td></tr>
<tr><td>5개월째</td><td>100% · 상한 200만</td><td>100% · 상한 200만</td><td>100% · 상한 400만</td></tr>
<tr><td>6개월째</td><td>100% · 상한 200만</td><td>100% · 상한 200만</td><td>100% · 상한 450만</td></tr>
<tr><td>7개월째부터</td><td>80% · 상한 160만</td><td>80% · 상한 160만</td><td>80% · 상한 160만</td></tr>
</tbody></table></div>
<p>계산한 금액이 월 70만 원보다 적으면 70만 원을 받아요(하한). 2025년부터 사후지급(일부를 복직 뒤에 주던 방식)이 없어져서, 휴직하는 동안 매달 전액을 받아요.</p>
<h2>🧒 6+6, 왜 한 번에 안 주고 나눠서 줄까요?</h2>
<p>쉽게 말하면 이래요. <b>엄마가 3개월째를 더 받으려면, 아빠도 3개월째를 써야 해요.</b> 나라는 아빠가 나중에 몇 달 쓸지 미리 알 수 없어요. 그래서 아빠가 한 달 쓸 때마다 "아, 둘 다 1개월째 썼네" 하고 엄마 몫을 한 달씩 올려 줘요.</p>
<div class="ss">
  <p class="ss-h">① 엄마가 먼저 6개월 써요 <small>아직은 보통 급여예요</small></p>
  <div class="ss-row"><span class="ss-who">👩 엄마</span><div class="ss-m">{''.join(f'<i class="g">{k}</i>' for k in range(1, 7))}</div></div>
  <div class="ss-row"><span class="ss-who">👨 아빠</span><div class="ss-m">{''.join('<i class="e">?</i>' for k in range(6))}</div></div>
  <p class="ss-h">② 아빠가 나중에 3개월 써요 <small>겹치는 1·2·3개월째만 올라가요</small></p>
  <div class="ss-row"><span class="ss-who">👩 엄마</span><div class="ss-m"><i class="t">1</i><i class="t">2</i><i class="t">3</i><i class="g">4</i><i class="g">5</i><i class="g">6</i></div></div>
  <div class="ss-row"><span class="ss-who">👨 아빠</span><div class="ss-m"><i class="t">1</i><i class="t">2</i><i class="t">3</i><i class="e"></i><i class="e"></i><i class="e"></i></div></div>
  <div class="ss-row ss-pay"><span class="ss-who">💸 엄마가<br>더 받는 돈</span><div class="ss-m"><i class="p">0</i><i class="p">0</i><i class="p">50</i><i class="e">×</i><i class="e">×</i><i class="e">×</i></div></div>
  <p class="ss-note">아빠 1개월째가 끝나면 엄마 1개월째 차액, 아빠 2개월째가 끝나면 2개월째 차액… 이렇게 <b>한 달씩 따로</b> 들어와요. 아빠가 3개월만 쓰면 엄마의 4·5·6개월째는 그대로예요. (숫자는 엄마 통상임금 300만 원일 때 더 받는 돈, 만 원 단위 예시예요. 1·2개월째는 상한이 똑같이 250만 원이라 0이에요.)</p>
  <p class="ss-h">③ 아빠도 6개월 다 쓰면 <small>엄마 6개월이 모두 올라가요</small></p>
  <div class="ss-row"><span class="ss-who">👩 엄마</span><div class="ss-m">{''.join(f'<i class="t">{k}</i>' for k in range(1, 7))}</div></div>
  <div class="ss-row"><span class="ss-who">👨 아빠</span><div class="ss-m">{''.join(f'<i class="t">{k}</i>' for k in range(1, 7))}</div></div>
  <div class="ss-row ss-pay"><span class="ss-who">💸 엄마가<br>더 받는 돈</span><div class="ss-m"><i class="p">0</i><i class="p">0</i><i class="p">50</i><i class="p">100</i><i class="p">100</i><i class="p">100</i></div></div>
</div>
<p class="src">같은 색 칸 = 둘이 겹치는 개월. 겹치는 칸만 6+6 금액(상한 250·250·300·350·400·450만 원)으로 올라가요. 엄마·아빠 순서가 바뀌어도 똑같아요.</p>
<h2>👫 6+6은 언제 되나요</h2>
<p>아기가 생후 18개월이 되기 전에 엄마·아빠가 둘 다 육아휴직을 쓰면 돼요. 동시에 써도 되고, 한 사람이 먼저 쓰고 다른 사람이 나중에 써도 돼요. 6+6 상향은 두 사람이 공통으로 쓴 개월에만 붙어요. 내 3개월째가 300만 원으로 오르려면 배우자도 3개월째를 써야 해요. 그래서 먼저 쓰는 사람은 일반 급여로 받다가, 배우자의 1개월째·2개월째·3개월째…가 끝날 때마다 그달의 차액을 따로 받아요. 한 번에 받는 게 아니에요. 한 사람이 3개월만 쓰면 다른 사람도 3개월째까지만 올라가요. 계산기에 두 사람 시작일과 기간을 넣으면 이 정산이 달마다 표에 보여요. 공무원과 사립학교 교원은 대상이 아니에요. 부모가 각각 3개월 이상 쓰면 육아휴직 기간이 1년 6개월까지 늘어나요.</p>
<h2>✅ 받으려면</h2>
<p>휴직을 시작한 날 기준으로 고용보험 가입 기간(피보험 단위기간)이 180일 이상이어야 해요. 휴직을 시작하고 1개월이 지난 뒤부터, 휴직이 끝난 뒤 12개월 안에 고용24에서 신청해요. 기한이 지나면 받을 수 없어요.</p>
<p class="gnote">⚠️ 이 계산기는 고용노동부 안내 기준(2025년 1월 1일 이후 휴직 기간에 적용되는 금액)을 그대로 적용해 본 거예요. 2024년에 시작해 2025년 전에 받은 달은 예전 금액이라 달라요. 6+6이 '공통으로 쓴 개월'에만 붙는 건 고용보험법 시행령 제95조의3이 상한액을 '부모가 육아휴직을 사용한 기간이 각각 1개월인 경우 … 각각 6개월인 경우'로 나눠 정하고 있어서예요. '개월째'는 휴직 시작일부터 한 달씩 세요(11월 10일 시작이면 1개월째는 11월 10일~12월 9일). 급여는 보통 그달이 지난 뒤 신청해서 받아요. 한 달을 다 채우지 못한 달(일할 계산), 휴직 중에 회사에서 받는 돈, 단기 육아휴직(1~2주)은 계산하지 않아요. 한부모·장애아동 부모의 기간 연장 기준은 자료에서 확인하지 못해 12개월까지만 계산해요. 신청 전에 고용센터(국번 없이 1350)에서 내 경우를 꼭 확인하세요.</p>
<p>📖 더 읽기: <a href="parental-leave-pay.html">육아휴직 급여는 한 달에 얼마까지 나올까?</a> · <a href="six-plus-six.html">6+6 부모육아휴직제 사례별 계산</a> · <a href="maternity-paternity-leave.html">출산휴가와 배우자 출산휴가</a></p>
</div>
<div class="box"><h2>📚 출처는 누구예요?</h2><p class="src" style="margin:0 0 8px">자료 이름을 누르면 설명이 펼쳐져요. 2026년 10월에 확인한 기준이에요.</p>{lsrc}</div>
</section></div>'''
  files['support/leave-pay-calc.html'] = page('육아휴직 급여 계산기 · 6+6 부모육아휴직제·한부모 달마다 금액 | 오늘도 독박육아', '통상임금과 휴직 개월수를 넣으면 육아휴직 급여를 달마다 계산해요. 6+6 부모육아휴직제(상한 최대 450만 원), 한부모 근로자, 7개월째부터 80%까지 2026년 기준으로 보여 줘요.', lbody, 'support/leave-pay-calc.html', 'support.html',
    f'<script defer src="../assets/leavepay.js?v={V}"></script>')

  # ── 🗺 육아 지도 (내 주변 소아청소년과 · 문 연 약국)
  body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › 육아 지도</p><section class="blk prose" style="padding-top:12px;max-width:none">
<h1>🗺 육아 지도</h1><p class="mlead">아이가 아플 때, 내 주변 <span class="nw"><b>소아청소년과</b>와</span> <span class="nw"><b>지금 문 연 약국</b>을</span> 찾아요. <span class="nw"><b>키즈카페·공공 놀이시설</b>,</span> <span class="nw"><b>육아종합지원센터</b>·</span><span class="nw"><b>공동육아나눔터</b>도</span> 볼 수 있어요.</p>
<div class="mapwrap" id="mapwrap"><div id="map" aria-label="육아 지도"></div>
<div class="mbar"><div class="mseg" role="group" aria-label="찾을 곳"><button type="button" data-kind="peds" aria-pressed="true">🏥 소아과</button><button type="button" data-kind="pharm" aria-pressed="false">💊 약국</button><button type="button" data-kind="play" aria-pressed="false">🛝 놀이</button><button type="button" data-kind="care" aria-pressed="false">🤝 육아지원</button></div>
<div class="mrow2"><button type="button" class="mopen" id="mopen" aria-pressed="false">🟢 지금 여는 곳만</button><button type="button" class="mloc" id="locate">📍 내 위치</button></div></div>
<button type="button" class="again" id="again" hidden>🔄 여기서 다시 찾기</button></div>
<p class="msay" id="msay" aria-live="polite"></p>
<ul class="mlist" id="mlist"></ul>
<div class="box mlinks"><h2>🌙 밤·휴일에 아이가 아프면</h2>
<p><a href="https://www.e-gen.or.kr/moonlight/main.do" rel="noopener">달빛어린이병원 찾기 (응급의료포털)</a><br><small>보건복지부가 지정한 야간·휴일 소아 진료 병원이에요. 평일 밤 11~12시, 주말·휴일 오후 6시까지 문을 열어요. 병원마다 다르니 가기 전 꼭 전화해 주세요.<br>위 목록에서 <b>🌙 밤·주말 진료</b> 표시는 병원이 신고한 진료시간으로 고른 거예요 (달빛어린이병원 지정과는 달라요).</small></p>
<p><a href="https://www.e-gen.or.kr/" rel="noopener">응급의료포털 (응급실·문 연 병원)</a><br><small>위급하면 바로 <b>119</b>에 전화하세요.</small></p></div>
<p class="src">자료: 건강보험심사평가원 병원정보서비스(소아청소년과)·의료기관별상세정보서비스(진료시간), 국립중앙의료원 전국 약국 정보(오늘 영업시간), 행정안전부 전국어린이놀이시설정보·안전검사정보(키즈카페 등 놀이제공영업소·공공도서관·육아종합지원센터·박물관, 운영 중인 곳만), 한국건강가정진흥원 전국 공동육아나눔터 기관현황(2025.11.10), 부산광역시 육아종합지원센터 현황(2026.5.22, 지금은 부산만 있어요). 시설 위치는 주소로 찾은 거라 조금 다를 수 있어요. 병원·약국이 신고한 시간이라 <b>임시 휴진·공휴일은 반영되지 않을 수 있어요.</b> <b>가기 전에 꼭 전화로 확인해 주세요.</b><br>📍 내 위치는 이 휴대폰에서만 쓰고 저장하지 않아요. 지도: © OpenStreetMap · 주소 검색: 카카오</p>
</section></div>
<script src="assets/leaflet/leaflet.js"></script><script src="assets/map.js?v={V}"></script>'''
  # ── 👶 우리 아이 지금: 생년월·성별 → 개월수, WHO 키·몸무게 백분위, 시기별 먹는 양, 영유아검진 시기
  LMSJ = open(os.path.join(DEV, 'data', 'who_lms_0_60.json'), encoding='utf-8').read().strip()
  GSRC = [('WHO Child Growth Standards (아동 성장 기준) · 키·몸무게 LMS 표', '세계보건기구(WHO) · 2006', 'https://www.who.int/tools/child-growth-standards/standards', '6개국 8,440명의 모유 수유 아기를 따라가 만든 0~5세 성장 기준이에요. 이 페이지의 키·몸무게·머리둘레 등수는 이 표의 L·M·S 값으로 계산해요.'),
          ('2017 소아청소년 성장도표', '질병관리청·대한소아과학회 · 2017', '', '우리나라 영유아 검진에서 쓰는 성장도표예요. 0~35개월은 WHO 기준을 그대로 쓰고, 36개월부터는 우리나라 아이 자료로 만들어서 WHO 숫자와 조금 달라요. 이 사이트에서는 원문 표를 직접 열어 보지 못해 WHO 표로 대신 계산하고 그 차이를 적어 두었어요.'),
          ('Infant and young child feeding: Model chapter for textbooks (표 4·5)', '세계보건기구(WHO) · 2009', 'https://www.ncbi.nlm.nih.gov/books/NBK148957/', '6~8개월 하루 2~3끼(2~3큰술에서 250mL 컵 ½까지), 9~11개월 3~4끼 + 간식 1~2번(컵 ½), 12~23개월 3~4끼 + 간식 1~2번(컵 ¾~1) 안내가 여기 있어요. 2003년 PAHO/WHO 이유식 원칙을 교과서용으로 정리한 자료예요.'),
          ('2020 한국인 영양소 섭취기준 · 에너지 필요추정량', '보건복지부·한국영양학회 · 2020', '', '0~5개월 500, 6~11개월 600, 1~2세 900, 3~5세 1,400, 6~8세 남 1,700·여 1,500kcal예요. 평균 체격·보통 활동량 기준이라 아이마다 달라요. 원문 표는 검색으로 확인한 2차 자료(어린이집 식단 안내 등)를 바탕으로 했어요.'),
          ('영유아 건강검진 안내', '국민건강보험공단', 'https://www.nhis.or.kr/nhis/healthin/wbhaca04800m01.do', '8차 검진 시기(생후 14~35일부터 66~71개월까지)와 검진 기관 찾기 안내예요. 1차 검진은 2021년 1월 1일 출생아부터예요.')]
  gsrc = ''.join(f'<details class="srcd"><summary>📄 {e(n)} <small>{e(k)}</small></summary><p>{e(t)}{(" <a href=%s rel=noopener>원문 열기</a>" % u) if u else ""}</p></details>' for n, k, u, t in GSRC)
  gbody = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › 우리 아이 지금</p>
<section class="blk" style="padding-top:12px"><div class="sh"><span class="ey">👶 우리 아이 지금</span><h1 style="font-size:clamp(26px,5vw,36px)">몇 개월이고, 얼마나 크고, 얼마나 먹을까?</h1><p>태어난 해·달과 성별만 고르면 지금 개월수에 맞는 키·몸무게 범위, 하루 먹는 양, 영유아 검진 시기를 보여 줘요. 적은 내용은 이 휴대폰에만 남아요.</p></div>
<div class="box gform">
  <div class="row"><span>태어난 때</span><div class="gin"><select id="gy" aria-label="태어난 해"><option value="">해</option></select><select id="gm" aria-label="태어난 달"><option value="">달</option></select><input id="gd" type="number" min="1" max="31" placeholder="일 (선택)" aria-label="태어난 날"></div></div>
  <div class="row"><span>성별</span><div class="seg" id="gsex"><button type="button" data-v="b" aria-pressed="false">👦 남자</button><button type="button" data-v="g" aria-pressed="false">👧 여자</button></div></div>
  <div class="row"><span>일찍 태어남</span><div class="gin"><select id="gpre" aria-label="예정일보다 몇 주 일찍"><option value="0">예정일쯤(37주 이상)</option><option value="3">3주 일찍 (36주)</option><option value="4">4주 일찍 (35주)</option><option value="5">5주 일찍 (34주)</option><option value="6">6주 일찍 (33주)</option><option value="8">8주 일찍 (31주)</option><option value="10">10주 일찍 (29주)</option><option value="12">12주 일찍 (27주)</option></select></div></div>
  <div class="row"><span>지금 (선택)</span><div class="gin"><input id="gw" type="number" step="0.1" min="1" max="60" placeholder="몸무게 kg" aria-label="몸무게"><input id="gh" type="number" step="0.1" min="30" max="150" placeholder="키 cm" aria-label="키"><input id="gc" type="number" step="0.1" min="25" max="60" placeholder="머리둘레 cm" aria-label="머리둘레"></div></div>
  <div class="row"><span>잰 날 (선택)</span><div class="gin"><input id="gwhen" type="date" aria-label="키·몸무게를 잰 날"></div></div>
  <p class="src" style="margin:8px 0 0">몸무게·키·머리둘레를 적으면 같은 개월 아이 100명 중 몇 등인지도 알려 줘요. 예전에 잰 값(검진 결과지 등)이면 '잰 날'을 같이 적어야 그때 개월수로 계산해요.</p>
</div>
<div id="gout"></div>
<a class="box" href="food/stages.html" style="display:block;margin:14px 0 0;color:inherit;text-decoration:none"><b>🥣 이유식 단계표</b> — 6~8·9~11·12~23개월 하루 끼니·한 끼 양·질감 한눈에 보기 ›</a>
<div class="box"><h2>📚 출처는 누구예요?</h2><p class="src" style="margin:0 0 8px">자료 이름을 누르면 설명이 펼쳐져요. 숫자는 평균 아이 기준이라 참고용이에요. 걱정되면 소아과 의사와 상의하세요.</p>{gsrc}</div>
</section></div>'''
  files['growth.html'] = page('아기 키·몸무게 백분위 계산 · 개월수별 식사량·검진 | 오늘도 독박육아', '태어난 해·달과 성별을 고르면 지금 개월수의 키·몸무게·머리둘레 백분위(100명 중 몇 등, WHO 성장 기준), 하루 먹는 양, 영유아 건강검진 시기를 보여 줘요.', gbody, 'growth.html', 'growth.html',
    f'<script>window.WHO_LMS={LMSJ};</script><script defer src="assets/growth.js?v={V}"></script>')
  files['map.html'] = page('육아 지도 · 내 주변 소아과·문 연 약국 | 오늘도 독박육아', '아이가 아플 때 내 주변 소아청소년과와 지금 문 연 약국을 지도에서 찾아요. 달빛어린이병원 안내까지.', body, 'map.html', 'map.html', '<link rel="stylesheet" href="assets/leaflet/leaflet.css">')

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
  DSRC = [
    ('교육부 「보육사업안내」', '해마다 나오는 어린이집 운영 지침서', '어린이집이 지켜야 할 기준을 모아 둔 공식 문서예요. 반 편성, 선생님 한 명당 아이 수, 보육료, 부모가 내는 비용, 연장보육 시간 같은 내용이 여기 적혀 있어요. 원래 보건복지부가 냈는데, 2024년 6월 27일 어린이집 업무가 교육부로 넘어가서(유보통합) 지금은 교육부가 내요. 이 사이트의 어린이집 글 대부분은 2026년도 판을 바탕으로 했어요.'),
    ('영유아보육법', '어린이집에 관한 기본 법률', '어린이집을 세우고 운영하는 데 필요한 큰 틀을 정한 법이에요. CCTV 설치 의무, 어린이집 종류, 보육교사 자격 같은 내용의 뿌리가 이 법이에요. 세부 기준은 시행령·시행규칙과 「보육사업안내」가 받쳐 줘요.'),
    ('「주택건설기준 등에 관한 규정」', '국토교통부 소관 규정', '아파트 같은 공동주택을 지을 때 지켜야 할 기준을 정한 대통령령이에요. 일정 규모 이상의 아파트 단지에 어린이집을 두는 기준이 여기 있어서, 단지 안 어린이집이 어떻게 생기는지 설명할 때 참고했어요.'),
    ('한국보육진흥원', '보건복지부 산하 공공기관', '어린이집 평가제를 운영하고 보육교사 교육을 맡는 기관이에요. 평가제(모든 어린이집이 주기적으로 받는 평가)의 시기와 방식은 이 기관의 보도자료와 2024년 평가 매뉴얼을 참고했어요. 영아 놀이 자료집 「배움을 놀이에서 찾다」도 이 기관이 보건복지부와 함께 냈어요.'),
  ]
  DAYCARE_SRC = '<div class="box"><h2>📚 출처는 누구예요?</h2><p class="src" style="margin:0 0 8px">기관 이름을 누르면 설명이 펼쳐져요.</p>' + ''.join(f'<details class="srcd"><summary>🏛️ {e(n)} <small>{e(k)}</small></summary><p>{e(t)}</p></details>' for n, k, t in DSRC) + '<p class="src" style="margin-top:10px">원문을 직접 읽고 정리한 내용엔 표시가 없고, 보도자료·기사로만 확인한 내용엔 \'간접 확인\' 표시가 있어요. 근거를 확인하지 못한 관행·해석은 싣지 않았어요.</p></div>'
  for gf in sorted(f for f in os.listdir(os.path.join(DEV, 'guides')) if f.endswith('.json')):
    G = json.load(open(os.path.join(DEV, 'guides', gf), encoding='utf-8'))
    sl = G['slug']; os.makedirs(os.path.join(OUT, sl), exist_ok=True)
    tool = ''
    if G.get('tool'):
      tool = f'<div class="bridge tool"><p><b>🧰 {e(G["tool"]["name"])}</b><br>{e(G["tool"]["desc"])}</p><a class="btn teal" href="{e(G["tool"]["url"])}" rel="noopener">열기</a></div>'
    # 근거를 확인한 내용이 하나도 없는 항목(관행만 있는 것)은 페이지를 만들지 않아요 (빈 페이지 방지)
    secs = [x for x in G['sections'] if any(b.get('v') != 'x' and 'ask' not in b for b in x.get('blocks', []))]
    for i, sec in enumerate(secs):
      prv = secs[i - 1] if i else None
      nxt = secs[i + 1] if i + 1 < len(secs) else None
      pager = '<div class="pager">' + (f'<a href="{prv["id"]}.html">‹ {e(prv["title"])}</a>' if prv else '<span></span>') + (f'<a href="{nxt["id"]}.html">{e(nxt["title"])} ›</a>' if nxt else '') + '</div>'
      blocks = ''.join(gblock(b) for b in sec['blocks'])
      body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="./">{e(G["title"])}</a> › {e(sec["title"])}</p>
<article class="blk prose guide" style="padding-top:12px"><span class="ey">{G["icon"]} {e(G["ey"])}</span><h1>{e(sec["title"])}</h1>
{blocks}
{LEGEND}<p class="src">{'📚 교육부 「2026년도 보육사업안내」 기준 · <a href="./#src">출처와 확인 방법 보기</a>' if sl == 'daycare' else e(G["source"])}</p>{pager}{tool}</article></div>'''
      first = next((b for b in sec['blocks'] if 'p' in b or 'list' in b), None)
      if first and 'p' in first: d = first['p']
      elif first: d = ' '.join(x['b'] for x in first['list'][:3])
      else: d = G['desc']
      files[f'{sl}/{sec["id"]}.html'] = page(f'{sec["title"]} · {G["title"]} | 오늘도 독박육아', d[:150], body, f'{sl}/{sec["id"]}.html', f'{sl}/')
    def gcount(sec):
      n = 0
      for b in sec['blocks']:
        if 'list' in b: n += len(b['list'])
        elif 'table' in b: n += len(b['table']['rows'])
        elif 'timeline' in b: n += len(b['timeline'])
        elif 'p' in b or 'note' in b: n += 1
      return n
    def gprev(sec):
      for b in sec['blocks']:
        if 'p' in b: return b['p']
        if 'list' in b: return ' · '.join(x['b'] for x in b['list'][:4])
        if 'table' in b: return ' · '.join(b['table']['head'])
        if 'note' in b: return b['note']
      return '방문해서 물어볼 것'
    cards = '<div class="bd">' + ''.join(brow(f'{s2["id"]}.html', s2['title'], gprev(s2), badge(str(gcount(s2)), '항목') if gcount(s2) else badge('Q&A')) for s2 in secs) + '</div>'
    body = f'''<div class="wrap"><section class="blk prose" style="max-width:none">
<div class="sh"><span class="ey">{G["icon"]} {e(G["ey"])}</span><h1 style="font-size:clamp(26px,5vw,36px)">{e(G["title"])}</h1><p>{e(G["intro"])}</p></div>
{tool}
<div style="margin-top:14px">{cards}</div>
<div id="src">{DAYCARE_SRC if sl == 'daycare' else ''}</div>
<p class="src">{e(G["source"])}</p>
{'<p style="margin-top:12px"><a class="btn ghost" href="../brands.html">🏢 프뢰벨·몬테소리·눈높이… 이름 풀이</a></p>' if sl == 'daycare' else ''}</section></div>'''
    files[f'{sl}/index.html'] = page(f'{G["title"]} | 오늘도 독박육아', G['desc'], body, f'{sl}/index.html', f'{sl}/')


  # ── 유아교육 회사·교육법 이름 풀이
  B = json.load(open(os.path.join(DEV, 'brands.json'), encoding='utf-8'))
  def bitem(it):
    srcs = ' · '.join(link(u, t) for t, u in it['src'])
    return (f'<div class="box ref"><h3>{e(it["name"])}{vb(it.get("v"))}</h3><p class="who">{e(it["kind"])}</p><p>{e(it["sum"])}</p>'
            + (f'<p class="gnote">{e(it["note"])}</p>' if it.get('note') else '') + f'<p class="src" style="margin-top:6px">출처: {srcs}</p></div>')
  body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › <a href="daycare/">어린이집</a> › 이름 풀이</p><section class="blk prose" style="padding-top:12px">
<h1>🏢 {e(B["title"])}</h1><p>{e(B["intro"])}</p>
{''.join(f'<h2>{e(g["title"])}</h2>' + ''.join(bitem(it) for it in g['items']) for g in B['groups'])}
{LEGEND}<p class="src">{e(B["checked"])}</p></section></div>'''
  files['brands.html'] = page('프뢰벨·몬테소리·눈높이·씽크빅은 누구? 유아교육 회사 이름 풀이 | 오늘도 독박육아', '프뢰벨과 몬테소리는 누구이고, 한국프뢰벨·영아다중·한솔교육·대교·웅진씽크빅·교원은 어떤 회사인지 공개 자료로 확인한 것만 정리했어요.', body, 'brands.html', 'daycare/')

  # ── 📚 육아 정보 주제 탭 페이지 (info/<주제>.html): 상식·연구·이유식 글을 주제별로 모아요
  entries = {sl: [] for sl, _, _ in TOPICS}
  def topic_of(item_id, default): return TOPIC_OF.get(item_id, default)
  CATMAP_T = {'말·책·미디어': 'lang', '마음·애착·훈육': 'mind', '우리나라 공식 안내': 'health', '수면·안전': 'health', '0~12개월 행동': 'mind', '12~36개월 행동': 'mind'}
  for c in json.load(open(os.path.join(DEV, 'columns', 'tips.json'), encoding='utf-8')):
    tp = topic_of(c['id'], CATMAP_T.get(c['cat'], 'mind'))
    entries[tp].append(('tips/' + c['id'] + '.html', c['t'], c['lead'], badge(c['yr'][:4], '기준') if c.get('yr') else badge(c.get('age', ''), ''), '💡'))
  CATMAP_R = {'놀이': 'play', '공공 자료': 'play', '잠·습관': 'sleep', '먹기': 'food', '말 배우기': 'lang', '공동육아': 'together'}
  for g in rs['groups']:
    for it in g['items']:
      tp = topic_of(it['id'], CATMAP_R.get(g.get('cat'), 'play'))
      entries[tp].append(('research/' + it['id'] + '.html', it['t'], it['src'], badge(it['yr'], it['kind']) if it['yr'] else badge(it['kind']), '📚'))
  for g in rs['food']['groups']:
    for it in g['items']:
      entries['food'].append(('food/' + it['id'] + '.html', it['t'], it['src'], badge(it['yr'], it['kind']) if it['yr'] else badge(it['kind']), '🥣'))
  # 🎵 동요 추천 페이지도 '말·미디어'와 '놀이' 주제 맨 위에
  for tp_ in ('lang', 'play'):
    entries[tp_].insert(0, ('songs.html', '아이 동요 추천 · 개월수별 동요와 율동', '0~12개월 자장가·손유희부터 3세 이상 노래 놀이까지 · 노래 연구 4편', badge('동요', '추천'), '🎵'))
  for tp_, rows_ in entries.items():
    for r_ in rows_: TOPIC_OF_PAGE[r_[0]] = tp_
  os.makedirs(os.path.join(OUT, 'info'), exist_ok=True)
  bysrc = '<p class="src" style="margin-top:14px">출처 종류별로 보기: <a href="../tips.html">💡 육아 상식</a> · <a href="../research.html">📚 연구·논문</a> · <a href="../food.html">🥣 이유식</a></p>'
  for sl, ic, nm in TOPICS:
    trows = ''.join(brow('../' + h, t, m, b) for h, t, m, b, _ in entries[sl])
    body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › 육아 정보 › {e(nm)}</p><section class="blk prose" style="padding-top:12px">
<h1>{ic} {e(nm)}</h1><p>{e(TOPIC_INTRO[sl])} 글 {len(entries[sl])}개예요. 글마다 누가 쓴 자료인지 밝혔고, 자료에 적힌 내용만 옮겼어요.</p>
{STG_CARD if sl == 'food' else ''}<div class="bd">{trows}</div>{bysrc}
<p class="src">2026년 10월에 검색으로 확인한 자료예요. 원문 전체가 아니라 초록·보도자료·공식 안내를 바탕으로 정리했어요. 아이마다 다르니 걱정되면 소아과 의사와 상의하세요.</p></section></div>'''
    files[f'info/{sl}.html'] = page(f'{TOPIC_SEO.get(sl, nm)} · 육아 정보 | 오늘도 독박육아', f'{TOPIC_INTRO[sl]} 글 {len(entries[sl])}개.', body, f'info/{sl}.html', f'info/{sl}.html')

  # ── 🥣 이유식 단계표: WHO 나이 구간(6~8 · 9~11 · 12~23개월) 기준. 초기·중기·후기·완료기는 흔히 쓰는 이름으로만 붙여요
  STAGES = [
    ('6~8개월', '초기·중기', '🥄', '하루 2~3번', '큰 숟가락 2~3번으로 시작 → 종이컵 ⅔쯤(약 125mL, 야쿠르트 2병쯤)까지', '걸쭉한 죽, 곱게 으깬 음식',
     '처음엔 숟가락 끝으로 맛만 보여 줘요. 모유·분유는 그대로 먹여요.'),
    ('9~11개월', '후기', '🍚', '하루 3~4번 + 간식 1~2번', '종이컵 ⅔쯤 (약 125mL, 야쿠르트 2병쯤)', '잘게 다지거나 으깬 음식, 손으로 집어 먹는 음식',
     '손으로 집어 먹게 하면 스스로 먹는 연습이 돼요.'),
    ('12~23개월', '완료기', '🍽', '하루 3~4번 + 간식 1~2번', '종이컵 1~1⅓컵쯤 (약 190~250mL, 작은 우유 1팩 안팎)', '가족이 먹는 음식 (필요하면 다지거나 으깨서)',
     '어른 음식을 나눠 줄 때는 간을 하기 전에 덜어요.')]
  stg = ''.join(f'''<div class="box stg"><h2>{ic} {e(m)} <small>· 흔히 '{e(nm)}'</small></h2>
<div class="stg-g"><div><small>하루 끼니</small><b>{e(meals)}</b></div><div><small>한 끼 양</small><b>{e(amt)}</b></div><div><small>질감</small><b>{e(tex)}</b></div></div><p>{e(tip)}</p></div>''' for m, nm, ic, meals, amt, tex, tip in STAGES)
  stages_body = f'''<div class="wrap"><p class="crumb"><a href="../">홈</a> › <a href="../food.html">이유식</a> › 이유식 단계표</p>
<section class="blk prose" style="padding-top:12px"><div class="sh"><span class="ey">🥣 이유식 단계표</span><h1 style="font-size:clamp(24px,5vw,34px)">이유식 단계표: 시기별 끼니·양·질감</h1><p>세계보건기구(WHO) 안내를 기준으로 개월수마다 하루 몇 번, 한 번에 얼마나, 어떤 질감으로 주는지 정리했어요.</p></div>
<div class="sum3"><p class="sum3-h">📌 3줄 요약</p><ol><li>이유식은 6개월 무렵, 아기가 머리를 가누고 입을 벌리면 시작해요.</li><li>끼니와 양은 천천히 늘리고, 질감은 죽 → 다진 음식 → 가족 음식으로 바꿔 가요.</li><li>고기·달걀 같은 철분 음식은 처음부터 넣고, 돌 전 꿀과 달고 짠 맛은 피해요.</li></ol></div>
{stg}
<div class="box why"><h2>📏 집에 있는 걸로 재 보세요</h2>
<div class="tablewrap"><table class="gtable"><thead><tr><th>양</th><th>이만큼이에요</th></tr></thead><tbody>
<tr><td><b>30~45mL</b><br><small>큰 숟가락 2~3번</small></td><td>소주잔 한 잔(약 50mL)이 안 되게 · 젖병 눈금 30~45</td></tr>
<tr><td><b>약 125mL</b><br><small>6~11개월 한 끼</small></td><td>종이컵 ⅔쯤 · 야쿠르트(65mL) 2병쯤 · 작은 우유(200mL) ⅔팩쯤</td></tr>
<tr><td><b>약 190~250mL</b><br><small>12~23개월 한 끼</small></td><td>종이컵 1~1⅓컵쯤 · 작은 우유(200mL) 1팩 안팎</td></tr>
</tbody></table></div>
<ul><li>일반 <b>종이컵</b>(약 180mL)을 기준으로 적었어요. 종이컵은 크기가 조금씩 달라서 "쯤"으로 봐 주세요.</li><li><b>큰 숟가락</b>은 계량스푼 1큰술(15mL) 정도예요. 2~3번이면 종이컵 ¼이 안 되는 양이에요.</li><li>WHO 원래 안내는 250mL 컵 기준이에요. ½컵 = 종이컵 ⅔쯤, ¾~1컵 = 종이컵 1~1⅓컵쯤이에요.</li></ul></div>
<p class="src">양은 평균이에요. 아기마다 달라서 <b>배고픔·배부름 신호</b>가 먼저예요. 고개를 돌리거나 입을 다물면 그만 먹고 싶다는 뜻이에요. 초기·중기·후기·완료기는 우리나라에서 흔히 쓰는 이름이고, 경계 개월수는 자료마다 조금씩 달라요.</p>
<div class="box why"><h2>🚦 언제 시작하나요?</h2><ul><li>WHO는 <b>6개월</b>에 시작하라고 해요. 질병관리청은 모유 아기는 6개월 이후, 분유 아기는 4~6개월로 안내해요. <a href="kdca-start.html">자세히</a></li><li>대한소아청소년과학회는 날짜보다 <b>머리 가누기, 음식에 입 벌리기</b> 같은 준비 신호를 먼저 보라고 해요. <a href="kps-start.html">자세히</a></li></ul></div>
<div class="box"><h2>✅ 꼭 넣어요</h2><ul><li><b>소고기 같은 붉은 고기</b>: 타고난 철분이 4~6개월이면 많이 줄어서 이유식으로 채워요. <a href="mfds-iron.html">식약처</a> · <a href="kdca-iron.html">질병관리청</a></li><li><b>고기·생선·달걀, 과일·채소를 날마다</b> 주라고 WHO가 권해요. <a href="who.html">WHO 지침</a></li><li>싫어하는 채소도 여러 번 주면 먹게 되는 경우가 많아요. <a href="veg.html">연구 보기</a></li></ul></div>
<div class="box safe"><h2>⛔ 피해요</h2><ul><li><b>돌 전 꿀</b>은 주지 않아요. <a href="honey.html">왜 안 될까?</a></li><li><b>1살 전 과일 주스</b>는 주지 않아요. <a href="juice.html">자세히</a></li><li>처음부터 <b>달고 짠 맛</b>에 길들이지 않아요.</li><li>포도알·팝콘처럼 <b>목에 걸리기 쉬운 음식</b>은 작게 자르거나 피해요. <a href="../tips/choking-prevention.html">질식 예방</a></li></ul><p class="src" style="margin:6px 0 0">땅콩을 일찍 먹이는 것과 알레르기에 대한 연구는 <a href="leap.html">LEAP 연구</a>에 정리했어요. 알레르기가 걱정되면 소아청소년과와 먼저 상의해요.</p></div>
<div class="box ref"><h2>📚 출처</h2><ul><li>{link('https://www.who.int/publications/i/item/9789241597494', 'WHO (2009) Infant and young child feeding: Model chapter')} — 나이별 끼니 수·한 끼 양·질감</li><li>{link('https://www.who.int/publications/i/item/9789240081864', 'WHO (2023) 6~23개월 이유식 지침')} — 6개월 시작, 고기·채소 날마다, 반응하며 먹이기</li><li>질병관리청 · 식품의약품안전처 · 대한소아청소년과학회 안내 (각 링크 참고)</li></ul></div>
<p style="margin-top:14px">📏 <a href="../growth.html">우리 아이 개월수별 키·몸무게와 하루 먹는 양 보기</a></p>
</section></div>'''
  files['food/stages.html'] = page('이유식 단계표 · 초기·중기·후기·완료기 시기별 양과 횟수 | 오늘도 독박육아', '6~8개월, 9~11개월, 12~23개월 이유식 하루 끼니 수, 한 끼 양, 질감을 WHO 안내 기준으로 정리했어요. 시작 신호, 철분(소고기), 피해야 할 음식까지.', stages_body, 'food/stages.html', 'food.html')

  # ── 🎵 동요 추천: 개월수별 동요 + 율동 (노래 제목만 싣고 가사는 싣지 않아요 · 율동은 AI가 정리)
  SONGS = [
    ('0~12개월', '👶', '안고 흔들고, 손으로 놀아요', [
      ('섬집아기', '잠들기 전 자장가로 불러 줘요. 율동 대신 아기를 안고 노래 박자에 맞춰 천천히 흔들어요.'),
      ('도리도리 짝짜꿍 · 곤지곤지 잼잼', '고개 좌우로 도리도리, 손뼉 짝짜꿍, 손바닥에 검지 콕콕 곤지곤지, 주먹 쥐었다 폈다 잼잼. 아기 손을 잡고 같이 해 줘요.'),
      ('작은 별', '"반짝반짝"에 손가락을 쫙 폈다 오므려요. 누워 있는 아기 얼굴 위에서 천천히 보여 줘요.'),
      ('나비야', '두 손 엄지를 걸어 나비를 만들고 팔랑팔랑 날다가 아기 배·코에 살짝 앉혀요.')]),
    ('12~36개월', '🧒', '따라 하고, 몸으로 표현해요', [
      ('곰 세 마리', '아빠곰은 팔을 크게, 엄마곰은 중간, 애기곰은 몸을 작게 웅크려요. "으쓱으쓱"에 어깨를 들썩.'),
      ('머리 어깨 무릎 발', '노래에 맞춰 몸을 짚어요. 익숙해지면 점점 빠르게, 마지막엔 아주 느리게.'),
      ('산토끼', '두 손을 머리 위에 귀처럼 세우고 깡충깡충 뛰어요. 아직 못 뛰면 무릎만 굽혔다 펴요.'),
      ('올챙이와 개구리', '손을 꼬리처럼 흔들며 헤엄치다가, "뒷다리가 쑥" "앞다리가 쑥"에 다리·팔을 내밀고 마지막에 폴짝.'),
      ('상어가족', '손을 아기 상어는 손가락만, 엄마·아빠는 두 팔로 크게 벌려 입 모양을 만들어요.'),
      ('그대로 멈춰라', '노래하며 춤추다 "그대로 멈춰라!"에 얼음. 기다리는 힘을 길러 주는 놀이 노래예요.')]),
    ('3세 이상', '🧑', '여럿이, 규칙 있는 노래 놀이', [
      ('우리 집에 왜 왔니', '두 편으로 손잡고 줄 서서 노래하며 앞뒤로 오가요. 공동육아 모임처럼 여럿일 때 좋아요.'),
      ('동대문을 열어라', '어른 둘이 팔로 문을 만들고 아이들이 줄지어 지나가요. 노래가 끝날 때 문이 닫히면 잡혀요.'),
      ('둥글게 둥글게', '손잡고 원으로 돌다가 어른이 숫자를 외치면 그 수만큼 모여 앉아요. 수 세기 놀이가 돼요.'),
      ('리자로 끝나는 말은', '"개나리, 보따리…"처럼 같은 글자로 끝나는 말을 번갈아 대요. 말놀이라 어휘가 늘어요.'),
      ('퐁당퐁당', '돌 던지는 흉내를 내고, 손가락으로 물결이 퍼지는 모양을 그려요.')])]
  SONG_REF = [
    ('Corbeil, Trehub, Peretz (2016) · Infancy', 'https://doi.org/10.1111/infa.12114', '노래를 들려줄 때 아기가 울기 시작하기까지 걸린 시간이 말을 들려줄 때(아기 말투 포함)의 약 두 배였어요.'),
    ('Cirelli, Trehub (2020) · Developmental Psychology', 'https://doi.org/10.1037/dev0000917', '8·10개월 아기를 달랠 때 말보다 노래가 보채는 반응을 더 줄였고, 그중 <b>익숙한 노래</b>가 가장 효과가 컸고 웃음도 많았어요.'),
    ('Mehr, Song, Spelke (2016) · Psychological Science', 'https://doi.org/10.1177/0956797615626691', '집에서 부모가 불러 준 노래를 부르는 낯선 사람을 5개월 아기가 더 오래 쳐다봤어요. 같은 노래를 <b>장난감 소리로만</b> 들은 아기에겐 이런 차이가 없었어요.'),
    ('Bainbridge 외 (2021) · Nature Human Behaviour', 'https://doi.org/10.1038/s41562-020-00963-z', '처음 듣는 다른 나라 자장가에도 아기의 심박·동공 반응이 다른 노래보다 더 느긋해졌어요.')]
  sg = ''.join(f'''<div class="box"><h2>{ic} {e(band)} 동요 <small style="font-weight:400;color:var(--muted)">· {e(sub)}</small></h2><ol>{''.join(f'<li><b>{e(t)}</b> — {e(d)}</li>' for t, d in lst)}</ol></div>''' for band, ic, sub, lst in SONGS)
  sref = ''.join(f'<li>{link(u, a)}<br>{d}</li>' for a, u, d in SONG_REF)
  songs_body = f'''<div class="wrap"><p class="crumb"><a href="./">홈</a> › <a href="plays/">놀이</a> › 동요 추천</p>
<section class="blk prose" style="padding-top:12px"><div class="sh"><span class="ey">🎵 동요 추천</span><h1 style="font-size:clamp(24px,5vw,34px)">개월수별 아이 동요 추천과 율동</h1><p>음원 없이 엄마·아빠 목소리로 불러도 충분해요. 같은 노래를 자주 불러 주면 아이에게 "우리 노래"가 돼요.</p></div>
<div class="box why"><h2>📚 왜 노래를 불러 주면 좋을까요?</h2><ul>{sref}</ul><p class="src" style="margin:6px 0 0">위 연구는 아기를 달래고 관심을 끄는 효과를 본 거예요. 노래가 지능·발달을 높인다는 뜻은 아니에요.</p></div>
<div class="box"><h2>🎤 이렇게 불러 주세요</h2><ul><li><b>같은 노래를 반복</b>해요. 익숙한 노래일수록 달래는 효과가 컸어요.</li><li>틀어 주기보다 <b>직접 불러</b> 주세요. 노래 실력은 상관없어요.</li><li>보챌 때는 말로 달래기보다 노래로 바꿔 보세요.</li></ul></div>
{sg}
<p class="src" style="margin-top:14px">ℹ️ 율동 동작은 널리 알려진 동요·손유희를 바탕으로 AI 도움을 받아 정리했어요. 아이 나이와 반응에 맞게 바꿔 주세요. 가사는 저작권 때문에 싣지 않아요.</p>
<p style="margin-top:14px">💃 <a href="plays/nursery-dance.html">동요 율동 놀이</a> · <a href="tips/same-book-again.html">같은 책을 또 읽어 달라는 이유</a></p>
</section></div>'''
  files['songs.html'] = page('아이 동요 추천 · 개월수별 동요와 율동 | 오늘도 독박육아', '0~12개월 자장가·손유희부터 3세 이상 노래 놀이까지 개월수별 아이 동요 추천과 율동. 노래가 아기를 달래는 효과에 대한 연구도 함께.', songs_body, 'songs.html', 'songs.html')

  # ── 🔍 통합 검색: 만든 페이지 전부에서 제목·설명·본문을 뽑아 search.json 으로 (휴대폰에서 바로 찾아요)
  SKIND = [('plays/', '🧸 놀이'), ('age/', '📅 개월수별'), ('principles', '🧠 놀이 원리'), ('tips/', '💡 육아 상식'), ('research/', '📚 연구·논문'),
           ('food/', '🥣 이유식'), ('info/', '📂 육아 정보'), ('daycare/', '🏫 어린이집'), ('support/', '🎁 국가지원'), ('', '📄 페이지')]
  def strip(h): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S)))).strip()
  sidx = []
  for path, txt in sorted(files.items()):
    if path in ('404.html', 'privacy.html', 'terms.html', 'search.html') or not path.endswith('.html'): continue
    tm = re.search(r'<title>(.*?)</title>', txt); dm = re.search(r'<meta name="description" content="(.*?)">', txt); mm = re.search(r'<main>(.*?)</main>', txt, re.S)
    t = html.unescape(tm.group(1)).split(' | ')[0].split(' · ')[0] if tm else path
    d = html.unescape(dm.group(1)) if dm else ''
    body = strip(re.sub(r'<div class="box newp">.*?</div>|<p class="crumb">.*?</p>|<div class="pager">.*?</div>', ' ', mm.group(1), flags=re.S)) if mm else ''   # 공통 안내·길 표시는 빼요
    k = next(lab for pre, lab in SKIND if path.startswith(pre))
    sidx.append({'u': path.replace('index.html', ''), 't': t, 'd': d[:110], 'k': k, 'x': body[:380 if path.startswith('plays/') else 650]})
  sjs = json.dumps(sidx, ensure_ascii=False, separators=(',', ':'))
  open(os.path.join(OUT, 'search.json'), 'w', encoding='utf-8').write(sjs)
  import hashlib; sver = hashlib.md5(sjs.encode()).hexdigest()[:8]
  sbody = '''<div class="wrap"><section class="blk" style="padding-top:12px"><div class="sh"><span class="ey">🔍 통합 검색</span><h1 style="font-size:clamp(24px,5vw,34px)">무엇이 궁금하세요?</h1><p>놀이, 육아 상식, 연구, 이유식, 어린이집, 국가지원까지 한 번에 찾아요.</p></div>
<form class="sbox" id="sform" role="search"><input id="sq" type="search" placeholder="예: 수면교육, 이유식, 비눗방울, 육아휴직" aria-label="검색어" autocomplete="off" enterkeyhint="search"><button type="submit" aria-label="찾기">찾기</button></form>
<div class="schips" id="schips"></div>
<p class="count" id="scount"></p><div class="bd" id="sres"></div></section></div>
<script>(function(){const q=document.getElementById('sq'),res=document.getElementById('sres'),cnt=document.getElementById('scount'),chips=document.getElementById('schips');
const POP=['수면교육','이유식','떼쓰기','양치','배변','영상','책 읽기','비눗방울','숨바꼭질','육아휴직','부모급여','어린이집 비용','예방접종','공동육아'];
chips.innerHTML=POP.map(w=>`<button type="button">${w}</button>`).join('');
let idx=null;const load=()=>idx?Promise.resolve(idx):fetch(new URL('search.json?v=__SV__',location.href),{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(j=>idx=j.map(o=>Object.assign(o,{_t:o.t.toLowerCase(),_a:(o.t+' '+o.d+' '+o.x).toLowerCase().replace(/\s+/g,'')})));
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mark=(s,ws)=>{let h=esc(s);ws.forEach(w=>{if(w)h=h.split(esc(w)).join('<mark>'+esc(w)+'</mark>');});return h;};
function snip(o,ws){const src=o.d+' '+o.x;const low=src.toLowerCase();let i=-1;for(const w of ws){i=low.indexOf(w);if(i>=0)break;}if(i<0)return o.d||src.slice(0,80);const a=Math.max(0,i-30);return(a?'…':'')+src.slice(a,a+90)+'…';}
async function run(v){v=(v||'').trim();history.replaceState(null,'',v?'?q='+encodeURIComponent(v):location.pathname);chips.hidden=!!v;
 if(!v){res.innerHTML='';cnt.textContent='';return;}if(!idx)cnt.textContent='찾는 중…';try{await load();}catch(e){idx=null;cnt.textContent='검색 목록을 못 불러왔어요. 잠시 뒤 다시 눌러 주세요. ('+e.message+')';return;}
 const ws=v.toLowerCase().split(/\s+/).filter(Boolean),wn=ws.map(w=>w.replace(/\s+/g,''));
 const hit=idx.map(o=>{let sc=0;for(let i=0;i<ws.length;i++){const w=ws[i];if(o._t.includes(w))sc+=10;else if(o._a.includes(wn[i]))sc+=2;else return null;}if(o._t.startsWith(ws[0]))sc+=3;return[sc,o];}).filter(Boolean).sort((a,b)=>b[0]-a[0]).slice(0,60);
 cnt.textContent=hit.length?`"${v}" 찾은 결과 ${hit.length}개`:`"${v}"에 맞는 글이 없어요. 더 짧은 말로 찾아 보세요.`;
 res.innerHTML=hit.map(([,o])=>`<a class="bd-row" href="${o.u||'./'}"><span class="bd-main"><span class="bd-t">${mark(o.t,ws)}</span><span class="bd-meta">${mark(snip(o,ws),ws)}</span></span><span class="bd-badge wide"><b>${esc(o.k)}</b></span></a>`).join('');}
document.getElementById('sform').addEventListener('submit',e=>{e.preventDefault();q.blur();run(q.value);});
let tm;q.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(()=>run(q.value),200);});
chips.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;q.value=b.textContent;run(q.value);});
const p=new URLSearchParams(location.search).get('q');if(p){q.value=p;run(p);}else q.focus();})();</script>'''
  sbody = sbody.replace('__SV__', sver)
  files['search.html'] = page('통합 검색 | 오늘도 독박육아', '놀이, 육아 상식, 연구, 이유식, 어린이집, 국가지원을 한 번에 찾아요.', sbody, 'search.html', 'search.html')

  # ── 📖 쉬운 말 풀이 + 🔎 관련 검색어 (검색 색인을 만든 뒤에 덧붙여요: 색인에는 본문만)
  def gloss_and_keywords(path, html_):
    top = path.split('/')[0] if '/' in path else ''
    art = top in GLOSS_DIRS and not path.endswith('index.html')
    m = re.search(r'<main>(.*)</main>', html_, re.S)
    if not m: return html_
    body_ = m.group(1)
    used = []
    if art:
      out, depth_a, skip = [], 0, 0
      for part in re.split(r'(<[^>]+>)', body_):
        if part.startswith('<'):
          tg = part.lower()
          if tg.startswith('<a ') or tg == '<a>': depth_a += 1
          elif tg.startswith('</a'): depth_a = max(0, depth_a - 1)
          elif re.match(r'<(h1|h2|h3|script|style|title|button|summary)\b', tg): skip += 1
          elif re.match(r'</(h1|h2|h3|script|style|title|button|summary)>', tg): skip = max(0, skip - 1)
          out.append(part); continue
        if depth_a or skip or not part.strip(): out.append(part); continue
        for term, d in GLOSS:
          if term in used or term not in part: continue
          if any(term in u for u in used): continue   # '철결핍성 빈혈'을 풀었으면 '빈혈'은 또 안 풀어요
          part = part.replace(term, f'<abbr class="gl" title="{e(d)}">{term}</abbr>', 1); used.append(term)
        out.append(part)
      body_ = ''.join(out)
      if top in ('research', 'tips', 'food', 'principles'):   # 🩺 건강 정보 안내 (의학적 조언이 아니에요)
        note_ = '<p class="src health-note">🩺 이 글은 일반 정보예요. 의사의 진료를 대신하지 않아요. 아이마다 다르니 걱정되면 소아청소년과 의사와 상의해 주세요.</p>'
        body_ = body_.replace('<h2>📚 출처</h2>', note_ + '<h2>📚 출처</h2>', 1) if '<h2>📚 출처</h2>' in body_ else body_.replace('</article>', note_ + '</article>', 1)
      if used:
        box = '<div class="box gloss"><h2>📖 어려운 말 풀이</h2><dl>' + ''.join(f'<dt>{t}</dt><dd>{e(dict(GLOSS)[t])}</dd>' for t in used) + '</dl></div>'
        body_ = body_.replace('<h2>📚 출처</h2>', box + '<h2>📚 출처</h2>', 1) if '<h2>📚 출처</h2>' in body_ else body_.replace('</article>', box + '</article>', 1) if '</article>' in body_ else body_ + box
    # 🔎 관련 검색어: 글 주제에 맞는 말을 누르면 사이트 안 검색으로 (같은 말로 찾는 사람에게 이어 줘요)
    kws = page_keywords(path)
    if kws:
      up_ = '../' * path.count('/')
      body_ += '<div class="wrap"><section class="blk kwbox"><p class="kw-h">🔎 이런 말로도 찾아보세요</p><div class="kw">' + ''.join(f'<a href="{up_}search.html?q={quote(k)}">#{e(k)}</a>' for k in kws) + '</div></section></div>'
      html_ = html_.replace('<meta name="description"', f'<meta name="keywords" content="{e(", ".join(kws))}">\n<meta name="description"', 1)
    return html_[:m.start(1)] + body_ + html_[m.end(1):] if False else re.sub(r'<main>.*</main>', lambda _: '<main>' + body_ + '</main>', html_, count=1, flags=re.S)
  for path in list(files):
    if path.endswith('.html') and path not in ('admin.html', 'search.html', '404.html'): files[path] = gloss_and_keywords(path, files[path])

  # ── 얇은 글은 검색엔진에서만 빼요 (사이트 안에서는 그대로 보여요): 본문 800자 미만 글은 noindex + 사이트맵 제외.
  #    경험담·설명을 보태서 800자를 넘으면 다음 빌드에서 저절로 다시 검색에 나가요. 목록·도구·필수 페이지는 손대지 않아요.
  THIN_MIN = 800
  THIN_DIRS = ('plays/', 'daycare/', 'principles/', 'food/', 'research/', 'tips/', 'support/')
  THIN_KEEP = {'food/stages.html', 'support/leave-pay-calc.html'}
  def body_len(h):
    mm = re.search(r'<main>(.*)</main>', h, re.S); b = mm.group(1) if mm else h
    b = re.sub(r'<section class="blk kwbox">.*?</section>', '', b, flags=re.S)
    b = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', b, flags=re.S)
    return len(re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', b)))
  thin = [p_ for p_ in files if p_.startswith(THIN_DIRS) and not p_.endswith('index.html') and p_ not in THIN_KEEP and p_ not in NOINDEX and body_len(files[p_]) < THIN_MIN]
  for p_ in thin:
    files[p_] = re.sub(r'<link rel="canonical" href="[^"]*"><meta property="og:url" content="[^"]*">', '<meta name="robots" content="noindex,follow">', files[p_], count=1)
    NOINDEX.add(p_)
  print(f'얇은 글 {len(thin)}개는 검색엔진에서만 빼요 (본문 {THIN_MIN}자 미만)')

  # ── 쓰기 + sitemap
  for path, txt in files.items():
    os.makedirs(os.path.dirname(os.path.join(OUT, path)), exist_ok=True)
    open(os.path.join(OUT, path), 'w', encoding='utf-8').write(txt)
  # sitemap lastmod: 본문(<main>)이 실제로 바뀐 페이지만 날짜를 새로 적어요 (빌드할 때마다 전부 '오늘'로 바꾸면 검색엔진이 날짜를 믿지 않아요)
  today = datetime.date.today().isoformat()
  lm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'lastmod.json')
  try: lm = json.load(open(lm_path, encoding='utf-8'))
  except Exception: lm = {}
  for p_ in files:
    mm = re.search(r'<main>.*</main>', files[p_], re.S)
    h_ = hashlib.sha1((mm.group(0) if mm else files[p_]).encode()).hexdigest()[:12]
    if lm.get(p_, [None])[0] != h_: lm[p_] = [h_, today]
  lm = {k: v for k, v in sorted(lm.items()) if k in files}
  json.dump(lm, open(lm_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
  urls = ''.join(f'<url><loc>{BASE}/{pretty(p)}</loc><lastmod>{lm[p][1]}</lastmod></url>' for p in sorted(files) if p not in NOINDEX)
  open(os.path.join(OUT, 'sitemap.xml'), 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
  open(os.path.join(OUT, 'admin.html'), 'w', encoding='utf-8').write(page('방문 통계 | 오늘도 독박육아', '', ADMIN_BODY, 'admin.html', '', '<meta name="robots" content="noindex,nofollow">'))
  open(os.path.join(OUT, 'robots.txt'), 'w').write(f'User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: {BASE}/sitemap.xml\n')
  open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(re.sub(r'(href|src)="(?!https?:|/|#)', r'\1="/', page('페이지를 찾을 수 없어요 | 오늘도 독박육아', '', '<div class="wrap"><section class="blk prose"><h1>🙈 페이지를 찾을 수 없어요</h1><p><a href="/">홈으로 가기</a></p></section></div>', '404.html')))
  print(f'OK 놀이 {len(rows)}개 · 페이지 {len(files) + 1}개 → dokbak/')

build()
