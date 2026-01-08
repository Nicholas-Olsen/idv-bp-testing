//=====================================================

//파이어베이스 연동을 위해 세팅한 초기 기본값 정보가 있는 섹션.

//=====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, deleteDoc, arrayUnion, arrayRemove, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBI-F8Kv3u161xHrTpN6UaP39DrddrZZ8k",
  authDomain: "idv-ban-pick-simulator-server.firebaseapp.com",
  databaseURL: "https://idv-ban-pick-simulator-server-default-rtdb.firebaseio.com",
  projectId: "idv-ban-pick-simulator-server",
  storageBucket: "idv-ban-pick-simulator-server.firebasestorage.app",
  messagingSenderId: "94691228221",
  appId: "1:94691228221:web:47b30cc75fdab0aa4d0854",
  measurementId: "G-DZDPF6XCZB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);


//=====================================================

//여태까지 작업한 app.js의 모든 내용이 있는 섹션.

//=====================================================

let globalBan = null;
let bannedSurvivors = [];
let bannedHunters = [];
let currentSet = 1;
let currentMap = 1;
let playerRole = null;
let currentTurn = 0;
let timerId = null;

let timerInterval = null;
let timeLeft = 0;

let selectedThisTurn = [];
let finalSurvivors = [];
let finalHunter = null;
let bannedMaps = []; // 글로벌 밴 ON 상태에서 이전 세트 선택한 맵 기록
let currentSetPicked = {
  survivor: [],
  hunter: [],
  bannedSurvivor: [],
  bannedHunter: []
};

// 간단한 디바운스 유틸 (전역)
let _pendingTimeout = null;
async function sendPendingSelectionsToDB(names) {
  if (!currentLobbyId) return;
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  try {
    await updateDoc(lobbyRef, {
      [`bpState.pendingSelections.${myUserId}`]: names
    });
  } catch (e) {
    console.warn('pendingSelections 업데이트 실패', e);
  }
}
function debounceSendPending(names, delay = 500) {
  if (_pendingTimeout) clearTimeout(_pendingTimeout);
  _pendingTimeout = setTimeout(() => {
    sendPendingSelectionsToDB(names);
    _pendingTimeout = null;
  }, delay);
}

//=====================================================
// 글로벌 상태 변수 (온라인용 추가)
//=====================================================

let myUserId = null;
let currentLobbyId = null; // 현재 접속 중인 방 태그
let myRole = null; // 'HOST', 'B_PLAYER', 'SPECTATOR'
let unsubscribeLobby = null; // onSnapshot 리스너 해제 함수


//=====================================================
// 초기화 및 인증
//=====================================================

async function initAuth() {
  try {
    const userCredential = await signInAnonymously(auth);
    myUserId = userCredential.user.uid;
    console.log("익명 로그인 성공:", myUserId);
    document.getElementById("mainTitle").innerText = `밴픽 시뮬레이터 - 온라인`;
  } catch (error) {
    console.error("익명 로그인 실패:", error);
    alert("서버 접속에 실패했습니다. 페이지를 새로고침해주세요.");
  }
}
initAuth();

// 전역 변수
let bgmPlayer = null;
let enableAudioBtn = null;
let bgmControlsEl = null;
let bgmToggleBtn = null;
let bgmVolumeEl = null;

// 사용할 공개 MP3 URL로 교체
const audioUrl = "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/music/a_bgm_hunter.mp3";

// 초기화: DOM 준비 후 한 번 호출
function initBgmUI() {
  bgmPlayer = document.getElementById('bgmPlayer');
  enableAudioBtn = document.getElementById('enableAudioBtn');
  bgmControlsEl = document.getElementById('bgmControls');
  bgmToggleBtn = document.getElementById('bgmToggleBtn');
  bgmVolumeEl = document.getElementById('bgmVolume');

  if (!bgmPlayer) {
    bgmPlayer = document.createElement('audio');
    bgmPlayer.id = 'bgmPlayer';
    bgmPlayer.loop = true;
    document.body.appendChild(bgmPlayer);
  }

  bgmPlayer.src = audioUrl;
  bgmPlayer.loop = true;
  bgmPlayer.preload = 'auto';
  bgmPlayer.volume = parseFloat(bgmVolumeEl ? bgmVolumeEl.value : 0.08);
  bgmPlayer.muted = false;

  // 토글 버튼
  if (bgmToggleBtn) {
    bgmToggleBtn.addEventListener('click', async () => {
      try {
        if (bgmPlayer.paused) {
          await bgmPlayer.play();
        } else {
          bgmPlayer.pause();
        }
      } catch (e) {
        console.warn('재생/일시정지 실패', e);
      }
      updateToggleButton();
    });
  }

  // 볼륨 슬라이더
  if (bgmVolumeEl) {
    bgmVolumeEl.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      bgmPlayer.volume = v;
    });
  }

  // 사운드 허용 버튼: 항상 보이도록 설정
  if (enableAudioBtn) {
    enableAudioBtn.classList.remove('hidden'); // 항상 노출
    enableAudioBtn.addEventListener('click', async () => {
      try {
        await bgmPlayer.play();
      } catch (err) {
        // 일부 환경에서 play 실패하면 muted 트릭으로 시도
        try {
          bgmPlayer.muted = true;
          await bgmPlayer.play();
          bgmPlayer.muted = false;
        } catch (err2) {
          console.warn('사용자 재생 시도 실패', err2);
          return;
        }
      }
      // 재생 성공 시 UI 전환
      enableAudioBtn.classList.add('hidden');
      if (bgmControlsEl) bgmControlsEl.classList.remove('hidden');
      updateToggleButton();
    });
  }

  // 컨트롤은 기본 숨김, 사용자가 허용하면 표시
  if (bgmControlsEl) bgmControlsEl.classList.add('hidden');
  updateToggleButton();
}

function updateToggleButton() {
  if (!bgmToggleBtn || !bgmPlayer) return;
  bgmToggleBtn.innerText = bgmPlayer.paused ? '▶' : '⏸';
}

// DOMContentLoaded에서 초기화 호출
document.addEventListener('DOMContentLoaded', () => {
  initBgmUI();
});

//=====================================================
// 로비 및 역할 관리 로직
//=====================================================

// UI 상태 업데이트
function updateUIScreen(screenId) {
  ['onlineLobbyScreen', 'lobbyWaitScreen', 'globalBanSelect', 'setSelect', 'mapSelect', 'roleSelect', 'customGlobalBan', 'draftPhase', 'endOptions'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  if (screenId) {
    const screenElement = document.getElementById(screenId);
    if (screenElement) {
      screenElement.classList.remove('hidden');
    }
  }

  // 영구 버튼 및 목록 표시 제어
  const isLobbyActive = screenId !== 'onlineLobbyScreen';
  document.getElementById("endMatchBtnPermanent").classList.toggle('hidden', !isLobbyActive);
  document.getElementById("playerListContainer").classList.toggle('hidden', !isLobbyActive);
  document.getElementById("sessionStatusInfo").classList.toggle('hidden', !isLobbyActive);
}

// 방 생성
async function createLobby() {
  console.log('createLobby invoked, lobbyInput value=', document.getElementById('lobbyInput').value);

  const lobbyId = document.getElementById("lobbyInput").value.trim();
  if (!lobbyId) {
    alert("방 태그(비밀번호)를 입력해주세요.");
    return;
  }

  const lobbyRef = doc(db, 'lobbies', lobbyId);
  try {
    const docSnap = await getDoc(lobbyRef);
    if (docSnap.exists()) {
      alert("이미 존재하는 방 태그입니다. 다른 태그를 사용하거나 [방 입장]을 시도해주세요.");
      return;
    }

    // 초기 로비 데이터
    const initialLobbyData = {
      lobbyId: lobbyId,
      status: 'SETUP', // 초기 상태: 설정 대기
      hostId: myUserId,
      players: {
        [myUserId]: {
          role: 'HOST',
          team: 'A',
          isReady: true, // 방장은 기본적으로 준비 완료
          name: `A팀(방장) ${myUserId.slice(0, 4)}`,
          lastAccess: serverTimestamp()
        }
      },
      currentSet: 1,
      currentMap: 0,
      globalBan: null,
      bannedMaps: [],
      bpState: {
        bannedSurvivors: [],
        bannedHunters: [],
        customBans: { survivor: [], hunter: [] },
        currentSetPicked: { survivor: [], hunter: [], bannedSurvivor: [], bannedHunter: [] },
        finalSurvivors: [],
        finalHunter: null,
        currentTurn: 0,
        timerStart: 0,
      },
      log: []
    };

    await setDoc(lobbyRef, initialLobbyData);
    currentLobbyId = lobbyId;
    joinLobbyWaitScreen(initialLobbyData);

  } catch (error) {
    console.error("로비 생성 실패:", error.code, error.message, error);
    alert("로비 생성 중 오류가 발생했습니다.");
  }
}

// 방 입장
async function joinLobby() {
  const lobbyId = document.getElementById("lobbyInput").value.trim();
  if (!lobbyId) {
    alert("방 태그(비밀번호)를 입력해주세요.");
    return;
  }

  const lobbyRef = doc(db, 'lobbies', lobbyId);
  try {
    const docSnap = await getDoc(lobbyRef);
    if (!docSnap.exists()) {
      alert("존재하지 않는 방 태그입니다.");
      return;
    }

    const data = docSnap.data();
    currentLobbyId = lobbyId;

    // 역할 부여
    const isHost = data.hostId === myUserId;
    const isBPlayer = Object.values(data.players).some(p => p.role === 'B_PLAYER');

    let newRole = 'SPECTATOR';
    let newTeam = null;

    if (isHost) {
      newRole = 'HOST';
      newTeam = 'A';
    } else if (!isBPlayer) {
      newRole = 'B_PLAYER';
      newTeam = 'B';
    } else {
      newRole = 'SPECTATOR';
    }

    // DB에 자신의 정보 업데이트
    await updateDoc(lobbyRef, {
      [`players.${myUserId}`]: {
        role: newRole,
        team: newTeam,
        isReady: newRole === 'HOST', // HOST만 기본 true
        name: newRole === 'HOST' ? `A팀(방장) ${myUserId.slice(0, 4)}` :
          newRole === 'B_PLAYER' ? `B팀 ${myUserId.slice(0, 4)}` :
            `관전자 ${myUserId.slice(0, 4)}`,
        lastAccess: serverTimestamp()
      }
    });

    const newPlayerData = { // ⭐ 이 객체를 만들어야 재활용할 수 있습니다.
      role: newRole,
      team: newTeam,
      isReady: newRole === 'HOST',
      name: newRole === 'HOST' ? `A팀(방장) ${myUserId.slice(0, 4)}` :
        newRole === 'B_PLAYER' ? `B팀 ${myUserId.slice(0, 4)}` :
          `관전자 ${myUserId.slice(0, 4)}`,
      lastAccess: serverTimestamp()
    };

    // DB에 자신의 정보 업데이트
    await updateDoc(lobbyRef, {
      [`players.${myUserId}`]: newPlayerData
    });

    // ⭐⭐ 문제 해결 핵심: 로컬 'data' 객체에 방금 업데이트한 정보를 반영
    // joinLobbyWaitScreen 함수가 currentLobbyId와 myUserId를 바탕으로 
    // myRole을 정확하게 설정할 수 있도록 합니다.
    data.players[myUserId] = newPlayerData;

    joinLobbyWaitScreen(data);

  } catch (error) {
    console.error("로비 입장 실패:", error);
    alert("로비 입장 중 오류가 발생했습니다.");
  }
}

// 로비 대기 화면 진입 및 실시간 감시 시작
function joinLobbyWaitScreen(initialData) {
  myRole = initialData.players[myUserId].role;
  updateUIScreen('lobbyWaitScreen');

  // ***
  // 혹은 개별 버튼 숨기기 (안전용)
  const createBtn = document.getElementById("createLobbyBtn");
  const joinBtn = document.getElementById("joinLobbyBtn");
  if (createBtn) createBtn.style.display = 'none';
  if (joinBtn) joinBtn.style.display = 'none';


  // 로비 화면 숨기기 (로비 생성/입력 필드)
  document.getElementById("onlineLobbyScreen").classList.add("hidden");

  // 상시 방 종료 버튼 노출
  document.getElementById("endMatchBtnPermanent").classList.remove("hidden");

  // 플레이어 목록 노출
  document.getElementById("playerListContainer").classList.remove("hidden");

  // 로비 대기 화면 노출
  document.getElementById("lobbyWaitScreen").classList.remove("hidden");

  document.getElementById("lobbyTitle").innerText = `현재 로비: ${currentLobbyId}`;
  document.getElementById("myRoleDisplay").innerText = myRole === 'HOST' ? 'A팀(방장)' : myRole === 'B_PLAYER' ? 'B팀' : '관전 중';

  // 로비 액션 버튼 제어
  document.getElementById("hostActions").classList.toggle('hidden', myRole !== 'HOST');
  document.getElementById("bTeamActions").classList.toggle('hidden', myRole === 'HOST');

  // B팀 팀장 및 관전자는 [나가기] 버튼 활성화
  document.getElementById("leaveLobbyBtn").classList.toggle('hidden', myRole === 'HOST');

  // 실시간 동기화 시작
  startLobbyListener();

  // joinLobbyWaitScreen 끝부분에 추가
  const lobbyTagInfo = document.getElementById("lobbyTagInfo");
  if (lobbyTagInfo) lobbyTagInfo.innerText = `로비 태그: ${currentLobbyId}`;
}


// 실시간 로비 상태 감시
function startLobbyListener() {
  if (unsubscribeLobby) unsubscribeLobby(); // 기존 리스너 해제

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);

  unsubscribeLobby = onSnapshot(lobbyRef, async (docSnap) => {

    if (!docSnap.exists()) {
      // 방장이 삭제한 경우 또는 문서가 사라진 경우
      // 모든 클라이언트에서 초기화 수행
      try {
        alert("방장이 로비를 종료했습니다.");
      } catch (e) { /* alert 실패 무시 */ }

      // 강제 초기화: 리스너 해제(안전), 세션 리셋
      if (unsubscribeLobby) {
        try { unsubscribeLobby(); } catch (e) { /* ignore */ }
        unsubscribeLobby = null;
      }
      resetSession();
      return;
    }


    const data = docSnap.data();

    syncLocalState(data);
    updateLobbyUI(data);
    handleLobbyState(data);
    renderLog(data);

  }, (error) => {
    console.error("로비 실시간 감시 오류:", error);
    if (currentLobbyId) {
      alert("서버 연결에 오류가 발생했습니다. 재접속을 시도해주세요.");
      resetSession();
    }

  });

}

// 로컬 변수 동기화
function syncLocalState(data) {
  globalBan = data.globalBan;
  currentSet = data.currentSet;
  currentMap = data.currentMap;
  bannedMaps = data.bannedMaps;

  // 내 역할 기반 진영 설정
  const myPlayerData = data.players[myUserId];
  if (myPlayerData) {
    playerRole = myPlayerData.team === 'A' ? 'survivor' :
      myPlayerData.team === 'B' ? (currentSet % 2 !== 0 ? 'hunter' : 'survivor') : null; // A/B팀 진영 배정 로직 (예시: 홀수세트 A=생, B=감)
  }

  // BP 상태 동기화 (밴픽 진행 중 변수)
  if (data.bpState) {
    const bp = data.bpState;
    bannedSurvivors = bp.bannedSurvivors || [];
    bannedHunters = bp.bannedHunters || [];
    currentSetPicked = bp.currentSetPicked || currentSetPicked;
    finalSurvivors = bp.finalSurvivors || [];

    if (bp.finalHunter) {
      if (typeof bp.finalHunter === 'string') {
        const found = (Array.isArray(hunters) ? hunters : []).find(h => h.name === bp.finalHunter);
        finalHunter = found ? { name: found.name, img: found.img } : { name: bp.finalHunter, img: null };
      } else if (typeof bp.finalHunter === 'object') {
        finalHunter = bp.finalHunter;
      } else {
        finalHunter = null;
      }
    } else {
      finalHunter = null;
    }

    currentTurn = bp.currentTurn || 0;
    // 타이머 동기화는 별도로 처리 (너무 복잡해지는 것을 방지)
    window.pendingSelections = bp.pendingSelections || {};
  }
}


// UI 업데이트 (플레이어 목록, 상태 정보, 준비 버튼 등)
function updateLobbyUI(data) {
  // 1. 변수 초기화 및 로직 계산
  const playerListDiv = document.getElementById("playerList");
  playerListDiv.innerHTML = '';

  const players = Object.values(data.players);
  const playerCount = players.length;
  const bPlayerExists = players.some(p => p.role === 'B_PLAYER');
  const bPlayerIsReady = players.some(p => p.role === 'B_PLAYER' && p.isReady);

  // 2. 플레이어 목록 업데이트
  players.forEach(p => {
    let div = document.createElement("div");
    div.className = `player-item ${p.role === 'HOST' ? 'host' : p.role === 'SPECTATOR' ? 'spectator' : ''}`;
    let readyStatus = '';

    if (p.role === 'B_PLAYER') {
      if (p.isReady) {
        readyStatus = ' (준비 완료)';
        div.classList.add('ready');
      } else {
        readyStatus = ' (준비 중)';
      }
    }

    div.innerText = `${p.name} (${p.role})${readyStatus}`;
    playerListDiv.appendChild(div);
  });

  // 2. ⭐⭐ HOST/B_PLAYER 액션 버튼 제어 

  const hostActions = document.getElementById("hostActions");
  const bTeamActions = document.getElementById("bTeamActions");
  const startDraftBtn = document.getElementById("startDraftBtn");
  const readyBtn = document.getElementById("readyBtn");

  // A팀 (HOST) 권한 제어
  if (myRole === 'HOST') {
    if (hostActions) hostActions.classList.remove("hidden");
    if (bTeamActions) bTeamActions.classList.add("hidden");

    if (startDraftBtn) {
      startDraftBtn.disabled = !(bPlayerExists && bPlayerIsReady);
    }

    // Host는 나가기 버튼 숨김(옵션)
    if (leaveLobbyBtn) leaveLobbyBtn.classList.add('hidden');
  }
  // B팀 (B_PLAYER) 권한 제어
  else if (myRole === 'B_PLAYER') {
    // UI 노출/숨김 확실히 처리
    if (bTeamActions) bTeamActions.classList.remove("hidden");
    if (hostActions) hostActions.classList.add("hidden");

    // leave 버튼은 B팀과 관전자 모두에게 보이도록 처리하되,
    // B팀일 때는 항상 보이게 함
    if (leaveLobbyBtn) leaveLobbyBtn.classList.remove('hidden');

    // 안전 검사: myPlayerData가 없을 수 있으므로 방어
    const myPlayerData = (data.players && data.players[myUserId]) ? data.players[myUserId] : null;

    if (readyBtn) {
      if (myPlayerData && myPlayerData.isReady) {
        // 이미 준비 상태면 버튼 비활성화(또는 준비 취소 로직이 있으면 다르게)
        readyBtn.disabled = true;
        readyBtn.innerText = "준비 완료";
      } else {
        // 준비 중이 아닌 경우: 최소 인원 조건 등으로 활성화 제어
        // playerCount는 상단에서 계산된 값
        readyBtn.disabled = (playerCount < 2);
        readyBtn.innerText = "준비 완료";
      }
    }
  }
  // 관전자 권한 제어
  else {
    if (hostActions) hostActions.classList.add("hidden");
    if (bTeamActions) bTeamActions.classList.add("hidden");

    // 관전자는 나가기 버튼 보이게
    if (leaveLobbyBtn) leaveLobbyBtn.classList.remove('hidden');
  }


  // updateLobbyUI 내부, hostActions / bTeamActions 제어 이후에 추가
  const roleChangeContainer = document.getElementById("roleChangeContainer");
  const changeRoleBtn = document.getElementById("changeRoleBtn");

  // 기본 숨김
  if (roleChangeContainer) roleChangeContainer.classList.add('hidden');

  if (myRole && myRole !== 'HOST') {
    // 방장이 아닌 경우에만 버튼 노출
    if (roleChangeContainer) roleChangeContainer.classList.remove('hidden');

    // 버튼 활성화 여부: 로컬 상태로는 항상 활성화하되, 클릭 시 서버 검사로 최종 판단
    if (changeRoleBtn) {
      changeRoleBtn.disabled = false;
    }
  } else {
    // 방장 또는 미정인 경우 숨김
    if (roleChangeContainer) roleChangeContainer.classList.add('hidden');
  }


  // 4. 역할 상태 정보창 업데이트 
  document.getElementById("myRoleDisplay").innerText = myRole === 'HOST' ? 'A팀(방장)' : myRole === 'B_PLAYER' ? 'B팀' : '관전 중';

  // 글로벌 밴 상태 (나머지 로직 유지)
  if (data.globalBan !== null && data.globalBan !== undefined) {
    document.getElementById("globalBanStatus").innerText = `글로벌 밴: ${data.globalBan ? 'ON' : 'OFF'}`;
  } else {
    document.getElementById("globalBanStatus").innerText = '';
  }

  // 5. 세트/맵 정보 업데이트 (나머지 로직 유지)
  if (data.status !== 'SETUP') {
    updateSetMapInfo(data);
  }

  const roleSelectScreen = document.getElementById("roleSelect");
  if (roleSelectScreen && !roleSelectScreen.classList.contains('hidden')) {

    // 이미 다른 팀이 선택한 진영 확인
    let selectedByOther = null;
    let mySelectedRole = data.players[myUserId]?.selectedRole;

    players.forEach(p => {
      // 다른 팀 플레이어의 선택을 확인
      if (p.userId !== myUserId && p.selectedRole) {
        selectedByOther = p.selectedRole;
      }
    });

    const survivorBtn = document.getElementById("survivorRoleBtn");
    const hunterBtn = document.getElementById("hunterRoleBtn");
    const roleNextBtn = document.getElementById("roleNextBtn");

    // 버튼 활성화/비활성화 로직
    survivorBtn.disabled = (selectedByOther === 'survivor');
    hunterBtn.disabled = (selectedByOther === 'hunter');

    // 선택 강조 (내 선택)
    survivorBtn.classList.toggle("selected", mySelectedRole === 'survivor');
    hunterBtn.classList.toggle("selected", mySelectedRole === 'hunter');

    // '다음' 버튼 활성화 로직
    // ⭐ 방장만 '다음' 버튼을 볼 수 있고, A팀과 B팀 모두 진영을 선택했을 때만 활성화
    const hostSelected = players.some(p => p.role === 'HOST' && p.selectedRole);
    const bPlayerSelected = players.some(p => p.role === 'B_PLAYER' && p.selectedRole);

    if (myRole === 'HOST') {
      roleNextBtn.classList.remove('hidden'); // 방장에게만 노출
      roleNextBtn.disabled = !(hostSelected && bPlayerSelected); // A/B팀 모두 선택해야 활성화
    } else {
      roleNextBtn.classList.add('hidden'); // 방장 외에는 숨김
    }
  }
}


// 로비 상태에 따른 화면 전환 및 권한 제어
async function handleLobbyState(data) {
  if (!data) {
    // 데이터가 없으면 안전하게 세션 초기화
    console.warn("handleLobbyState: data is null/undefined — resetting session");
    resetSession();
    return;
  }

  // 1. UI 업데이트 (플레이어 목록, 버튼 활성화/숨김)
  // 이 함수가 hostActions와 startDraftBtn 활성화 여부를 결정합니다.
  updateLobbyUI(data);
  const status = data.status || 'SETUP';

  const lobbyInputGroup = document.getElementById("lobbyInputGroup");
  const createBtn = document.getElementById("createLobbyBtn");
  const joinBtn = document.getElementById("joinLobbyBtn");

  if (myRole === 'HOST') {
    // 호스트는 항상 로비 태그 입력칸을 볼 수 있도록 유지
    if (lobbyInputGroup) lobbyInputGroup.style.display = '';

    // 단, '방 생성' / '방 입장' 버튼은 로비 진입 이후에는 숨김 처리
    if (createBtn) createBtn.style.display = 'none';
    if (joinBtn) joinBtn.style.display = 'none';
  }

  // DB에서 필요한 데이터 추출 (로컬 변수 대신 DB 데이터 사용)
  const globalBan = data.globalBan;
  const bannedMaps = data.bannedMaps || [];
  const currentSet = data.currentSet || 1;
  const currentMapId = data.currentMap || 0;
  const A_role = data.A_role;
  const B_role = data.B_role;
  const setMapInfoEl = document.getElementById("setMapInfo");

  if (setMapInfoEl) {
    if (currentSet > 0) {
      // 1. 플레이어의 현재 진영 결정
      let playerRoleText = '미정';
      let currentRole = null;

      if (myRole === 'HOST') currentRole = A_role;
      else if (myRole === 'B_PLAYER') currentRole = B_role;

      if (currentRole === 'survivor') playerRoleText = '생존자';
      else if (currentRole === 'hunter') playerRoleText = '감시자';
      else playerRoleText = '선택 전'; // 진영 선택이 아직 안된 경우

      // 2. 맵 이름 변환 (getMapNameById 함수가 정의되어 있어야 함)
      const mapName = getMapNameById(currentMapId);

      // 3. 사용자가 원하는 형식으로 표시
      setMapInfoEl.innerHTML = `선택 진영: ${playerRoleText} | 세트: ${currentSet} | 맵: ${mapName}`;
    } else {
      // 세트가 0일 때 (밴픽 설정 이전)
      setMapInfoEl.innerHTML = `밴픽 설정 중...`;
    }
  }

  // 관전자는 모든 설정 단계에서 대기 화면만 봅니다.
  if (myRole === 'SPECTATOR') {
    if (status === 'BP_IN_PROGRESS') {
      updateUIScreen('draftPhase');
    } else if (status === 'FINISHED') {
      showFinalLineup();
      document.getElementById('leaveLobbyBtn').classList.remove('hidden');
    } else {
      updateUIScreen('lobbyWaitScreen');
    }
    return;
  }

  // 상태별 화면 전환
  if (status === 'SETUP') {
    // SETUP 상태에서는 모든 플레이어에게 로비 대기 화면만 보여줍니다.
    updateUIScreen('lobbyWaitScreen');

  } else if (status === 'GLOBAL_BAN') {
    // 밴픽 시작 버튼 클릭 후, HOST에게만 글로벌 밴 선택 화면을 보여줍니다.
    if (myRole === 'HOST') {
      updateUIScreen('globalBanSelect');
    } else {
      updateUIScreen('lobbyWaitScreen'); // B팀은 대기
    }

  } else if (status === 'SET_SELECT') {
    // 글로벌 밴 선택 후 '다음' 버튼을 눌렀을 때
    if (myRole === 'HOST') {
      updateUIScreen('setSelect');

      // 세트 번호 표시 업데이트
      const setNumberEl = document.getElementById("setNumber");
      if (setNumberEl) {
        setNumberEl.value = currentSet || 1;
      }
    } else {
      updateUIScreen('lobbyWaitScreen'); // B팀은 대기
    }

  } else if (status === 'MAP_SELECT') {
    // 세트 선택 후: 맵 선택 화면 노출

    // 맵 선택이 아직 완료되지 않았다면 (currentMap이 0)
    if (currentMap === 0) {
      if (myRole === 'HOST') {
        updateUIScreen('mapSelect'); // ⭐ 방장에게 맵 선택 화면 노출

        // 맵 선택 비활성화 로직
        const mapSelectElement = document.getElementById("mapNumber");
        if (mapSelectElement) {
          Array.from(mapSelectElement.options).forEach(opt => {
            // 글로벌 밴 ON일 때, bannedMaps에 포함된 맵 비활성화
            const isBanned = globalBan && bannedMaps.includes(parseInt(opt.value));
            opt.disabled = isBanned;
          });
        }
      } else {
        updateUIScreen('lobbyWaitScreen'); // B팀은 맵 선택 대기
      }
    } else {
      // 맵 선택이 완료되었다면, 다음 단계인 ROLE_SELECT로 HOST가 전환해야 함
      // 만약 HOST가 아직 전환하지 않았다면, HOST/B_PLAYER 모두 맵 선택 대기 상태 유지
      // (혹은 HOST가 다음 버튼을 눌러 상태가 ROLE_SELECT로 변경되기를 기다림)
      updateUIScreen('lobbyWaitScreen'); // 맵이 선택되었으므로 다음 단계로 넘어갈 준비
    }

  } else if (status === 'ROLE_SELECT') {
    // 맵 선택 완료 후 다음 단계: 진영 선택 화면
    if (myRole !== 'SPECTATOR') {
      updateUIScreen('roleSelect');
      updateRoleSelectionUI(data);
    }

    // 'CUSTOM_BAN' 상태: 커스텀 글로벌 밴 진행
  } else if (status === 'CUSTOM_BAN') {
    updateUIScreen('customGlobalBan');

    // startCustomGlobalBan는 data를 받아 목표값 초기화, selected 초기화, 레이블 갱신, 카드 렌더, 버튼 갱신까지 수행
    startCustomGlobalBan(data);

    // 방장에게만 버튼 활성화 로직 실행 (onSnapshot에서 호출될 때도 항상 안전)
    if (myRole === 'HOST') {
      updateCustomBanUI(data);
    }


    // 'BP_IN_PROGRESS' 상태: 밴픽 진행
  } else if (status === 'BP_IN_PROGRESS') {
    // 밴픽 진행 단계
    updateUIScreen('draftPhase');
    renderDraftPhaseTurn(data);

    // 밴픽 턴 진행 UI 업데이트 (문구 등)
    updateDraftPhaseUI(data);
    updateCurrentLineup(data);

    // 'FINISHED' 상태: 세트 종료
  } else if (status === 'FINISHED') {
    showFinalLineup();
    if (myRole === 'HOST') {
      document.getElementById('endOptions').classList.remove('hidden');
    } else {
      document.getElementById('leaveLobbyBtn').classList.remove('hidden'); // 나가기 활성화
    }
  }
}

// B팀<>관전자 권한 변경 버튼 클릭 핸들러
async function toggleRole() {
  if (!currentLobbyId || !myUserId) return;

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);

  try {
    // 1) 최신 로비 문서 읽기
    const docSnap = await getDoc(lobbyRef);
    if (!docSnap.exists()) {
      alert("로비가 존재하지 않습니다.");
      resetSession();
      return;
    }

    const data = docSnap.data();
    const players = data.players || {};
    const myPlayer = players[myUserId] || {};
    const myCurrentRole = myPlayer.role || 'SPECTATOR';

    if (myCurrentRole === 'B_PLAYER') {
      // B_PLAYER -> SPECTATOR
      await updateDoc(lobbyRef, {
        [`players.${myUserId}.role`]: 'SPECTATOR',
        [`players.${myUserId}.team`]: null,
        [`players.${myUserId}.isReady`]: false,
        [`players.${myUserId}.selectedRole`]: null
      });

    } else {
      // SPECTATOR -> B_PLAYER : 다른 B_PLAYER 존재 여부 확인
      const otherBPlayer = Object.entries(players).find(([uid, p]) => uid !== myUserId && p.role === 'B_PLAYER');

      if (otherBPlayer) {
        alert("이미 B팀 플레이어가 존재합니다. 해당 플레이어가 관전으로 전환되면 다시 시도하세요.");
        return;
      }

      // B_PLAYER로 변경: 필요한 필드 모두 설정
      await updateDoc(lobbyRef, {
        [`players.${myUserId}.role`]: 'B_PLAYER',
        [`players.${myUserId}.team`]: 'B',
        [`players.${myUserId}.isReady`]: false,
        [`players.${myUserId}.name`]: `B팀 ${myUserId.slice(0, 4)}`,
        [`players.${myUserId}.selectedRole`]: null,
        [`players.${myUserId}.lastAccess`]: serverTimestamp()
      });
    }

    renderLog(data);


    // 3) 최신 문서 재조회하여 로컬 상태와 UI 즉시 갱신
    const updatedSnap = await getDoc(lobbyRef);
    if (updatedSnap.exists()) {
      const updatedData = updatedSnap.data();

      // 로컬 동기화 함수 재사용
      syncLocalState(updatedData);

      // myRole을 DB 기준으로 확실히 설정
      myRole = updatedData.players?.[myUserId]?.role || 'SPECTATOR';

      // UI 업데이트
      updateLobbyUI(updatedData);

      // onSnapshot 리스너가 이미 있다면 리스너가 동일 작업을 수행하므로 중복이지만 안전을 위해 호출
      alert("권한이 변경되었습니다.");
    }

  } catch (error) {
    console.error("권한 변경 실패:", error.code, error.message, error);
    alert("권한 변경 중 오류가 발생했습니다: " + (error.message || "알 수 없는 오류"));
  }
}


function renderDraftPhaseTurn(data) {
  if (!data) return;
  const bp = data.bpState || {};
  const currentSetId = data.currentSet || 1;
  const currentTurnNum = (typeof bp.currentTurn === 'number' && bp.currentTurn > 0) ? bp.currentTurn : 0;

  // 아직 시작 전
  if (currentTurnNum === 0) {
    document.getElementById("turnInfo").innerText = "대기 중...";
    return;
  }

  const lobbySetFlow = setFlows[currentSetId];
  if (!lobbySetFlow || !lobbySetFlow[currentTurnNum - 1]) {
    document.getElementById("turnInfo").innerText = "오류: 턴 흐름 정보를 찾을 수 없습니다.";
    console.error("턴 흐름 정보를 찾을 수 없습니다. currentSet:", currentSetId, "currentTurn:", currentTurnNum);
    return;
  }

  const currentTurnFlow = lobbySetFlow[currentTurnNum - 1];

  // 내 진영 결정 (DB 기준 role 필드 사용)
  const myTeamRole = (myRole === 'HOST') ? data.A_role : data.B_role;
  const myTurn = myTeamRole === currentTurnFlow.side;

  // 먼저 UI에 정확한 현재 턴 문구를 찍음 (항상 bp.currentTurn 기준)
  const sideName = roleDisplay[currentTurnFlow.side] || currentTurnFlow.side;
  const actionText = currentTurnFlow.action === 'ban' ? '밴' : currentTurnFlow.action === 'pick' ? '픽' : currentTurnFlow.action;
  const targetText = roleDisplay[currentTurnFlow.target] || currentTurnFlow.target;

  let turnText;
  if (currentTurnFlow.action === 'ready') {
    turnText = `[${currentTurnNum}턴] ${sideName}: 적성(인격) 설정`;
  } else {
    turnText = `[${currentTurnNum}턴] ${sideName}: ${targetText} ${actionText} ${currentTurnFlow.count}개 선택`;
  }
  document.getElementById("turnInfo").innerText = turnText;



  // renderDraftPhaseTurn 내부, currentTurnFlow 정의 직후에 추가
  const startTime = (data.bpState && data.bpState.timerStart) ? data.bpState.timerStart : null;
  startTimer(currentTurnFlow, currentTurnFlow.time, startTime);

  // 카드 렌더링: renderCards는 maxCount와 myTurn을 받아 내부에서 finish 버튼 상태를 결정
  renderCards(
    currentTurnFlow.target,
    currentTurnFlow.count,
    myTurn,
    currentTurnFlow.action
  );
}

function updateDraftPhaseUI(data) {
  const turnInfoEl = document.getElementById("turnInfo");

  if (!data) return;
  const bp = data.bpState || {};
  const currentSetId = data.currentSet || 1;
  const currentTurnNum = (typeof bp.currentTurn === 'number' && bp.currentTurn > 0) ? bp.currentTurn : 0;

  // 방어: currentTurn이 0이면 턴 흐름을 시도하지 않음(아직 시작 전)
  if (currentTurnNum === 0) {
    document.getElementById("turnInfo").innerText = "대기 중...";
    return;
  }

  const lobbySetFlow = setFlows[currentSetId];
  if (!lobbySetFlow || !lobbySetFlow[currentTurnNum - 1]) {
    document.getElementById("turnInfo").innerText = "오류: 턴 흐름 정보를 찾을 수 없습니다.";
    console.error("턴 흐름 정보를 찾을 수 없습니다. currentSet:", currentSetId, "currentTurn:", currentTurnNum);
    return;
  }

  const currentTurnFlow = lobbySetFlow[currentTurnNum - 1];
  const myTeamRole = (myRole === 'HOST') ? data.A_role : data.B_role;
  const myTurn = myTeamRole === currentTurnFlow.side;

  // 1. 턴 설명 문구 업데이트
  const sideName = roleDisplay[currentTurnFlow.side] || currentTurnFlow.side;
  const actionText = currentTurnFlow.action === 'ban' ? '밴' : currentTurnFlow.action === 'pick' ? '픽' : currentTurnFlow.action;
  const targetText = roleDisplay[currentTurnFlow.target] || currentTurnFlow.target;

  let turnText;
  if (currentTurnFlow.action === 'ready') {
    turnText = `[${currentTurnNum}턴] ${sideName}: 적성(인격) 설정`;
  } else {
    turnText = `[${currentTurnNum}턴] ${sideName}: ${targetText} ${actionText} ${currentTurnFlow.count}개 선택`;
  }
  document.getElementById("turnInfo").innerText = turnText;


  turnInfoEl.innerText = turnText;

  // 버튼 활성화/비활성화:
  const finishBtn = document.getElementById("finishTurnBtn");
  if (finishBtn) finishBtn.disabled = !myTurn;

  // 3. 타이머 시작 
  if (timerInterval) clearInterval(timerInterval);
  const startTime = bp.timerStart || null;
  startTimer(currentTurnFlow, currentTurnFlow.time, startTime);


  renderCards(
    currentTurnFlow.target,
    currentTurnFlow.count,
    myTurn,                 // 이 myTurn 값이 finishTurn의 로직과 일치해야 합니다.
    currentTurnFlow.action
  );
}

// B팀 팀장 [준비 완료] 토글
async function toggleReady() {
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  const docSnap = await getDoc(lobbyRef);
  if (!docSnap.exists()) return;

  const isReady = docSnap.data().players[myUserId].isReady;

  await updateDoc(lobbyRef, {
    [`players.${myUserId}.isReady`]: !isReady
  });
}

// B팀 팀장/관전자 [나가기]
async function leaveLobby() {
  if (!currentLobbyId || !myUserId) return;

  if (unsubscribeLobby) unsubscribeLobby();
  unsubscribeLobby = null;

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);

  // DB에서 자신의 플레이어 정보 삭제
  await updateDoc(lobbyRef, {
    [`players.${myUserId}`]: deleteField()
  });

  resetSession();
}

// 상시 표시 [방 종료] 버튼 (Host 전용/모두 강제 종료)
async function endCurrentSession() {
  if (!currentLobbyId) return;

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);

  if (myRole === 'HOST') {
    const confirmDelete = confirm("정말로 방을 종료하고 모든 참여자를 강제 퇴장시키겠습니까?");
    if (confirmDelete) {
      try {
        // 1) 먼저 리스너 해제(호스트 자신이 이미 리스너를 가지고 있다면)
        if (unsubscribeLobby) {
          try { unsubscribeLobby(); } catch (e) { /* ignore */ }
          unsubscribeLobby = null;
        }

        // 2) 로비 문서 삭제
        await deleteDoc(lobbyRef);

        // 3) 삭제 성공 시 즉시 세션 초기화 (호스트도 바로 초기 화면으로)
        resetSession();

      } catch (err) {
        console.error("로비 종료 실패:", err);
        alert("로비 종료 중 오류가 발생했습니다: " + (err.message || err));
      }
    }
  } else {
    // B팀/관전자는 [나가기]와 동일한 기능
    await leaveLobby();
  }
}

// 세션 초기화 (맨 처음 화면으로)
function resetSession() {
  // 1) 실시간 리스너 해제
  if (unsubscribeLobby) {
    try { unsubscribeLobby(); } catch (e) { /* ignore */ }
    unsubscribeLobby = null;
  }

  // 2) 전역 상태 초기화
  currentLobbyId = null;
  myRole = null;
  myUserId = myUserId || null; // 인증은 유지하되 사용자 id는 그대로 둠
  playerRole = null;
  // 밴픽 관련 전역 변수 초기화 (필요 시 더 추가)
  globalBan = null;
  bannedSurvivors = [];
  bannedHunters = [];
  currentSet = 1;
  currentMap = 1;
  currentSetPicked = { survivor: [], hunter: [], bannedSurvivor: [], bannedHunter: [] };
  finalSurvivors = [];
  finalHunter = null;
  currentTurn = 0;

  // 3) UI 초기화: 모든 화면 요소를 기본 상태로 되돌림
  // 화면 전환
  updateUIScreen('onlineLobbyScreen');

  // 입력 그룹 및 버튼 복구
  const lobbyInputGroup = document.getElementById("lobbyInputGroup");
  const createBtn = document.getElementById("createLobbyBtn");
  const joinBtn = document.getElementById("joinLobbyBtn");
  if (lobbyInputGroup) lobbyInputGroup.style.display = '';
  if (createBtn) createBtn.style.display = '';
  if (joinBtn) joinBtn.style.display = '';

  // 숨김 처리
  const idsToHide = ['lobbyWaitScreen', 'playerListContainer', 'draftPhase', 'sessionStatusInfo', 'globalBanSelect', 'setSelect', 'mapSelect', 'roleSelect', 'customGlobalBan', 'endOptions'];
  idsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // 노출 처리
  const idsToShow = ['onlineLobbyScreen'];
  idsToShow.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });

  // 플레이어 목록 초기화
  const playerListDiv = document.getElementById("playerList");
  if (playerListDiv) playerListDiv.innerHTML = '';

  // 상태 표시 초기화
  const lobbyTitle = document.getElementById("lobbyTitle");
  if (lobbyTitle) lobbyTitle.innerText = '';

  const myRoleDisplay = document.getElementById("myRoleDisplay");
  if (myRoleDisplay) myRoleDisplay.innerText = '';

  const globalBanStatus = document.getElementById("globalBanStatus");
  if (globalBanStatus) globalBanStatus.innerText = '';

  // --- 라인업 관련 로컬 상태 초기화
  selectedThisTurn = [];
  finalSurvivors = [];
  finalHunter = null;
  currentSetPicked = {
    survivor: [],
    hunter: [],
    bannedSurvivor: [],
    bannedHunter: []
  };

  // --- 라인업 관련 DOM 초기화
  const currentSurvivorsEl = document.getElementById("currentSurvivors");
  if (currentSurvivorsEl) currentSurvivorsEl.innerHTML = '';

  const currentLineupEl = document.getElementById("currentLineup");
  if (currentLineupEl) currentLineupEl.classList.add('hidden');

  const finalSurvivorsEl = document.getElementById("finalSurvivors"); // 만약 존재하면
  if (finalSurvivorsEl) finalSurvivorsEl.innerHTML = '';

  const finalHunterEl = document.getElementById("finalHunter"); // 만약 존재하면
  if (finalHunterEl) finalHunterEl.innerHTML = '';


  // 상시 버튼 숨김
  const endMatchBtnPermanent = document.getElementById("endMatchBtnPermanent");
  if (endMatchBtnPermanent) endMatchBtnPermanent.classList.add('hidden');

  // 타이머/인터벌 정리
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }

  const lobbyInput = document.getElementById("lobbyInput");
  if (lobbyInput) lobbyInput.value = '';

  // --- 라인업 DOM 완전 초기화
  const finalContainer = document.getElementById("finalLineupContainer");
  if (finalContainer) finalContainer.remove();

  const currentSurvivorsEl2 = document.getElementById("currentSurvivors");
  if (currentSurvivorsEl2) currentSurvivorsEl2.innerHTML = '';

  const currentLineupEl2 = document.getElementById("currentLineup");
  if (currentLineupEl2) currentLineupEl2.classList.add('hidden');

  // 로그 초기화
  const logDiv = document.getElementById("log");
  if (logDiv) logDiv.innerHTML = '';

  // 마지막으로 UI 상태 동기화
  updateUIScreen('onlineLobbyScreen');
}


//=====================================================
// 밴픽 진행 동기화 및 권한 제어
//=====================================================

// 1. 글로벌 밴 선택 (방장 권한)
async function selectGlobalBan(status) {
  if (myRole !== 'HOST') return;

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);

  // DB에 글로벌 밴 상태 저장
  await updateDoc(lobbyRef, {
    globalBan: status
  });
  // UI 업데이트 (선택 버튼 하이라이트)
  document.getElementById("globalOnBtn").classList.toggle("selected", status);
  document.getElementById("globalOffBtn").classList.toggle("selected", !status);

  // ⭐ 핵심 수정: DB 업데이트 후 '다음' 버튼 활성화만 수행 (자동 진행 방지)
  document.getElementById("globalNextBtn").disabled = false;
}

// 2. 글로벌 밴 확정 (방장 권한)
async function confirmGlobalBan() {
  if (myRole !== 'HOST') return;

  // 1. ⭐⭐ 세트 관련 초기값 설정 (사용자 요청 반영) ⭐⭐
  const initialSetData = {
    // A. 'SET_SELECT' 단계로 전환
    status: 'SET_SELECT',
    // B. currentSet을 1로 초기화
    currentSet: 1,
    // C. 해당 세트의 픽/밴 현황 초기화
    currentSetPicked: {
      survivor: [],
      hunter: [],
      bannedSurvivor: [],
      bannedHunter: []
    },
    // D. 밴픽 시작 전에 맵/진영 정보는 아직 없으므로 null로 설정하거나 기존 필드를 제거/유지 (기존 DB 구조에 따름)
    currentMap: null,
    A_role: null,
    B_role: null
  };

  // 2. DB 업데이트: 상태 변경 및 세트 데이터 초기화
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  await updateDoc(lobbyRef, initialSetData);

  // 3. UI 업데이트: 세트 번호 선택 UI를 1세트로 초기화 (선택적)
  const setNumberEl = document.getElementById("setNumber");
  if (setNumberEl) {
    setNumberEl.value = 1;
  }
}

// 3. 맵 선택 (방장 권한)
async function goMapSelect() {
  if (myRole !== 'HOST') return;

  // 1. 현재 선택된 세트 번호를 가져와 DB에 업데이트 
  const setNumberEl = document.getElementById("setNumber");
  const selectedSet = parseInt(setNumberEl.value);

  // 2. DB 상태를 'MAP_SELECT'로 변경하고 현재 세트 번호를 업데이트
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  await updateDoc(lobbyRef, {
    status: 'MAP_SELECT', // MAP_SELECT로 정확히 상태를 변경
    currentMap: 0, // 맵 선택이 시작되므로 맵 번호 초기화
    currentSet: selectedSet
  });
}

async function chooseRole(role) {
  if (myRole === 'SPECTATOR') return;

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  const lobbySnapshot = await getDoc(lobbyRef);
  const lobbyData = lobbySnapshot.data();

  // 현재 플레이어의 역할 필드(A_role/B_role)와 상대방의 역할 필드 결정
  const teamRoleField = myRole === 'HOST' ? 'A_role' : 'B_role';
  const opponentRoleField = myRole === 'HOST' ? 'B_role' : 'A_role';

  // 1. 상대방이 이미 선택한 진영인지 확인 (상호 배제)
  // 상대방이 이미 이 진영을 선택했다면, 내 버튼이 비활성화되어 있어야 하지만, 
  // 혹시라도 선택 시도가 들어오면 DB 업데이트를 막습니다.
  if (lobbyData[opponentRoleField] === role) {
    return;
  }

  // 2. 토글 기능 구현: 내가 이미 해당 진영을 선택했고 다시 클릭한 경우 (선택 해제)
  if (lobbyData[teamRoleField] === role) {
    await updateDoc(lobbyRef, { [teamRoleField]: null });
    return;
  }

  // 3. 진영 선택: 새롭게 진영을 선택하고 DB 업데이트
  await updateDoc(lobbyRef, { [teamRoleField]: role });

  // 로컬 playerRole 업데이트 (기존 싱글모드 로직과의 호환성을 위해 유지)
  playerRole = role;
}

function updateRoleSelectionUI(lobbyData) {
  const A_role = lobbyData.A_role;
  const B_role = lobbyData.B_role;
  const allChosen = A_role && B_role;

  const isHost = myRole === 'HOST';

  const myTeamRole = isHost ? A_role : B_role;
  const opponentTeamRole = isHost ? B_role : A_role;

  const survivorBtn = document.getElementById("survivorRoleBtn");
  const hunterBtn = document.getElementById("hunterRoleBtn");
  const roleNextBtn = document.getElementById("roleNextBtn");

  if (!survivorBtn || !hunterBtn || !roleNextBtn) return;

  // 관전자는 버튼 비활성화
  if (myRole === 'SPECTATOR') {
    survivorBtn.disabled = true;
    hunterBtn.disabled = true;
  } else {
    // 1. 버튼 활성화/비활성화 (상대 팀 선택에 따른 상호 배제)
    survivorBtn.disabled = opponentTeamRole === 'survivor'; // 상대가 생존자 선택 시 비활성화
    hunterBtn.disabled = opponentTeamRole === 'hunter';     // 상대가 감시자 선택 시 비활성화
  }


  // 2. 버튼 하이라이트 (내가 선택한 진영 표시)
  survivorBtn.classList.toggle('selected', myTeamRole === 'survivor');
  hunterBtn.classList.toggle('selected', myTeamRole === 'hunter');


  // 3. 다음 버튼 제어 (방장에게만 노출, 두 팀 모두 선택 시 활성화)
  if (isHost) {
    roleNextBtn.classList.remove('hidden'); // 방장에게 노출
    roleNextBtn.disabled = !allChosen;     // 두 팀 모두 진영 선택 시 활성화
  } else {
    roleNextBtn.classList.add('hidden'); // 방장 외에는 숨김
  }
}

// 5. 진영 확정 
async function confirmRoleSelection() {
  if (myRole !== 'HOST') return;
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  const docSnap = await getDoc(lobbyRef);
  if (!docSnap.exists()) return;
  const data = docSnap.data();

  // 필수 조건: A_role 와 B_role 모두 선택되어야 함
  if (!data.A_role || !data.B_role) {
    alert("A팀과 B팀 모두 진영을 선택해야 합니다.");
    return;
  }

  const currentSet = data.currentSet || 1;
  // CUSTOM_BAN 호출 로직: currentSet > 1 이고 아직 customBanDone이 false 일때만 호출
  const customBanDone = data.bpState?.customBanDone || false;

  let nextStatus = 'BP_IN_PROGRESS';
  if (currentSet > 1 && !customBanDone) {
    nextStatus = 'CUSTOM_BAN';
  } else {
    nextStatus = 'BP_IN_PROGRESS';
  }

  // 모든 플레이어 준비 true (선택사항)
  const updatedPlayers = Object.fromEntries(
    Object.entries(data.players).map(([id, p]) => [id, { ...p, isReady: true }])
  );

  await updateDoc(lobbyRef, {
    players: updatedPlayers,
    status: nextStatus,
    'bpState.currentTurn': 0, // 다음 단계에서 1로 시작되게 안전히 0으로 둠
  });
}

// 6. 밴픽 시작 (방장 권한)
async function startDraftSetup() {
  if (myRole !== 'HOST') return;

  // 로비 상태를 'GLOBAL_BAN'으로 변경 (다른 플레이어에게 다음 단계로 넘어감을 알림)
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  await updateDoc(lobbyRef, {
    status: 'GLOBAL_BAN'
  });

  // ⭐ 방장 화면을 'globalBanSelect'으로 전환
  updateUIScreen('globalBanSelect');
}


// 7. 커스텀 글로벌 밴 확정 (HOST/B_PLAYER 권한)
async function confirmCustomBan() {
  if (myRole !== 'HOST') return; // 방장만 실행 가능

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  try {
    const docSnap = await getDoc(lobbyRef);
    if (!docSnap.exists()) {
      alert("로비가 존재하지 않습니다.");
      resetSession();
      return;
    }
    const data = docSnap.data();
    const bp = data.bpState || {};

    // 1) UI에서 실제 선택된 항목을 읽어오기 (프로젝트에 맞게 조정)
    const selectedSurvivors = Array.from(document.querySelectorAll('#customBanSurvivors .card.selected'))
      .map(el => el.dataset.charName).filter(Boolean);
    const selectedHunters = Array.from(document.querySelectorAll('#customBanHunters .card.selected'))
      .map(el => el.dataset.charName).filter(Boolean);


    // 2) 선택 개수 검증 (예: 생존자 3개, 감시자 1개)
    if (selectedSurvivors.length < 3 || selectedHunters.length < 1) {
      alert("지정된 개수만큼 선택되지 않았습니다. 생존자 3개, 감시자 1개를 선택하세요.");
      return;
    }

    // 3) 기존 DB 값과 병합
    const customBans = bp.customBans || { survivor: [], hunter: [] };
    const bannedS = bp.bannedSurvivors || [];
    const bannedH = bp.bannedHunters || [];


    // merged는 기존 밴 + 커스텀 + 이미 확정된 finalPicked 포함
    const finalPickedSurvivors = Array.isArray(bp.finalSurvivors) ? bp.finalSurvivors.map(x => x.name) : [];
    const finalPickedHunter = bp.finalHunter ? (bp.finalHunter.name ? bp.finalHunter.name : bp.finalHunter) : null;

    const mergedS = Array.from(new Set([...bannedS, ...customBans.survivor, ...finalPickedSurvivors, ...selectedSurvivors]));
    const mergedH = Array.from(new Set([...bannedH, ...customBans.hunter, ...(finalPickedHunter ? [finalPickedHunter] : []), ...selectedHunters]));


    // 중복 제거
    const finalBannedSurvivors = [...new Set(newBannedSurvivors)];
    const finalBannedHunters = [...new Set(newBannedHunters)];

    // 4) bpState 초기화 및 상태 전환 (한 번에 반영)
    const updateData = {
      status: 'BP_IN_PROGRESS',
      'bpState.currentTurn': 1,
      'bpState.timerStart': serverTimestamp(),
      'bpState.customBanDone': true,
      // 직접 배열로 덮어쓰는 방식: merged 배열을 그대로 저장
      'bpState.bannedSurvivors': mergedS,
      'bpState.bannedHunters': mergedH,
      // 초기화: 현재 세트 선택 결과 초기화
      'bpState.currentSetPicked': { survivor: [], hunter: [], bannedSurvivor: [], bannedHunter: [] },
      'bpState.finalSurvivors': [],
      'bpState.finalHunter': null
    };
    await updateDoc(lobbyRef, updateData);


    // 5) 로컬 상태 정리 및 알림
    selectedThisTurn = [];
    alert("커스텀 글로벌 밴이 확정되었습니다. 밴픽을 시작합니다.");
    // onSnapshot이 상태 변화를 받아 UI를 갱신합니다.


  } catch (err) {
    console.error("confirmCustomBan 실패:", err);
    alert("커스텀 글로벌 밴 확정 중 오류가 발생했습니다: " + (err.message || err));
  }

}


// 8. 턴 종료 (HOST/B_PLAYER 권한)
async function finishTurn(selectedChars) {
  if (!currentLobbyId) return;
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);

  try {
    // 1) 최신 로비 데이터 읽기
    const lobbySnap = await getDoc(lobbyRef);
    if (!lobbySnap.exists()) {
      alert("로비 데이터가 존재하지 않습니다.");
      resetSession();
      return;
    }
    const data = lobbySnap.data();

    // 2) currentSet / currentTurn 안전하게 가져오기
    const currentSet = (data.bpState && typeof data.bpState.currentSet === 'number') ? data.bpState.currentSet : (data.currentSet || 1);
    const currentTurn = (data.bpState && typeof data.bpState.currentTurn === 'number') ? data.bpState.currentTurn : 0;

    // 3) 현재 턴 유효성 검사
    const currentTurnIndex = Math.max(0, currentTurn - 1); // 1-based -> 0-based
    if (!setFlows || !setFlows[currentSet] || !setFlows[currentSet][currentTurnIndex]) {
      console.error("턴 흐름 정보를 찾을 수 없습니다. 턴을 종료할 수 없습니다.", { currentSet, currentTurn, setFlowsExists: !!(setFlows && setFlows[currentSet]) });
      alert("턴 흐름 정보를 찾을 수 없습니다. 관리자에게 문의하세요.");
      return;
    }
    const turn = setFlows[currentSet][currentTurnIndex];

    // 4) 권한 확인: 내 진영(A_role/B_role)과 턴 주체 비교
    const myTeamSide = (myRole === 'HOST') ? data.A_role : data.B_role;
    if (!myTeamSide) {
      console.warn("내 진영 정보가 없습니다. 잠시 후 다시 시도하세요.");
      return;
    }
    if (myTeamSide !== turn.side) {
      alert("현재는 상대방의 턴입니다.");
      return;
    }

    // 5) 선택값 확보
    if (!selectedChars || !Array.isArray(selectedChars) || selectedChars.length === 0) {
      selectedChars = selectedThisTurn || [];
    }

    // 6) 로그 항목 생성
    const displayText = (selectedChars.length > 0) ? selectedChars.map(c => c.name).join(", ") : ((turn.action === "ready") ? "설정 완료" : "(선택 없음)");
    const newLogEntry = `[${roleDisplay && roleDisplay[turn.side] ? roleDisplay[turn.side] : turn.side}] ${turn.action} → ${displayText}`;

    // 7) 다음 턴 / 세트 종료 판단
    const totalTurns = (setFlows[currentSet] && setFlows[currentSet].length) ? setFlows[currentSet].length : 0;
    const nextTurn = currentTurn + 1;
    let nextCurrentTurn = nextTurn;
    let newStatus = 'BP_IN_PROGRESS';
    let isSetEnd = false;

    if (nextTurn > totalTurns) {
      isSetEnd = true;
      newStatus = 'FINISHED';
      nextCurrentTurn = 0;
    } else {
      newStatus = 'BP_IN_PROGRESS';
      nextCurrentTurn = nextTurn;
    }

    // 8) DB에 반영할 updateData 객체 준비
    const updateData = {
      'status': newStatus,
      'bpState.currentTurn': nextCurrentTurn,
      'bpState.timerStart': serverTimestamp(),
      'log': arrayUnion(newLogEntry)
    };

    // 9) 밴/픽 결과 반영 (필드 경로 일관성 유지)
    if (turn.side === "survivor" && turn.action === "pick" && selectedChars.length > 0) {
      updateData['bpState.currentSetPicked.survivor'] = arrayUnion(...selectedChars.map(c => c.name));
      updateData['bpState.finalSurvivors'] = arrayUnion(...selectedChars.map(c => ({ name: c.name, img: c.img })));
    }
    if (turn.side === "hunter" && turn.action === "pick" && selectedChars.length > 0) {
      updateData['bpState.currentSetPicked.hunter'] = arrayUnion(...selectedChars.map(c => c.name));
      // finalHunter를 객체로 저장
      updateData['bpState.finalHunter'] = { name: selectedChars[0].name, img: selectedChars[0].img || null };
    }


    if (turn.side === "hunter" && turn.action === "ban" && selectedChars.length > 0) {
      updateData['bpState.currentSetPicked.bannedSurvivor'] = arrayUnion(...selectedChars.map(c => c.name));
    }
    if (turn.side === "survivor" && turn.action === "ban" && selectedChars.length > 0) {
      updateData['bpState.currentSetPicked.bannedHunter'] = arrayUnion(...selectedChars.map(c => c.name));
    }

    // 10) 세트 종료 시 글로벌 밴 누적 반영 (data.bpState 기준)
    if (isSetEnd && data.globalBan) {
      const currentPicked = (data.bpState && data.bpState.currentSetPicked) ? data.bpState.currentSetPicked : { survivor: [], hunter: [] };
      const bannedS = (data.bpState && data.bpState.bannedSurvivors) ? data.bpState.bannedSurvivors : [];
      const bannedH = (data.bpState && data.bpState.bannedHunters) ? data.bpState.bannedHunters : [];

      const newGlobalBanS = (currentPicked.survivor || []).slice(0, 3).filter(c => !bannedS.includes(c));
      const newGlobalBanH = (currentPicked.hunter || []).filter(c => !bannedH.includes(c));

      if (newGlobalBanS.length > 0) updateData['bpState.bannedSurvivors'] = arrayUnion(...newGlobalBanS);
      if (newGlobalBanH.length > 0) updateData['bpState.bannedHunters'] = arrayUnion(...newGlobalBanH);
    }

    // 11) 단일 updateDoc 호출로 원자성 보장
    await updateDoc(lobbyRef, updateData);

    // 12) 로컬 상태 정리: 선택 초기화 등
    selectedThisTurn = [];
    // onSnapshot 리스너가 모든 클라이언트 UI를 갱신함

  } catch (err) {
    console.error("턴 종료 처리 중 오류:", err);
    alert("턴 종료 중 오류가 발생했습니다: " + (err.message || err));
  }
}

// 9. 다음 세트 진행 (방장 권한)
async function nextSetSetup() {
  if (myRole !== 'HOST') return;

  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  const docSnap = await getDoc(lobbyRef);
  if (!docSnap.exists()) {
    alert("로비가 존재하지 않습니다.");
    return;
  }
  const data = docSnap.data();
  const currentSetLocal = data.currentSet || 1;
  if (currentSetLocal >= 5) {
    alert("최대 5세트까지 진행했습니다.");
    return;
  }


  // 다음 세트 정보 및 BP 상태 초기화
  const resetBpState = {
    currentSetPicked: { survivor: [], hunter: [], bannedSurvivor: [], bannedHunter: [] },
    finalSurvivors: [],
    finalHunter: null,
    currentTurn: 0,
    timerStart: 0,
  };

  const updateData = {
    status: 'SETUP', // 설정 대기 상태로 복귀
    currentSet: data.currentSet + 1,

    currentMap: 0, // 맵 선택을 위해 0으로 리셋
    // B팀 팀장만 준비 상태 해제
    [`players`]: Object.fromEntries(
      Object.entries(docSnap.data().players).map(([id, p]) => [
        id,
        { ...p, isReady: p.role === 'HOST' } // HOST만 true, 나머지는 false
      ])
    ),
    bpState: {
      ...bp,
      currentSetPicked: { survivor: [], hunter: [], bannedSurvivor: [], bannedHunter: [] },
      finalSurvivors: [],
      finalHunter: null,
      currentTurn: 0,
      timerStart: 0,
      ...docSnap.data().bpState, // 기존 글로벌 밴 유지
      ...resetBpState
    }
  };

  if (!data.globalBan) updateData['bpState.customBanDone'] = false;
  await updateDoc(lobbyRef, updateData);

  // 글로벌 밴 ON 상태일 경우, 이전 맵 기록
  if (globalBan) {
    updateData.bannedMaps = arrayUnion(currentMap);
  }

  await updateDoc(lobbyRef, updateData);

  const bp = data.bpState || {};
  if (data.globalBan) {
    const prevFinal = bp.finalSurvivors || []; // 객체 배열 [{name,img},...]
    const prevHunter = bp.finalHunter ? [bp.finalHunter.name] : [];
    const bannedS = bp.bannedSurvivors || [];
    const bannedH = bp.bannedHunters || [];

    const finalNames = prevFinal.map(x => x.name);
    const mergedS = Array.from(new Set([...bannedS, ...finalNames]));
    const mergedH = Array.from(new Set([...bannedH, ...prevHunter]));
    // updateDoc로 병합 반영
  }

}

// 10. `endMatch`를 `resetSession`으로 대체

// 11. 밴픽 흐름 제어 (기존 함수 재정의 필요)
// 밴픽이 로컬에서 진행되지 않고 DB 동기화로 진행되므로, 기존의 startTurn 함수는 DB 업데이트를 기반으로 카드 렌더링만 수행하도록 수정되어야 합니다.

function startTurn() {
  // 이 함수는 이제 DB 리스너가 호출해야 함
  clearInterval(timerId);
  selectedThisTurn = [];
  document.getElementById("finishTurnBtn").disabled = true;

  let flow = setFlows[currentSet];
  if (currentTurn >= flow.length) {
    showEndOptions();
    return;
  }

  let turn = flow[currentTurn];
  // **권한 확인:** 현재 턴의 진영이 내 진영과 일치하는 경우에만 상호작용 가능
  const myTurn = roleDisplay[turn.side] === (playerRole === 'survivor' ? '생존자' : '감시자');

  if (myTurn) {
    // 타이머 시작 (DB 동기화에 따라 타이머 시작)
  } else {
    // 타이머 표시만
  }

  document.getElementById("turnInfo").innerText = `[${roleDisplay[turn.side]}] ${turn.target} ${turn.action} ${turn.count > 0 ? turn.count + "개" : ""}`;
  renderCards(turn.target, turn.count, myTurn, turn.action);
}

// 12. `renderCards` 재정의 

function renderCards(target, maxCount, myTurn, action) {
  const listDiv = document.getElementById("cardList");
  if (!listDiv) return;

  // 초기화
  listDiv.innerHTML = "";

  // trait/ready 같은 특수 턴 처리: 카드 영역 숨김, 완료 버튼 비활성화
  const isTraitTurn = (action === "ready" || action === "trait");
  const finishBtn = document.getElementById("finishTurnBtn");
  if (isTraitTurn) {
    listDiv.style.display = "none";
    if (finishBtn) finishBtn.disabled = !myTurn; // 내 턴일 때만 활성화(필요시)
    return;
  } else {
    listDiv.style.display = "flex";
  }

  // pool 정의: target에 따라 survivors 또는 hunters 사용 (항상 정의되도록)
  const pool = (target === "survivor") ? (Array.isArray(survivors) ? survivors : []) : (Array.isArray(hunters) ? hunters : []);

  // 전역/세트 기준으로 이미 밴/픽된 항목 가져오기(방어적)
  const picked = currentSetPicked || { survivor: [], hunter: [], bannedSurvivor: [], bannedHunter: [] };
  const globalBannedS = Array.isArray(bannedSurvivors) ? bannedSurvivors : [];
  const globalBannedH = Array.isArray(bannedHunters) ? bannedHunters : [];

  // helper: 현재 선택 배열을 이름 배열로 유지
  if (!Array.isArray(selectedThisTurn)) selectedThisTurn = [];

  // 클릭 후 로컬 selectedThisTurn 업데이트 직후에 추가
  const names = selectedThisTurn.map(s => s.name);
  debounceSendPending(names, 500);

  // 초기 finish 버튼 상태: 내 턴이 아니면 비활성화, 내 턴이면 선택 개수 검사
  if (finishBtn) finishBtn.disabled = !myTurn || (selectedThisTurn.length !== maxCount);

  pool.forEach(c => {
    // 방어: c가 유효한 객체인지 확인
    if (!c || !c.name) return;

    const container = document.createElement("div");
    container.className = "card-container";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<img src="${c.img || ''}"><span>${c.name}</span>`;

    // 긴 이름 처리(기존 스타일 유지)
    const span = div.querySelector("span");
    if (span && c.name && c.name.length > 8) span.classList.add("long-name");

    // 상태 판정: 글로벌 밴 / 이번 세트에서 밴된 항목 / 이번 세트에서 픽된 항목
    const isGlobalBanned = (target === "survivor" && globalBannedS.includes(c.name)) ||
      (target === "hunter" && globalBannedH.includes(c.name));
    const isPickedThisSet = (target === "survivor" && (picked.survivor || []).includes(c.name)) ||
      (target === "hunter" && (picked.hunter || []).includes(c.name));
    const isBannedThisSet = (target === "survivor" && (picked.bannedSurvivor || []).includes(c.name)) ||
      (target === "hunter" && (picked.bannedHunter || []).includes(c.name));

    if (isGlobalBanned) {
      div.classList.add("globalBanned");
    } else if (isBannedThisSet) {
      div.classList.add("banned");
      const banMark = document.createElement("span");
      banMark.className = "card-ban";
      banMark.textContent = "✖";
      div.appendChild(banMark);
    } else if (isPickedThisSet) {
      div.classList.add("picked");
    }

    // DB/로컬 기준으로 이미 선택된 경우 표시
    if (selectedThisTurn.some(s => s.name === c.name)) {
      div.classList.add("selected");
    }

    // 클릭 가능 여부: 내 턴이고, 해당 카드가 선택/밴/픽 불가 상태가 아닐 때만
    const clickable = myTurn && !isGlobalBanned && !isBannedThisSet && !isPickedThisSet;
    if (clickable) {
      div.style.cursor = "pointer";
      div.addEventListener("click", () => {
        const already = div.classList.contains("selected");
        if (already) {
          div.classList.remove("selected");
          selectedThisTurn = selectedThisTurn.filter(x => x.name !== c.name);
        } else {
          // maxCount 검사 (0이면 제한 없음)
          if (maxCount !== 0 && selectedThisTurn.length >= maxCount) return;
          div.classList.add("selected");
          selectedThisTurn.push({ name: c.name, img: c.img });
        }
        // 항상 finish 버튼 상태 재계산
        if (finishBtn) finishBtn.disabled = !myTurn || (selectedThisTurn.length !== maxCount);
      });
    } else {
      div.style.cursor = "default";
    }

    container.appendChild(div);
    listDiv.appendChild(container);
  });
}




// 14. 이벤트 리스너 연결 (기존 HTML에 있는 인라인 이벤트 제거 예정)
// 맵 선택, 진영 선택, 글로벌 밴 선택은 모두 권한 검사 및 DB 업데이트가 추가된 새 함수로 대체되었습니다.

const mapNames = {
  // index 0은 비워둠 (맵 번호가 1부터 시작)
  0: '선택 안됨',
  1: '군수공장',
  2: '붉은성당',
  3: '성심병원',
  4: '호수마을',
  5: '달빛강공원',
  6: '레오의기억',
  7: '에버슬리핑타운',
  8: '차이나타운',
  9: '돌아올 수 없는 숲'
};

function getMapNameById(id) {
  return mapNames[id] || '알 수 없는 맵';
}

// 샘플 캐릭터
let survivors = [
  { name: "의사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s1.jpg" },
  { name: "변호사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s2.jpg" },
  { name: "도둑", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s3.jpg" },
  { name: "정원사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s4.jpg" },
  { name: "마술사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s5.jpg" },
  { name: "모험가", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s6.jpg" },
  { name: "용병", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s7.jpg" },
  { name: "공군", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s8.jpg" },
  { name: "샤먼", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s9.jpg" },
  { name: "기계공", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s10.jpg" },
  { name: "포워드", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s11.jpg" },
  { name: "맹인", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s12.jpg" },
  { name: "조향사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s13.jpg" },
  { name: "카우보이", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s14.jpg" },
  { name: "무희", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s15.jpg" },
  { name: "선지자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s16.jpg" },
  { name: "납관사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s17.jpg" },
  { name: "탐사원", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s18.jpg" },
  { name: "주술사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s19.jpg" },
  { name: "야만인", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s20.jpg" },
  { name: "곡예사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s21.jpg" },
  { name: "항해사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s22.jpg" },
  { name: "바텐더", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s23.jpg" },
  { name: "우편 배달부", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s24.jpg" },
  { name: "묘지기", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s25.jpg" },
  { name: "죄수", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s26.jpg" },
  { name: "곤충학자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s27.jpg" },
  { name: "화가", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s28.jpg" },
  { name: "타자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s29.jpg" },
  { name: "장난감 상인", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s30.jpg" },
  { name: "환자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s31.jpg" },
  { name: "'심리학자'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s32.jpg" },
  { name: "소설가", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s33.jpg" },
  { name: "'여자아이'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s34.jpg" },
  { name: "우는 광대", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s35.jpg" },
  { name: "교수", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s36.jpg" },
  { name: "골동품 상인", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s37.jpg" },
  { name: "작곡가", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s38.jpg" },
  { name: "기자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s39.jpg" },
  { name: "항공 전문가", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s40.jpg" },
  { name: "치어리더", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s41.jpg" },
  { name: "인형사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s42.jpg" },
  { name: "화재조사관", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s43.jpg" },
  { name: "'파로 부인'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s44.jpg" },
  { name: "'기사'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s45.jpg" },
  { name: "기상학자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s46.jpg" },
  { name: "궁수", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s47.jpg" },
  { name: "'탈출 마스터'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s48.jpg" },
  { name: "환등사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s50.jpg" },
  { name: "행운아", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/s49.jpg" },
];

let hunters = [
  { name: "공장장", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h1.jpg" },
  { name: "광대", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h2.jpg" },
  { name: "사냥터지기", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h3.jpg" },
  { name: "리퍼", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h4.jpg" },
  { name: "거미", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h5.jpg" },
  { name: "붉은 나비", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h6.jpg" },
  { name: "우산의 영혼", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h7.jpg" },
  { name: "사진사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h8.png" },
  { name: "광기의 눈", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h9.png" },
  { name: "노란 옷의 왕", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h10.png" },
  { name: "꿈의 마녀", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h11.jpg" },
  { name: "울보", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h12.jpg" },
  { name: "재앙의 도마뱀", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h13.jpg" },
  { name: "블러디 퀸", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h14.jpg" },
  { name: "수위 26호", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h15.jpg" },
  { name: "'사도'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h16.jpg" },
  { name: "바이올리니스트", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h17.png" },
  { name: "조각가", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h18.jpg" },
  { name: "'박사'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h19.jpg" },
  { name: "파멸의 바퀴", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h20.jpg" },
  { name: "나이아스", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h21.jpg" },
  { name: "밀랍인형사", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h22.jpg" },
  { name: "'악몽'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h23.jpg" },
  { name: "서기관", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h24.jpg" },
  { name: "은둔자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h25.jpg" },
  { name: "나이트 워치", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h26.jpg" },
  { name: "오페라 가수", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h27.jpg" },
  { name: "'파이라이트'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h28.jpg" },
  { name: "시공의 그림자", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h29.jpg" },
  { name: "''절름발이 판''", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h30.jpg" },
  { name: "'훌라발루'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h31.jpg" },
  { name: "잡화상", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h32.jpg" },
  { name: "'당구 선수'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h33.jpg" },
  { name: "'여왕벌'", img: "https://raw.githubusercontent.com/Nicholas-Olsen/idv-Ban-Pick-Simulator/main/images/h34.jpg" }
];

// 세트별 밴픽 순서 (1세트 예시)
let setFlows = {};

for (let i = 1; i <= 5; i++) {
  setFlows[i] = [
    { side: "hunter", action: "ban", target: "survivor", count: 2, time: 40 },
  ];

  // 새로 추가되는 부분
  if (i === 2) {
    setFlows[i].push({ side: "survivor", action: "ban", target: "hunter", count: 1, time: 40 }); // 2세트: 1개, 60초
  } else if (i >= 3) {
    setFlows[i].push({ side: "survivor", action: "ban", target: "hunter", count: 2, time: 40 }); // 3~5세트: 2개, 60초
  }

  setFlows[i].push(
    { side: "survivor", action: "pick", target: "survivor", count: 2, time: 45 },
    { side: "hunter", action: "ban", target: "survivor", count: 1, time: 25 },
    { side: "survivor", action: "pick", target: "survivor", count: 1, time: 25 },
    { side: "hunter", action: "ban", target: "survivor", count: 1, time: 25 },
    { side: "survivor", action: "pick", target: "survivor", count: 1, time: 25 },
    { side: "survivor", action: "ready", target: "trait", count: 0, time: 60 },
    { side: "hunter", action: "pick", target: "hunter", count: 1, time: 30 }
  );
}

const roleDisplay = {
  hunter: "감시자",
  survivor: "생존자"
};


async function goRoleSelect() {
  if (myRole !== 'HOST') return; // 방장만 가능

  const mapNumberEl = document.getElementById("mapNumber");
  const selectedMap = parseInt(mapNumberEl.value);

  // 맵 선택 유효성 검사
  if (selectedMap === 0 || isNaN(selectedMap)) {
    alert("맵을 선택해주세요.");
    return;
  }

  // DB 상태를 'ROLE_SELECT'로 변경하고 선택된 맵 번호를 업데이트
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  await updateDoc(lobbyRef, {
    status: 'ROLE_SELECT', // ⭐ 다음 단계인 진영 선택으로 상태 변경
    currentMap: selectedMap // ⭐ 선택된 맵 번호를 DB에 저장
  });
  // 이후 UI 전환 및 정보 업데이트는 handleLobbyState가 처리합니다.
}


function updateCurrentLineup(data) { // ✅ data 인자 추가
  const lineupContainer = document.getElementById("currentLineup");
  const container = document.getElementById("currentSurvivors");
  container.innerHTML = "";

  // ✅ DB 데이터 사용
  const finalSurvivors = data.bpState?.finalSurvivors || [];

  // 중복 제거 (기존 로직 유지)
  const uniqueSurvivors = Array.from(new Set(finalSurvivors.map(c => c.name)))
    .map(name => finalSurvivors.find(c => c.name === name));

  if (uniqueSurvivors.length > 0) {
    lineupContainer.classList.remove('hidden'); // ✅ 생존자가 1명이라도 픽되면 보이게 함
  } else {
    lineupContainer.classList.add('hidden'); // ✅ 픽된 생존자가 없으면 숨김
  }

  uniqueSurvivors.slice(0, 4).forEach(c => {
    let div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<img src="${c.img}"><span>${c.name}</span>`;
    container.appendChild(div);
  });
}

let customBanDone = false; // ✅ 첫 세트에서만 커스텀 밴 진행 여부

function renderLog(data) {
  const logDiv = document.getElementById("log");
  if (!logDiv) return;
  logDiv.innerHTML = ''; // 매번 새로 렌더

  const logs = data.log || [];
  // 각 로그 항목을 순서대로 세로 나열
  logs.forEach(entry => {
    const p = document.createElement('div');
    p.className = 'log-entry';
    p.innerText = entry;
    logDiv.appendChild(p);
  });

  // 스크롤을 맨 아래로
  logDiv.scrollTop = logDiv.scrollHeight;
}


function updateCustomGlobalLabels(arg) {
  // arg가 숫자(세트 번호)이면 세트 기준으로 계산, 객체({survivor, hunter})이면 그대로 사용
  let survivorCount = 0;
  let hunterCount = 0;

  if (typeof arg === 'number') {
    survivorCount = (arg - 1) * 4;
    hunterCount = (arg - 1) * 1;
  } else if (arg && typeof arg === 'object') {
    // arg가 targets 객체일 경우
    survivorCount = Number(arg.survivor) || 0;
    hunterCount = Number(arg.hunter) || 0;
  } else {
    // 기본: 전역 currentSet 사용
    survivorCount = (currentSet - 1) * 4;
    hunterCount = (currentSet - 1) * 1;
  }

  const sEl = document.getElementById("survivorLabel");
  const hEl = document.getElementById("hunterLabel");
  if (sEl) sEl.innerText = `생존자 : ${survivorCount}개`;
  if (hEl) hEl.innerText = `감시자 : ${hunterCount}개`;

  // 내부 목표값도 업데이트(로컬 비교용)
  customBanTargets = { survivor: survivorCount, hunter: hunterCount };
}

function updateCustomBanUI(data) {
  if (myRole !== 'HOST') return;

  const bp = data.bpState || {};
  const customBans = bp.customBans || { survivor: [], hunter: [] };

  const currentSetNum = data.currentSet || 1;
  const requiredSurvivors = Math.max(0, (currentSetNum - 1) * 3);
  const requiredHunters = Math.max(0, (currentSetNum - 1) * 1);

  const isOk = (customBans.survivor.length === requiredSurvivors) && (customBans.hunter.length === requiredHunters);

  const btn = document.getElementById("confirmCustomBanBtn");
  if (btn) btn.disabled = !isOk;
}


function startCustomGlobalBan(data) {
  const currentSetNum = data?.currentSet || currentSet || 1;

  // 로컬 선택 초기화
  selectedCustomBan = { survivor: [], hunter: [] };

  // 레이블 및 내부 목표값 업데이트 (계산은 여기서만 수행)
  updateCustomGlobalLabels(currentSetNum);

  // 카드 렌더 및 버튼 상태 동기화
  renderCustomBanCards('survivor', data);
  renderCustomBanCards('hunter', data);

  // DB 기준으로 버튼 상태 갱신
  updateCustomBanUI(data);
}



// 커스텀 글로벌 밴 단계 카드 렌더링
function renderCustomBanCards(target, data) {
  const container = document.getElementById(target === "survivor" ? "customBanSurvivors" : "customBanHunters");
  container.innerHTML = "";
  const pool = target === "survivor" ? survivors : hunters;

  // ✅ DB에 저장된 선택 목록 가져오기
  const selectedOnDB = data.bpState?.customBans?.[target] || [];
  const customBanTargets = {
    survivor: (data.currentSet - 1) * 3,
    hunter: (data.currentSet - 1) * 1
  };



  pool.forEach(c => {
    let div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<img src="${c.img}"><span>${c.name}</span>`;

    // 🔹 특정 이름 카드에만 클래스 추가
    if (c.name === "바이올리니스트") {
      div.querySelector("span").classList.add("long-name");
    }

    // ✅ DB 데이터 기준으로 'selected' 클래스 부여
    if (selectedOnDB.includes(c.name)) {
      div.classList.add('selected');
    }

    // ✅ 방장에게만 클릭 이벤트 부여
    if (myRole === 'HOST') {
      div.onclick = async () => {
        const bp = data.bpState || {};
        const currentList = bp.customBans?.[target] || [];
        const maxCount = (data.currentSet - 1) * (target === 'survivor' ? 3 : 1);

        const lobbyRef = doc(db, 'lobbies', currentLobbyId);
        const currentlySelected = div.classList.contains('selected');


        if (currentlySelected) {
          await updateDoc(lobbyRef, {
            [`bpState.customBans.${target}`]: arrayRemove(c.name)
          });

          try {
            const latestSnap = await getDoc(lobbyRef);
            if (latestSnap.exists()) {
              updateCustomBanUI(latestSnap.data());
            }
          } catch (e) {
            console.warn('custom ban 최신 상태 조회 실패', e);
          }

        } else {
          if (currentList.length >= maxCount) return; // ✅ 초과 선택 방지
          await updateDoc(lobbyRef, {
            [`bpState.customBans.${target}`]: arrayUnion(c.name)
          });
        }
        // DB 업데이트 후 최신 상태로 버튼 갱신
        try {
          const latestSnap = await getDoc(lobbyRef);
          if (latestSnap.exists()) {
            updateCustomBanUI(latestSnap.data());
          }
        } catch (e) {
          console.warn('custom ban 최신 상태 조회 실패', e);
        }


      };
    }

    container.appendChild(div);
  });

}



function updateSetMapInfo() {
  const infoDiv = document.getElementById("setMapInfo");
  if (playerRole && currentSet && currentMap) {
    infoDiv.innerText = `선택 진영: ${playerRole} | 세트: ${currentSet} | 맵: ${mapNames[currentMap]}`;
  } else {
    infoDiv.innerText = "";
  }
}

/**
 * [수정된 타이머 함수]
 * DB에 기록된 timeStart를 기준으로 모든 클라이언트에서 동일한 남은 시간을 계산하여 표시합니다.
 * @param {number} duration - 현재 턴의 총 시간 (초 단위)
 * @param {object} sta
 * rtTime - 파이어베이스 serverTimestamp로 기록된 시간 객체
 */



function startTimer(turnObj, duration, startTime) {
  // turnObj: setFlows[currentSet][currentTurn-1] 형태의 턴 객체 (또는 null)
  if (!document.getElementById("turnInfo")) return;

  if (timerInterval) clearInterval(timerInterval);

  const timeStarted = startTime && startTime.seconds ? startTime.seconds * 1000 : Date.now();

  const updateTimer = () => {
    const elapsed = Math.floor((Date.now() - timeStarted) / 1000);
    timeLeft = Math.max(0, duration - elapsed);

    // dbTurnObj로 현재 턴 정보를 전달
    updateTimerDisplay(turnObj, timeLeft);

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      try {
        handleTimeout();
      } catch (e) {
        console.warn('handleTimeout 호출 실패', e);
      }
    }
  };

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// 자동 타임아웃 처리: 권한 검사 후 DB에 다음 턴 반영 및 자동 선택/밴 처리
async function handleTimeout() {
  if (!currentLobbyId) return;
  const lobbyRef = doc(db, 'lobbies', currentLobbyId);
  try {
    const snap = await getDoc(lobbyRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const bp = data.bpState || {};
    const currentSetId = data.currentSet || 1;
    const currentTurnNum = (typeof bp.currentTurn === 'number' && bp.currentTurn > 0) ? bp.currentTurn : 0;
    if (currentTurnNum === 0) return;

    const flow = setFlows[currentSetId];
    if (!flow || !flow[currentTurnNum - 1]) return;
    const turn = flow[currentTurnNum - 1];

    // 권한 확인: 현재 클라이언트가 해당 턴 주체인지 또는 HOST인지 확인
    const myTeamSide = (myRole === 'HOST') ? data.A_role : data.B_role;
    const isTurnOwner = (myTeamSide === turn.side);
    // Host도 자동 처리 시도 가능 (중앙 권한)
    if (!isTurnOwner && myRole !== 'HOST') return;

    // 자동 처리 로직
    const updateData = {
      'bpState.timerStart': serverTimestamp()
    };

    // 기본 로그 텍스트
    let autoLogText = '';

    if (turn.action === 'ban') {
      // 밴 단계: 타임아웃이면 '선택 없음' 처리 (다음 턴으로 넘어감)
      autoLogText = `[${roleDisplay[turn.side]}] ${turn.action} → (선택 없음)`;
      // 다음 턴 계산은 기존 finishTurn 로직과 동일하게 처리: 여기서는 단순히 currentTurn++ 처리
      const totalTurns = (setFlows[currentSetId] && setFlows[currentSetId].length) ? setFlows[currentSetId].length : 0;
      const nextTurn = currentTurnNum + 1;
      if (nextTurn > totalTurns) {
        updateData['status'] = 'FINISHED';
        updateData['bpState.currentTurn'] = 0;
      } else {
        updateData['bpState.currentTurn'] = nextTurn;
      }
      updateData['log'] = arrayUnion(autoLogText);
      await updateDoc(lobbyRef, updateData);
      return;
    }

    if (turn.action === 'pick') {
      // 픽 단계: 자동 선택 (선택 가능한 목록의 첫 번째)
      const pool = (turn.target === 'survivor') ? (data.bpState?.bannedSurvivors ? survivors.filter(s => !data.bpState.bannedSurvivors.includes(s.name)) : survivors) : (data.bpState?.bannedHunters ? hunters.filter(h => !data.bpState.bannedHunters.includes(h.name)) : hunters);
      // 제외: 이미 픽/밴된 것들 (currentSetPicked, banned lists)
      const pickedThisSet = data.bpState?.currentSetPicked || { survivor: [], hunter: [], bannedSurvivor: [], bannedHunter: [] };
      const excluded = new Set([...(pickedThisSet.survivor || []), ...(pickedThisSet.hunter || []), ...(pickedThisSet.bannedSurvivor || []), ...(pickedThisSet.bannedHunter || []), ...(data.bpState?.bannedSurvivors || []), ...(data.bpState?.bannedHunters || [])]);
      const candidates = pool.filter(c => !excluded.has(c.name));
      if (candidates.length === 0) {
        // 선택 불가: (선택 없음) 처리
        autoLogText = `[${roleDisplay[turn.side]}] ${turn.action} → (선택 없음)`;
      } else {
        const pick = candidates[0];
        // DB에 픽 반영: currentSetPicked 및 finalSurvivors/finalHunter 등
        if (turn.target === 'survivor') {
          updateData['bpState.currentSetPicked.survivor'] = arrayUnion(pick.name);
          updateData['bpState.finalSurvivors'] = arrayUnion({ name: pick.name, img: pick.img });
        } else {
          updateData['bpState.currentSetPicked.hunter'] = arrayUnion(pick.name);
          updateData['bpState.finalHunter'] = { name: pick.name, img: pick.img || null };
        }

        autoLogText = `[${roleDisplay[turn.side]}] ${turn.action} → ${pick.name}`;
      }

      // 다음 턴 계산
      const totalTurns = (setFlows[currentSetId] && setFlows[currentSetId].length) ? setFlows[currentSetId].length : 0;
      const nextTurn = currentTurnNum + 1;
      if (nextTurn > totalTurns) {
        updateData['status'] = 'FINISHED';
        updateData['bpState.currentTurn'] = 0;
      } else {
        updateData['bpState.currentTurn'] = nextTurn;
      }
      updateData['bpState.timerStart'] = serverTimestamp();
      updateData['log'] = arrayUnion(autoLogText);
      await updateDoc(lobbyRef, updateData);
      return;
    }

    // 기타(ready 등)는 단순 다음 턴 처리
    {
      const totalTurns = (setFlows[currentSetId] && setFlows[currentSetId].length) ? setFlows[currentSetId].length : 0;
      const nextTurn = currentTurnNum + 1;
      if (nextTurn > totalTurns) {
        updateData['status'] = 'FINISHED';
        updateData['bpState.currentTurn'] = 0;
      } else {
        updateData['bpState.currentTurn'] = nextTurn;
      }
      updateData['log'] = arrayUnion(`[${roleDisplay[turn.side]}] ${turn.action} → (타임아웃)`);
      await updateDoc(lobbyRef, updateData);
    }

  } catch (err) {
    console.error('handleTimeout 실패', err);
  }
}


function updateTimerDisplay(dbTurnObj = null, remainingSeconds = null) {
  // 턴 결정: 인자 우선, 없으면 전역 setFlows/currentSet/currentTurn 사용
  let turn = null;
  if (dbTurnObj && dbTurnObj.side) {
    turn = dbTurnObj;
  } else {
    try {
      if (setFlows && setFlows[currentSet] && typeof currentTurn === 'number' && setFlows[currentSet][currentTurn]) {
        turn = setFlows[currentSet][currentTurn];
      }
    } catch (e) {
      turn = null;
    }
  }
  let secondsText;
  if (typeof remainingSeconds === 'number' && remainingSeconds >= 0) {
    secondsText = `${Math.max(0, remainingSeconds)}`;
  } else if (typeof timeLeft === 'number') {
    secondsText = `${Math.max(0, timeLeft)}`;
  } else {
    secondsText = `-`;
  }

  const turnInfoEl = document.getElementById("turnInfo");
  if (!turnInfoEl) return;

  if (!turn) {
    turnInfoEl.innerText = `진행중인 턴 정보 없음 | 남은 시간: ${secondsText}`;
    return;
  }

  const sideLabel = roleDisplay[turn.side] || turn.side || "알 수 없음";
  const targetLabel = roleDisplay[turn.target] || turn.target || "";
  const actionLabel = turn.action || "";
  const countLabel = turn.count > 0 ? `${turn.count}개` : "";
  // [${roleDisplay[turn.side]}] ${roleDisplay[turn.target] || turn.target} ${turn.action} ${turn.count > 0 ? turn.count + "개" : ""} | 남은 시간: ${timeLeft}초; }

  // 기존 양식 그대로 유지
  turnInfoEl.innerText = `[${sideLabel}] ${targetLabel} ${actionLabel} ${countLabel} | 남은 시간: ${secondsText}초`;

  // 선택적으로 별도 timerDisplay 요소가 있으면 그것도 갱신
  const timerElement = document.getElementById("timerDisplay");
  if (timerElement) timerElement.innerText = `남은 시간: ${secondsText}`;
}


function showFinalLineup() {
  // 카드 선택 화면 숨기기
  document.getElementById("draftPhase").classList.add("hidden");

  // 기존 finalLineupContainer 제거 (중복 방지)
  const existing = document.querySelector('.finalLineupContainer');
  if (existing) existing.remove();

  // 로그에 히스토리 추가
  const logDiv = document.getElementById("log");
  logDiv.innerHTML += `<h2>밴픽 로그</h2>`;

  // 최종 라인업 컨테이너 생성
  const container = document.createElement("div");
  container.className = "finalLineupContainer";
  container.id = "finalLineupContainer";  // ⭐ id 부여
  container.innerHTML = "<h2>최종 라인업</h2>";

  const lineupDiv = document.createElement("div");
  lineupDiv.className = "finalLineup";


  // 생존자 4명
  finalSurvivors.slice(0, 4).forEach(c => {
    let div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<img src="${c.img}"><span>${c.name}</span>`;
    lineupDiv.appendChild(div);
  });

  // 간격
  let spacer = document.createElement("div");
  spacer.style.width = "20px";
  lineupDiv.appendChild(spacer);

  // 감시자
  if (finalHunter && finalHunter.name) {
    let div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<img src="${finalHunter.img || ''}"><span>${finalHunter.name}</span>`;
    lineupDiv.appendChild(div);
  }


  container.appendChild(lineupDiv);

  // ⭐ log 바깥 → body 맨 아래에 붙임
  document.body.appendChild(container);

  // 종료/다음 세트 옵션 표시
  showEndOptions();
}


function showEndOptions() {
  const endDiv = document.getElementById("endOptions");
  endDiv.classList.remove("hidden");

  if (globalBan) {
    // ON이면 두 버튼 활성
    document.getElementById("nextSetBtn").style.display = "inline-block";
    document.getElementById("endMatchBtn").style.display = "inline-block";
  } else {
    // OFF이면 종료 버튼만
    document.getElementById("nextSetBtn").style.display = "none";
    document.getElementById("endMatchBtn").style.display = "inline-block";
  }
}



//=====================================================
// 이벤트 리스너 연결 (모듈 스코프 해결)
//=====================================================

// 모든 DOM 요소가 로드된 후 이벤트 리스너를 안전하게 연결합니다.
document.addEventListener('DOMContentLoaded', () => {
  // 1. 로비 버튼
  document.getElementById("createLobbyBtn").addEventListener('click', createLobby);
  document.getElementById("joinLobbyBtn").addEventListener('click', joinLobby);

  console.log('DOMContentLoaded - attaching listeners, myUserId:', myUserId);
  const createBtn = document.getElementById("createLobbyBtn");
  console.log('createLobbyBtn exists?', !!createBtn);
  if (createBtn) createBtn.addEventListener('click', createLobby);


  // 2. 로비 대기 버튼
  // HTML에 해당 ID가 있는지 확인하고 연결합니다.
  const endMatchBtn = document.getElementById("endMatchBtnPermanent");
  if (endMatchBtn) endMatchBtn.addEventListener('click', endCurrentSession);

  const readyBtn = document.getElementById("readyBtn");
  if (readyBtn) readyBtn.addEventListener('click', toggleReady);

  const leaveLobbyBtn = document.getElementById("leaveLobbyBtn");
  if (leaveLobbyBtn) leaveLobbyBtn.addEventListener('click', leaveLobby);

  const startDraftBtn = document.getElementById("startDraftBtn");
  if (startDraftBtn) startDraftBtn.addEventListener('click', startDraftSetup);

  // DOMContentLoaded 또는 초기 이벤트 바인딩 섹션에 추가
  const changeRoleBtn = document.getElementById("changeRoleBtn");
  if (changeRoleBtn) {
    changeRoleBtn.addEventListener('click', toggleRole);
  }

  // 3. 글로벌 밴 선택 (방장)
  const globalOnBtn = document.getElementById("globalOnBtn");
  if (globalOnBtn) globalOnBtn.addEventListener('click', () => selectGlobalBan(true));

  const globalOffBtn = document.getElementById("globalOffBtn");
  if (globalOffBtn) globalOffBtn.addEventListener('click', () => selectGlobalBan(false));

  const globalNextBtn = document.getElementById("globalNextBtn");
  if (globalNextBtn) globalNextBtn.addEventListener('click', confirmGlobalBan);

  const setgoNextBtn = document.getElementById("setgoNextBtn");
  if (setgoNextBtn) setgoNextBtn.addEventListener('click', goMapSelect);

  // 4. 맵 선택 (방장)
  const mapgoNextBtn = document.getElementById("mapgoNextBtn");
  if (mapgoNextBtn) mapgoNextBtn.addEventListener('click', goRoleSelect);

  // 5. 진영 선택 (B팀 팀장)
  const survivorRoleBtn = document.getElementById("survivorRoleBtn");
  if (survivorRoleBtn) survivorRoleBtn.addEventListener('click', () => chooseRole('survivor'));

  const hunterRoleBtn = document.getElementById("hunterRoleBtn");
  if (hunterRoleBtn) hunterRoleBtn.addEventListener('click', () => chooseRole('hunter'));

  const roleNextBtn = document.getElementById("roleNextBtn");
  if (roleNextBtn) {
    roleNextBtn.addEventListener("click", async () => {
      if (myRole !== 'HOST') return;

      // 진영 선택 결과 저장
      await confirmRoleSelection();

      // 밴픽 단계로 넘어갈지, 커스텀 글로벌 밴을 먼저 할지 판단
      const lobbyRef = doc(db, 'lobbies', currentLobbyId);
      const docSnap = await getDoc(lobbyRef);
      if (!docSnap.exists()) return;
      const data = docSnap.data();

      const currentSet = data.currentSet || 1;
      const customBanDone = data.bpState?.customBanDone || false;

      let nextStatus = 'BP_IN_PROGRESS';

      // 커스텀 글로벌 밴 조건: 1세트가 아니고, 아직 한 번도 안 했을 때
      if (currentSet > 1 && !customBanDone) {
        nextStatus = 'CUSTOM_BAN';
      }

      const updateData = {
        status: nextStatus
      };

      // 커스텀 밴을 건너뛴 경우: 바로 턴 시작
      if (nextStatus === 'BP_IN_PROGRESS') {
        updateData['bpState.currentTurn'] = 1;
        updateData['bpState.timerStart'] = serverTimestamp();
      }

      await updateDoc(lobbyRef, updateData);
    });
  }

  // 6. 커스텀 밴
  const confirmCustomBanBtn = document.getElementById("confirmCustomBanBtn");
  if (confirmCustomBanBtn) confirmCustomBanBtn.addEventListener('click', confirmCustomBan);

  // 7. 세트 종료 후
  const nextSetBtn = document.getElementById("nextSetBtn");
  if (nextSetBtn) nextSetBtn.addEventListener('click', nextSetSetup);

  // (선택사항) 밴픽 진행 버튼
  const finishTurnBtn = document.getElementById("finishTurnBtn");
  if (finishTurnBtn) finishTurnBtn.addEventListener('click', () => finishTurn(selectedThisTurn));

});
