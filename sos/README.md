# 🆘 공동육아 SOS

독박 예정인 날 **SOS를 예약**하고, SOS가 몰린 시간을 보고 **용기 낸 한 명이 모임을 여는** 공동육아 모임 도우미예요.
화면과 기능은 동래아 공동육아 SOS(`kimddubuck/coparenting`)와 같고, 누구나 **모임 방**을 만들어 쓸 수 있게 한 것만 달라요.

- 처음 열면: 소개 이야기 + **새 모임 방 만들기**(방 이름 + 비밀번호)
- 홈의 **🔗 친구 초대하기** → `index.html?r=방코드` 링크를 단톡방에 공유 → 친구는 비밀번호만 넣고 입장
- 홈 / 🙌 모임 / 🧸 놀이 / 🔒 개인정보 — 동래아 SOS와 같음

## 파일
| 파일 | 역할 |
|---|---|
| `index.html`, `meet.html`, `play.html`, `safety.html` | 페이지 (동래아 SOS 그대로) |
| `assets/gate.js` | 모임 방 입장·만들기, Firebase 설정 |
| `assets/common.js` | 메뉴, SOS 예약 도우미, 달력, 방 이름·초대 |
| `assets/meet.js`, `assets/play.js`, `plays.js` | 모임, 놀이 |
| `firestore.rules` | 서버 보안 규칙 (Firebase 콘솔에 붙여넣기) |
| `bump.sh` | 올리기 전에 실행 (휴대폰 캐시 갱신) |

## 서버
- Firebase 프로젝트 `sos-calendar-f6bf7` (Spark 무료)
- 데이터: `rooms/{방 열쇠}` 아래 `opinions`(모임·댓글), `sos`(시간별 예약 수), `plays`(추가한 놀이)
- 방 열쇠 = SHA-256("방코드:비밀번호"). 비밀번호는 어디에도 저장하지 않아요 → **잊으면 되찾을 수 없어요**

## 올리기 (Cloudflare Pages)
1. `sh bump.sh`
2. `README.md`, `_docs/`, `firestore.rules`, `bump.sh`를 뺀 파일을 Cloudflare Pages 프로젝트의 새 배포로 업로드
