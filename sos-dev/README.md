# 🆘 공동육아 SOS

독박 예정인 날 **SOS를 예약**하고, SOS가 몰린 시간을 보고 **용기 낸 한 명이 모임을 여는** 공동육아 모임 도우미예요.
화면과 기능은 동래아 공동육아 SOS(`kimddubuck/coparenting`)와 같고, 누구나 **모임 방**을 만들어 쓸 수 있게 한 것만 달라요.

- 처음 열면: 소개 이야기 + **새 모임 방 만들기**(방 이름 + 비밀번호)
- 홈의 **🔗 친구 초대하기** → `index.html?r=방코드` 링크를 단톡방에 공유 → 친구는 비밀번호만 넣고 입장
- 홈 / 🙌 모임 / 🔒 개인정보 (🧸 놀이는 메뉴에서 뺐어요. play.html·play.js·plays.js는 나중에 다시 쓸 수 있게 그대로 둬요 — 다시 넣으려면 common.js NAV에 play 항목만 추가)

## 파일
| 파일 | 역할 |
|---|---|
| `index.html`, `meet.html`, `play.html`, `safety.html` | 페이지 (동래아 SOS 그대로) |
| `assets/gate.js` | 모임 방 입장·만들기, Firebase 설정 |
| `assets/common.js` | 메뉴, SOS 예약 도우미, 달력, 방 이름·초대 |
| `assets/meet.js`, `assets/play.js`, `plays.js` | 모임, 놀이 |
| `sos-dev/firestore.rules` | 서버 보안 규칙 (Firebase 콘솔에 붙여넣기) |
| `sos-dev/bump.sh` | 올리기 전에 실행 (휴대폰 캐시 갱신) |
| `sos-dev/_docs/` | 작업 기록 |

`sos/` 폴더에는 **사이트에 공개되는 파일만** 둬요. 설명서·규칙·기록은 이 `sos-dev/` 폴더에 있어요.

## 서버
- Firebase 프로젝트 `sos-calendar-f6bf7` (Spark 무료)
- 데이터: `rooms/{방 열쇠}` 아래 `opinions`(모임·댓글), `sos`(시간별 예약 수), `plays`(추가한 놀이)
- 방 열쇠 = SHA-256("방코드:비밀번호"). 비밀번호는 어디에도 저장하지 않아요 → **잊으면 되찾을 수 없어요**

## 올리기 (Cloudflare Pages · GitHub 자동 배포)
- Cloudflare Pages 프로젝트 `gongdong-sos`가 이 저장소에 연결돼 있어요.
  - Production branch: `claude/beautiful-feynman-n4wnyi`, Build command: 없음, Build output directory: `sos`
- 고친 뒤 `sh sos-dev/bump.sh` → 커밋 → 푸시하면 1~2분 뒤 https://gongdong-sos.pages.dev 에 반영돼요.
- 문제가 생기면 Cloudflare → gongdong-sos → Deployments에서 이전 배포의 **Rollback**
