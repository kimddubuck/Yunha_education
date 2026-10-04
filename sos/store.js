// 저장소: 방과 표시(🆘/✋)를 어디에 저장할지 담당해요.
//
// 비밀번호는 어디에도 저장하지 않아요.
// 대신 "방 코드 + 비밀번호"를 섞어 만든 열쇠(roomKey)를 저장 위치 이름으로 써요.
// 비밀번호를 모르면 열쇠를 못 만들고, 열쇠가 없으면 방 위치 자체를 못 찾아요.
//
// 두 가지 저장소가 같은 모양(메서드)을 가져요.
//   - FirebaseStore: 실제 서비스용. 모임 사람들끼리 공유돼요.
//   - LocalStore:    체험 모드. 이 기기 브라우저 안에만 저장돼요.

async function makeRoomKey(roomId, password) {
  const data = new TextEncoder().encode(roomId + ':' + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function FirebaseStore(config) {
  firebase.initializeApp(config);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const ts = () => firebase.firestore.FieldValue.serverTimestamp();

  // 회원가입 없이 "익명 로그인"으로 기기마다 번호를 받아요.
  // 이 번호로 "내가 올린 표시만 내가 지울 수 있게" 구분해요.
  let ready = null;
  function signIn() {
    if (!ready) {
      ready = auth.signInAnonymously().then(c => c.user.uid).catch(e => { ready = null; throw e; });
    }
    return ready;
  }

  const roomRef = key => db.collection('rooms').doc(key);

  return {
    demo: false,
    uid: signIn,
    async createRoom(key, name) {
      await signIn();
      await roomRef(key).set({ name, createdAt: ts() });
    },
    // 방이 있으면 이름을, 없으면(=비밀번호 틀림) null을 돌려줘요.
    async getRoomName(key) {
      await signIn();
      const snap = await roomRef(key).get();
      return snap.exists ? snap.data().name : null;
    },
    watchMarks(key, fromDate, toDate, onChange, onError) {
      let unsub = () => {};
      let stopped = false;
      signIn().then(() => {
        if (stopped) return;
        unsub = roomRef(key).collection('marks')
          .where('date', '>=', fromDate).where('date', '<=', toDate)
          .onSnapshot(qs => onChange(qs.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
      }, onError);
      return () => { stopped = true; unsub(); };
    },
    async addMark(key, mark) {
      const uid = await signIn();
      await roomRef(key).collection('marks').add({ ...mark, uid, createdAt: ts() });
    },
    async deleteMark(key, id) {
      await signIn();
      await roomRef(key).collection('marks').doc(id).delete();
    }
  };
}

function LocalStore() {
  const KEY = 'sos.demo';
  const listeners = new Set();

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { rooms: {} }; }
    catch (e) { return { rooms: {} }; }
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 환경: 이번 창에서만 유지 */ }
    listeners.forEach(fn => fn());
  }
  // localStorage를 못 쓰는 환경에서도 이번 창 안에서는 동작하도록 메모리에도 들고 있어요.
  let memory = load();
  const read = () => memory;
  const write = d => { memory = d; save(d); };

  return {
    demo: true,
    uid: async () => 'demo-user',
    async createRoom(key, name) {
      const d = read();
      d.rooms[key] = { name, marks: [] };
      write(d);
    },
    async getRoomName(key) {
      const room = read().rooms[key];
      return room ? room.name : null;
    },
    watchMarks(key, fromDate, toDate, onChange) {
      const emit = () => {
        const room = read().rooms[key];
        const marks = room ? room.marks : [];
        onChange(marks.filter(m => m.date >= fromDate && m.date <= toDate));
      };
      listeners.add(emit);
      emit();
      return () => listeners.delete(emit);
    },
    async addMark(key, mark) {
      const d = read();
      d.rooms[key].marks.push({ ...mark, id: String(Date.now()) + Math.random().toString(36).slice(2, 6), uid: 'demo-user' });
      write(d);
    },
    async deleteMark(key, id) {
      const d = read();
      d.rooms[key].marks = d.rooms[key].marks.filter(m => m.id !== id);
      write(d);
    }
  };
}

// 설정값(projectId)이 있으면 실제 서비스, 없으면 체험 모드.
function createStore() {
  const config = window.SOS_FIREBASE_CONFIG || {};
  if (!config.projectId) return LocalStore();
  if (typeof firebase === 'undefined') {
    // 설정은 했는데 Firebase 도구를 못 불러왔어요 (인터넷 문제 등).
    // 몰래 체험 모드로 바꾸면 기록이 공유되는 줄 착각하게 되니, 오류로 알려요.
    throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.');
  }
  return FirebaseStore(config);
}
