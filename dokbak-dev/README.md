# ☕ 오늘도 독박육아 (홈페이지)

- 원본: `play-data/plays.json` (놀이 데이터) + `dokbak-dev/` (이 폴더: 생성 스크립트 · 스타일 · 아이콘)
- 결과: `dokbak/` (그대로 올리는 정적 사이트, 직접 고치지 말고 `python3 dokbak-dev/build.py`로 다시 만들어요)
- 후보(`status: 후보`) 놀이는 올리지 않아요. 직접 해 보고 `해봄`으로 바꾸면 다음 빌드부터 보여요.

## 배포 (Cloudflare Pages 새 프로젝트)
1. Workers & Pages → Create → Pages → Connect to Git → 이 저장소
2. Production branch: `claude/beautiful-feynman-n4wnyi`
3. Build command: 비움 · **Root directory: `dokbak`** · Build output directory: 비움 (또는 `/`)
   (Root를 `dokbak`으로 해야 저장소 맨 위 `functions/`(공동육아 SOS 알림 서버)가 같이 올라가지 않아요)
4. 프로젝트 이름을 `dokbak`으로 하면 주소가 `dokbak.pages.dev`예요. 다른 이름·도메인이면 `build.py`의 `BASE`를 바꾸고 다시 빌드해요.

## 페이지
- `/` 홈 (놀이 추천기 · 개월수 · 놀이 원리 · 공동육아 SOS)
- `/plays/` 놀이 찾기 (나이 · 장소 · 원리 · 인원 필터, 주소에 조건이 남아 공유 가능)
- `/plays/<id>.html` 놀이 하나 (검색 유입용, HowTo 구조화 데이터 포함)
- `/age/<개월>.html` 개월수별 · `/principles.html`, `/principles/pNN.html` 놀이 원리
- `/about.html` `/privacy.html` `/terms.html` (광고 승인 필수) · `sitemap.xml` `robots.txt`

## 꿀팁 가이드 글 (어린이집 · 앞으로 유아식 등)
- `dokbak-dev/guides/<이름>.json` 하나 = 사이트의 `/<slug>/` 묶음 하나 (목록 + 주제마다 한 페이지)
- 형식은 어린이집 체크리스트의 guide.js와 같아요: sections[{id, title, blocks}], 블록은 p · list(b,t) · table · timeline · ask · note
- 근거 표시 `v`: 없으면 공식 원문에서 확인 · "i" 간접 확인(기사·검색 요약) · "x" 근거 미확인. 새 글은 원문을 못 봤으면 꼭 붙여요.
- `daycare.json`은 kimddubuck/daycare-checklist의 guide.js(0c0a1bf)를 변환한 것. 그쪽 글이 바뀌면 다시 변환해요.
- 놀이 연구 목록: `dokbak-dev/research.json` → `/research.html`
