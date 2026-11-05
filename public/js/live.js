/**
 * Sàn Quẩy Vũ Trường 3D - Live Controller & WebSocket Client
 * - Tự động co giãn 9:16 (1080x1920) chuẩn OBS Studio
 * - Tích hợp Three.js 3D Engine: Sàn nhảy 4x4 neon, nhân vật Mascot 3D đứng vững trên ô gạch
 * - Camera lia góc động theo đếm ngược 12s hoặc khi tặng 🌹 CAMERA
 * - Xử lý sự kiện: CƯỠI RỒNG KIM LONG, HÓA KHỔNG LỒ, SÀN CHÁY (Fever Mode)
 * - Tích hợp giọng đọc ZeroTTS xướng tên đại gia và hệ thống âm thanh EDM Web Audio
 */
import { Club3DEngine } from './club3d.js';

(function () {
  'use strict';

  // 1. Kiểm tra tham số ?obs=1 để bật chế độ OBS Studio sạch (ẩn thanh dock điều khiển)
  const urlParams = new URLSearchParams(window.location.search);
  const isObsMode = urlParams.get('obs') === '1' || urlParams.get('obs') === 'true';
  if (isObsMode) {
    document.body.classList.add('obs-mode');
  }

  // 2. Tự động co giãn khung hình 9:16
  const stage = document.getElementById('stage9x16');
  const stageWrapper = document.getElementById('stageWrapper');

  function resizeStage() {
    if (!stage || !stageWrapper) return;
    const availWidth = stageWrapper.clientWidth;
    const availHeight = stageWrapper.clientHeight;
    const scale = Math.min(availWidth / 1080, availHeight / 1920);
    stage.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', resizeStage);
  resizeStage();

  // 3. Khởi tạo Three.js 3D Nightclub Engine
  const webglContainer = document.getElementById('webglContainer');
  let club3d = null;
  const zoomTimerVal = document.getElementById('zoomTimerVal');

  if (webglContainer) {
    try {
      club3d = new Club3DEngine(webglContainer);
      club3d.onZoomCountdownUpdate = (seconds) => {
        if (zoomTimerVal) zoomTimerVal.textContent = seconds;
      };
      console.log('[Three.js] Khởi tạo sàn quẩy 3D thành công!');
    } catch (err) {
      console.error('[Three.js Error] Không khởi tạo được WebGL:', err);
    }
  }

  // 4. Khởi tạo 2D FX Particle Engine cho Confetti & Pháo hoa
  const canvas = document.getElementById('clubCanvas');
  let particleEngine = null;
  if (canvas && window.ClubParticleEngine) {
    particleEngine = new window.ClubParticleEngine(canvas);
  }

  // 5. Các phần tử DOM chính
  const topDancerCount = document.getElementById('topDancerCount');
  const tickerText = document.getElementById('tickerText');
  const topDaigiaList = document.getElementById('topDaigiaList');
  const dragonRideOverlay = document.getElementById('dragonRideOverlay');
  const dragonCrownUser = document.getElementById('dragonCrownUser');
  const feverBanner = document.getElementById('feverBanner');
  const heatRatioText = document.getElementById('heatRatioText');
  const heatBarFill = document.getElementById('heatBarFill');
  const eventFeed = document.getElementById('eventFeed');

  // 6. Kết nối WebSocket (/ws)
  let ws = null;
  let wsRetryTimer = null;

  function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Đã kết nối sàn quẩy vũ trường 3D!');
    };

    ws.onclose = () => {
      console.warn('[WebSocket] Mất kết nối, tự kết nối lại sau 2.5s...');
      clearTimeout(wsRetryTimer);
      wsRetryTimer = setTimeout(connectWs, 2500);
    };

    ws.onerror = (err) => {
      console.warn('[WebSocket Error]', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (_) {}
    };
  }

  function handleWsMessage(msg) {
    if (!msg) return;

    if (msg.method === 'bar.state' || msg.method === 'fishing.state') {
      updatePublicState(msg.params);
    } else if (msg.method === 'bar.event' || msg.method === 'fishing.event') {
      const eventData = msg.params?.event;
      if (eventData) {
        handleClubEvent(eventData);
      }
      if (msg.params?.state) {
        updatePublicState(msg.params.state);
      }
    }
  }

  // 7. Cập nhật giao diện từ State
  let lastFeverState = false;

  function updatePublicState(st) {
    if (!st) return;

    const club = st.club || {};
    if (topDancerCount) topDancerCount.textContent = club.totalDancers ?? 32;
    if (tickerText && club.lastJoinUser) {
      tickerText.textContent = `${club.lastJoinUser} lên sàn 🏃`;
    }

    // Cập nhật thanh Nhiệt Sàn
    const heat = club.heat ?? 0;
    const maxHeat = club.maxHeat ?? 200;
    if (heatRatioText) heatRatioText.textContent = `${heat} / ${maxHeat}`;
    if (heatBarFill) {
      const pct = Math.min(100, Math.max(0, (heat / maxHeat) * 100));
      heatBarFill.style.width = `${pct}%`;
    }

    // Hiệu ứng Sàn Cháy (Fever Mode)
    const isFever = !!club.feverMode;
    if (isFever !== lastFeverState) {
      lastFeverState = isFever;
      if (isFever) {
        feverBanner?.classList.add('active');
        particleEngine?.setFever(true);
        if (club3d) club3d.feverActive = true;
        window.ClubAudio?.playFeverDrop();
      } else {
        feverBanner?.classList.remove('active');
        particleEngine?.setFever(false);
        if (club3d) club3d.feverActive = false;
      }
    }

    // Cập nhật Top Đại Gia
    if (topDaigiaList && Array.isArray(st.topVip)) {
      renderTopDaigia(st.topVip);
    }

    // Đồng bộ danh sách nhân vật 3D trên sàn gạch
    if (club3d && Array.isArray(st.dancers)) {
      club3d.syncDancers(st.dancers);
    }
  }

  function renderTopDaigia(vipList) {
    if (!topDaigiaList) return;
    topDaigiaList.innerHTML = '';
    const medals = ['daigia-rank-1', 'daigia-rank-2', 'daigia-rank-3'];
    const realVips = Array.isArray(vipList) ? vipList.filter((item) => (item.coinsTotal || 0) > 0) : [];

    if (realVips.length === 0) {
      topDaigiaList.innerHTML = `
        <div class="daigia-empty-state">
          <span>Chờ đại gia lên sàn...</span>
        </div>
      `;
      return;
    }

    realVips.slice(0, 3).forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'daigia-item';
      row.innerHTML = `
        <div class="daigia-left">
          <span class="daigia-rank-icon ${medals[idx] || 'daigia-rank-3'}">${idx + 1}</span>
          <span class="daigia-name" title="${item.name}">${item.name}</span>
        </div>
        <span class="daigia-coins">${Number(item.coinsTotal || 0).toLocaleString()}</span>
      `;
      topDaigiaList.appendChild(row);
    });
  }

  // 8. Xử lý các sự kiện tương tác
  let dragonTimer = null;

  function handleClubEvent(ev) {
    appendEventFeed(ev);
    const audio = window.ClubAudio;

    switch (ev.type) {
      // 1. Khách lên sàn
      case 'joinFloor':
        if (tickerText) tickerText.textContent = `${ev.user} lên sàn 🏃`;
        particleEngine?.addSparkles?.(30);
        break;

      // 2. Thả tim tăng nhiệt
      case 'addHeat':
        if (ev.triggeredFever) {
          feverBanner?.classList.add('active');
          particleEngine?.setFever(true);
          if (club3d) club3d.feverActive = true;
          audio?.playFeverDrop();
        }
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;

      // 3. Đổi điệu nhảy
      case 'danceMove':
        audio?.playLaser();
        if (club3d && ev.uniqueId && club3d.dancersMap.has(ev.uniqueId)) {
          const dancerObj = club3d.dancersMap.get(ev.uniqueId);
          dancerObj.danceMove = ev.move;
        }
        break;

      // 4. Sự kiện Tặng Quà
      case 'gift':
        // Lia & Zoom camera trực tiếp vào nhân vật vừa donate
        if (club3d && ev.giftType !== 'dragon_ride') {
          club3d.zoomToDonor(ev.uniqueId || ev.user);
        }

        // CƯỠI RỒNG KIM LONG
        if (ev.giftType === 'dragon_ride') {
          if (dragonRideOverlay) {
            if (dragonCrownUser) dragonCrownUser.textContent = `VUA - ${ev.user}`;
            dragonRideOverlay.classList.add('active');
            clearTimeout(dragonTimer);
            dragonTimer = setTimeout(() => {
              dragonRideOverlay.classList.remove('active');
            }, 9000);
          }
          if (club3d) club3d.triggerDragonRide(ev.user);
          audio?.playDragonFanfare();
          particleEngine?.addConfetti?.(120);
          particleEngine?.addFireworks?.(540, 500);
        }
        // CAMERA: Lia góc nhìn camera 3D ngay lập tức
        else if (ev.giftType === 'camera') {
          if (club3d) club3d.nextCameraPreset();
          audio?.playLaser();
          particleEngine?.addConfetti?.(25);
        }
        // KHỔNG LỒ: Hóa to nhân vật trong không gian 3D
        else if (ev.giftType === 'giant') {
          if (club3d && ev.uniqueId && club3d.dancersMap.has(ev.uniqueId)) {
            club3d.dancersMap.get(ev.uniqueId).isGiant = true;
          }
          audio?.playAirHorn();
          particleEngine?.addConfetti?.(60);
        }
        // PHÁO HOA
        else if (ev.giftType === 'fireworks') {
          particleEngine?.addFireworks?.(350, 480);
          particleEngine?.addFireworks?.(720, 480);
          audio?.playAirHorn();
        }
        // BONG BÓNG
        else if (ev.giftType === 'bubbles') {
          particleEngine?.addBubbles?.(50);
          audio?.playLaser();
        }
        // CÁC QUÀ KHÁC
        else {
          audio?.playAirHorn();
          particleEngine?.addConfetti?.(45);
        }

        // Phát giọng đọc ZeroTTS xướng tên đại gia
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;
    }
  }

  function appendEventFeed(ev) {
    if (!eventFeed) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    if (ev.type === 'gift') {
      item.innerHTML = `<strong>[${timeStr}] 🎁 ${ev.user}</strong> tặng <strong>${ev.giftName}</strong> (${ev.coins} xu)`;
    } else if (ev.type === 'addHeat') {
      item.innerHTML = `<strong>[${timeStr}] ❤️ ${ev.user}</strong> thả tim (+${ev.count} nhiệt)`;
    } else if (ev.type === 'danceMove') {
      item.innerHTML = `<strong>[${timeStr}] 💃 ${ev.user}</strong> nhảy điệu <strong>${ev.move}</strong>`;
    } else {
      item.innerHTML = `<strong>[${timeStr}] 🏃 ${ev.user}</strong> đã lên sàn`;
    }
    eventFeed.prepend(item);
    if (eventFeed.children.length > 25) {
      eventFeed.removeChild(eventFeed.lastChild);
    }
  }

  // 9. Đăng ký các nút bấm tương tác & RPC
  async function callRpc(method, params = {}) {
    try {
      const res = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        })
      });
      return await res.json();
    } catch (e) {
      console.warn('[RPC Error]', e.message);
      return null;
    }
  }

  function getDancerInputName() {
    const input = document.getElementById('inputDancerName');
    return input?.value?.trim() || 'Khách thứ 20';
  }

  // Nút Lia Góc Camera 3D
  const btnSwitchCam = document.getElementById('btnSwitchCam');
  if (btnSwitchCam) {
    btnSwitchCam.addEventListener('click', () => {
      window.ClubAudio?.ensureContext();
      if (club3d) club3d.nextCameraPreset();
    });
  }

  // Bấm vào danh sách quà ở sidebar để test nhanh
  document.querySelectorAll('.gift-menu-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      window.ClubAudio?.ensureContext();
      const giftKey = pill.getAttribute('data-gift');
      const user = getDancerInputName();

      if (giftKey === 'camera') {
        if (club3d) club3d.nextCameraPreset();
      }

      const coins = giftKey === 'dragon_ride' ? 199 : giftKey === 'king' ? 500 : 20;
      callRpc('bar.gift', { user, giftName: pill.textContent.trim(), coins });
    });
  });

  // Nút Quick Dock
  document.getElementById('btnRpcJoin')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.joinFloor', { user });
  });

  document.getElementById('btnRpcHeat')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.addHeat', { user, count: 15 });
  });

  document.getElementById('btnRpcHiphop')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.danceMove', { user, move: 'hiphop' });
  });

  document.getElementById('btnRpcHeadspin')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.danceMove', { user, move: 'spin' });
  });

  document.getElementById('btnRpcGiant')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.gift', { user, giftName: 'Khổng Lồ', coins: 40 });
  });

  document.getElementById('btnRpcDj')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.gift', { user, giftName: 'Lên DJ', coins: 50 });
  });

  document.getElementById('btnRpcDragon')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.gift', { user, giftName: 'Cưỡi Rồng Kim Long', coins: 199 });
  });

  document.getElementById('btnRpcFever')?.addEventListener('click', () => {
    window.ClubAudio?.ensureContext();
    const user = getDancerInputName();
    callRpc('bar.addHeat', { user, count: 150 });
  });

  document.getElementById('btnRpcReset')?.addEventListener('click', async () => {
    window.ClubAudio?.ensureContext();
    await callRpc('bar.resetState', {});
  });

  // Điều khiển âm thanh
  const btnUnlockAudio = document.getElementById('btnUnlockAudio');
  if (btnUnlockAudio) {
    btnUnlockAudio.addEventListener('click', () => {
      window.ClubAudio?.ensureContext();
      btnUnlockAudio.textContent = '✅ Đã Bật Âm Nhạc & Giọng Đọc';
      btnUnlockAudio.classList.remove('gold');
    });
  }

  const btnToggleMusic = document.getElementById('btnToggleMusic');
  if (btnToggleMusic) {
    btnToggleMusic.addEventListener('click', () => {
      const audio = window.ClubAudio;
      if (!audio) return;
      audio.ensureContext();
      audio.bgMusicEnabled = !audio.bgMusicEnabled;
      if (audio.bgMusicEnabled) {
        audio.startClubBeat();
        btnToggleMusic.textContent = '🎵 Nhạc EDM: BẬT';
      } else {
        audio.stopClubBeat();
        btnToggleMusic.textContent = '🎵 Nhạc EDM: TẮT';
      }
    });
  }

  const btnToggleTts = document.getElementById('btnToggleTts');
  if (btnToggleTts) {
    btnToggleTts.addEventListener('click', () => {
      const audio = window.ClubAudio;
      if (!audio) return;
      audio.ttsEnabled = !audio.ttsEnabled;
      btnToggleTts.textContent = audio.ttsEnabled ? '🎙️ Giọng Đọc: BẬT' : '🎙️ Giọng Đọc: TẮT';
    });
  }

  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol) {
    sliderMusicVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valMusicVol) valMusicVol.textContent = `${val}%`;
      window.ClubAudio?.setMusicVolume(val / 100);
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol) {
    sliderTtsVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valTtsVol) valTtsVol.textContent = `${val}%`;
      window.ClubAudio?.setTtsVolume(val / 100);
    });
  }

  // Kết nối TikTok Live
  const btnConnectTikTok = document.getElementById('btnConnectTikTok');
  const inputTikTokUser = document.getElementById('inputTikTokUser');
  if (btnConnectTikTok) {
    btnConnectTikTok.addEventListener('click', async () => {
      const username = inputTikTokUser?.value?.trim();
      if (!username) return alert('Vui lòng nhập @username TikTok Live');
      btnConnectTikTok.textContent = 'Đang kết nối...';
      btnConnectTikTok.disabled = true;
      try {
        await callRpc('bar.connectTikTok', { username });
      } finally {
        btnConnectTikTok.textContent = 'Kết Nối';
        btnConnectTikTok.disabled = false;
      }
    });
  }

  // Tự động giả lập
  let autoSimActive = false;
  const btnToggleAutoSim = document.getElementById('btnToggleAutoSim');
  if (btnToggleAutoSim) {
    btnToggleAutoSim.addEventListener('click', async () => {
      autoSimActive = !autoSimActive;
      if (autoSimActive) {
        await callRpc('bar.startAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: BẬT';
        btnToggleAutoSim.classList.add('gold');
      } else {
        await callRpc('bar.stopAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: TẮT';
        btnToggleAutoSim.classList.remove('gold');
      }
    });
  }

  // Lấy state ban đầu ngay lập tức để render sàn 3D mà không cần chờ WebSocket handshake
  fetch('/api/state')
    .then((r) => r.json())
    .then((st) => updatePublicState(st))
    .catch((err) => console.warn('[Init State Error]', err));

  // Khởi động kết nối
  connectWs();
})();
