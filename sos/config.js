// 공동육아 SOS 달력 · Firebase 연결 설정
//
// 아래 값이 비어 있으면 "체험 모드"로 켜져요.
//   체험 모드 = 이 기기 브라우저 안에만 저장. 다른 사람과 공유는 안 돼요.
//
// 실제로 쓰려면 Firebase에서 "새 프로젝트"를 만들고 웹 앱 설정값을 붙여넣으세요.
// (윤하 성장노트 프로젝트와 섞지 마세요. 가족 기록과 공개 앱 데이터는 분리하는 게 안전해요.)
// 이 값들은 비밀번호가 아니라 "주소" 같은 것이라 공개돼도 괜찮아요.
// 실제 보호는 firestore.rules 파일의 규칙이 맡아요.
window.SOS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAnS-wdTTxJS-rdCopSZpDxfueZ_4TK2lU",
  authDomain: "sos-calendar-f6bf7.firebaseapp.com",
  projectId: "sos-calendar-f6bf7",
  storageBucket: "sos-calendar-f6bf7.firebasestorage.app",
  messagingSenderId: "133710590792",
  appId: "1:133710590792:web:1a4d163ac4679ed6d1397d"
};
