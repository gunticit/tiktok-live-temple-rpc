const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

// Bắt lỗi toàn cục để tránh sập server khi WebSocket hoặc kết nối bên ngoài bị ngắt đột ngột
process.on('uncaughtException', (err) => {
  console.warn('[Process UncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Process UnhandledRejection]', reason?.message || reason);
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'club-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. DANH MỤC ĐIỆU NHẢY & QUÀ TẶNG VŨ TRƯỜNG (DANCE MOVES & GIFTS)
// ============================================================================
const DANCE_MOVES = [
  { id: 'nhay_tu_do', name: 'Nhảy Tự Do', keyword: 'nhảy' },
  { id: 'hiphop', name: 'Hiphop B-Boy', keyword: 'hiphop' },
  { id: 'xoay_dau', name: 'Xoay Đầu (Headspin)', keyword: 'xoay đầu' },
  { id: 'lon_vong', name: 'Nhào Lộn', keyword: 'lộn' },
  { id: 'catwalk', name: 'Catwalk Siêu Mẫu', keyword: 'catwalk' },
  { id: 'robot', name: 'Robot Dance', keyword: 'robot' },
  { id: 'wave', name: 'Lượn Sóng (Body Wave)', keyword: 'lượn sóng' },
  { id: 'shuffle', name: 'Shuffle Dance', keyword: 'shuffle' },
  { id: 'breakdance', name: 'Breakdance Đỉnh Cao', keyword: 'breakdance' },
  { id: 'moonwalk', name: 'Moonwalk Huyền Thoại', keyword: 'moonwalk' }
];

const GIFT_CONFIGS = {
  // Quà nhỏ 1-4 xu
  camera: { name: 'Camera', minCoins: 1, type: 'camera', label: '🌹 CAMERA SOI CẬN CẢNH' },
  swap: { name: 'Đổi Nhân Vật', minCoins: 1, type: 'swap', label: '🎵 ĐỔI NHÂN VẬT' },
  dance_once: { name: 'Nhảy 1 Cái', minCoins: 2, type: 'dance_once', label: '👯 NHẢY SOLO' },
  // Quà vừa 5-49 xu
  catwalk: { name: 'Catwalk', minCoins: 5, type: 'catwalk', label: '💃 CATWALK THẢM ĐỎ' },
  fireworks: { name: 'Pháo Hoa', minCoins: 10, type: 'fireworks', label: '🎆 PHÁO HOA RỰC SÀN' },
  bubbles: { name: 'Mưa Bong Bóng', minCoins: 20, type: 'bubbles', label: '🫧 MƯA BONG BÓNG' },
  couple: { name: 'Ghép Đôi', minCoins: 30, type: 'couple', label: '👩‍❤️‍👨 GHÉP ĐÔI TÌNH TỨ' },
  giant: { name: 'Khổng Lồ', minCoins: 40, type: 'giant', label: '🦾 HÓA KHỔNG LỒ' },
  // Quà lớn 50-198 xu
  dj_booth: { name: 'Lên DJ', minCoins: 50, type: 'dj_booth', label: '🎧 LÊN BỤC DJ QUẨY' },
  rocket: { name: 'Tên Lửa', minCoins: 100, type: 'rocket', label: '🚀 PHÓNG TÊN LỬA' },
  golden_duck: { name: 'Vịt Vàng', minCoins: 150, type: 'golden_duck', label: '🦆 VỊT VÀNG SIÊU CẤP' },
  // Quà siêu cấp >= 199 xu
  dragon_ride: { name: 'Cưỡi Rồng', minCoins: 199, type: 'dragon_ride', label: '🐉 ĐẠI GIA CƯỠI RỒNG' },
  king: { name: 'Vua Sàn Quẩy', minCoins: 500, type: 'king', label: '👑 VUA VŨ TRƯỜNG' }
};

// ============================================================================
// 2. QUẢN LÝ TIẾN TRÌNH ZEROTTS (WORKER DAEMON)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    this.startWorker();
  }

  resolvePythonBin() {
    const venvPy = path.join(__dirname, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    try {
      this.proc = spawn(pyBin, [scriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.proc.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString('utf8');
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleWorkerLine(line.trim());
        }
      });

      this.proc.stderr.on('data', (chunk) => {
        const msg = chunk.toString('utf8').trim();
        if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
      });

      this.proc.on('exit', (code) => {
        console.warn(`[ZeroTTS] Worker thoát với mã ${code}`);
        this.ready = false;
        this.status = 'stopped';
        for (const [, item] of this.pending) {
          clearTimeout(item.timer);
          item.resolve({ ok: false, error: 'ZeroTTS worker exited' });
        }
        this.pending.clear();
      });

      this.proc.on('error', (err) => {
        console.warn('[ZeroTTS Spawn Error]', err.message);
      });
    } catch (e) {
      console.warn('[ZeroTTS] Không khởi chạy được:', e.message);
    }
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'maichi';
        this.voices = msg.voices || ['maichi'];
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] Sẵn sàng! Giọng: ${this.voice}`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          pending.resolve({
            ok: true,
            url: `/data/tts-cache/${msg.filename}`,
            duration: msg.duration,
            elapsed: msg.elapsed,
            cached: !!msg.cached,
            voice: msg.voice || this.voice
          });
        }
      } else if (msg.type === 'error') {
        console.warn(`[ZeroTTS Error] ${msg.error}`);
        if (msg.id != null) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.id);
            pending.resolve({ ok: false, error: msg.error });
          }
        }
      }
    } catch (_) {}
  }

  synthesize(text, voice = 'maichi') {
    const clean = String(text || '').trim();
    if (!clean) return Promise.resolve({ ok: false, error: 'Nội dung rỗng' });

    if (!this.ready || !this.proc || this.proc.killed) {
      return Promise.resolve({
        ok: false,
        error: `ZeroTTS chưa sẵn sàng (trạng thái: ${this.status})`
      });
    }

    const id = ++this.reqCounter;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS timeout (18s)' });
      }, 18000);

      this.pending.set(id, { resolve, timer });
      try {
        this.proc.stdin.write(
          JSON.stringify({
            cmd: 'synth',
            id,
            text: clean,
            voice: voice || this.voice
          }) + '\n'
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: err.message });
      }
    });
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      voice: this.voice,
      voices: this.voices,
      model: this.model,
      pendingCount: this.pending.size
    };
  }
}

// ============================================================================
// 3. TRẠNG THÁI SÀN NHẢY & TOP ĐẠI GIA (MẶC ĐỊNH CHỈ 1 NHÂN VẬT KHỞI ĐỘNG)
// ============================================================================
const DEFAULT_STATE = {
  club: {
    totalDancers: 1,
    maxFloorCapacity: 1000,
    heat: 0,
    maxHeat: 200,
    feverMode: false,
    feverEndsAt: 0,
    currentTrack: 'Festival Euphoria',
    djName: 'Bạch Tuộc DJ',
    lastJoinUser: 'Dân Chơi Khởi Động'
  },
  dancers: {
    starter_dancer: {
      name: 'Dân Chơi Khởi Động',
      uniqueId: 'starter_dancer',
      avatar: '',
      slotIndex: 0,
      mascotId: 1,
      coinsTotal: 0,
      likesContributed: 0,
      danceMove: 'bounce',
      title: 'Dân Chơi Vũ Trường 🕺',
      isGiant: false,
      isRidingDragon: false,
      joinedAt: 1793885000000,
      lastActive: 1793885000000
    }
  },
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    autoSim: false,
    autoSimIntervalMs: 6500
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'zenfacts_vn',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function calculateDancerTitle(coinsTotal) {
  if (coinsTotal >= 1000) return 'Đại Gia Bao Sàn 👑';
  if (coinsTotal >= 300) return 'Thiếu Gia Sàn Nhảy 💎';
  if (coinsTotal >= 50) return 'Dân Chơi Phố Đi Bộ 🕶️';
  return 'Khách VIP 🕺';
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Dọn dẹp dancers: Chỉ giữ người có xu thực tế (> 0) hoặc starter_dancer duy nhất
      const filteredDancers = {};
      let hasRealDancers = false;
      if (saved.dancers) {
        for (const [k, d] of Object.entries(saved.dancers)) {
          if ((d.coinsTotal || 0) > 0) {
            filteredDancers[k] = d;
            hasRealDancers = true;
          }
        }
      }
      if (!hasRealDancers) {
        filteredDancers.starter_dancer = { ...DEFAULT_STATE.dancers.starter_dancer, joinedAt: Date.now(), lastActive: Date.now() };
      }
      return {
        ...DEFAULT_STATE,
        club: {
          ...DEFAULT_STATE.club,
          ...(saved.club || {}),
          totalDancers: Object.keys(filteredDancers).length,
          lastJoinUser: hasRealDancers ? (saved.club?.lastJoinUser || 'Khách VIP') : 'Dân Chơi Khởi Động'
        },
        dancers: filteredDancers,
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được club-state.json, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      club: state.club,
      dancers: state.dancers,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  }, 1200);
}

function getLeaderboard(limit = 3) {
  return Object.values(state.dancers)
    .filter((d) => (d.coinsTotal || 0) > 0) // Chỉ đại gia có xu / quà thật
    .sort((a, b) => (b.coinsTotal || 0) - (a.coinsTotal || 0) || (b.likesContributed || 0) - (a.likesContributed || 0))
    .slice(0, limit)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      uniqueId: d.uniqueId,
      avatar: d.avatar || '',
      coinsTotal: d.coinsTotal || 0,
      title: d.title || 'Đại Gia Sàn Quẩy',
      mascotId: d.mascotId || 1
    }));
}

function getActiveDancersList(limit = 32) {
  return Object.values(state.dancers)
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))
    .slice(0, limit)
    .map((d) => ({
      id: d.uniqueId,
      name: d.name,
      avatar: d.avatar || '',
      slotIndex: d.slotIndex,
      mascotId: d.mascotId || 1,
      danceMove: d.danceMove || 'nhay_tu_do',
      isGiant: !!d.isGiant,
      isRidingDragon: !!d.isRidingDragon,
      title: d.title
    }));
}

function sanitizeUserName(raw, fallbackIndex = null) {
  if (!raw) return fallbackIndex ? `Khách thứ ${fallbackIndex}` : 'Dân Chơi Ẩn Danh';
  let name = String(raw).normalize('NFKC').replace(/\[[^\]]{1,24}\]/g, ' ').trim();
  name = name.replace(/[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return fallbackIndex ? `Khách thứ ${fallbackIndex}` : 'Khách Quý';
  if (name.length > 20) name = name.slice(0, 20).trim();
  return name;
}

function sanitizeComment(raw) {
  if (!raw) return '';
  let text = String(raw).normalize('NFKC').replace(/\[[^\]]{1,24}\]/g, ' ').trim();
  text = text.replace(/[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?_-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > 90) text = text.slice(0, 90).trim();
  return text;
}

function recordDancer(user, uniqueId, avatar, coinsAdded = 0, likesAdded = 0, moveName = null) {
  const key = uniqueId || user || `dancer_${Date.now()}`;
  let existing = state.dancers[key];

  if (!existing) {
    const slotCount = Object.keys(state.dancers).length + 1;
    existing = {
      name: sanitizeUserName(user, slotCount),
      uniqueId: key,
      avatar: avatar || '',
      slotIndex: (slotCount % 16) + 1,
      mascotId: ((slotCount - 1) % 9) + 1,
      coinsTotal: 0,
      likesContributed: 0,
      danceMove: moveName || 'nhay_tu_do',
      title: 'Khách VIP 🕺',
      isGiant: false,
      isRidingDragon: false,
      joinedAt: Date.now(),
      lastActive: Date.now()
    };
    state.club.totalDancers = Math.min(1000, state.club.totalDancers + 1);
    state.club.lastJoinUser = existing.name;
  }

  if (avatar) existing.avatar = avatar;
  if (user) existing.name = sanitizeUserName(user);
  existing.coinsTotal += coinsAdded;
  existing.likesContributed += likesAdded;
  if (moveName) existing.danceMove = moveName;
  existing.title = calculateDancerTitle(existing.coinsTotal);
  existing.lastActive = Date.now();

  state.dancers[key] = existing;
  return existing;
}

function pushEventLog(event) {
  const item = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...event
  };
  state.recentEvents.unshift(item);
  if (state.recentEvents.length > 40) {
    state.recentEvents.pop();
  }
  return item;
}

function getPublicState() {
  // Kiểm tra fever mode hết giờ chưa
  if (state.club.feverMode && Date.now() > state.club.feverEndsAt) {
    state.club.feverMode = false;
    state.club.heat = 20;
  }

  return {
    club: state.club,
    topVip: getLeaderboard(3),
    dancers: getActiveDancersList(24),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok,
    // Backward compatibility fields for any legacy panels:
    totalCatches: state.club.heat,
    totalWeightKg: state.club.totalDancers,
    totalBait: state.club.heat,
    hornsBlown: Object.keys(state.dancers).length,
    leaderboard: getLeaderboard(6).map((item, idx) => ({
      ...item,
      totalWeightKg: item.coinsTotal,
      catchesCount: idx + 1
    }))
  };
}

// ============================================================================
// 4. HÀNH ĐỘNG VŨ TRƯỜNG & TƯƠNG TÁC (CLUB ENGINE)
// ============================================================================
const ClubEngine = {
  // 1. Vào sàn nhảy (Join dance floor)
  joinFloor(params = {}) {
    const user = params.user;
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const dancer = recordDancer(user, uniqueId, avatar);

    const event = pushEventLog({
      type: 'joinFloor',
      user: dancer.name,
      uniqueId: dancer.uniqueId,
      avatar: dancer.avatar,
      mascotId: dancer.mascotId,
      ttsText: params.readTts ? `Chào mừng ${dancer.name} đã lên sàn quẩy!` : ''
    });

    saveState();
    broadcastNotification('bar.event', { event, state: getPublicState() });
    broadcastNotification('fishing.event', { event, state: getPublicState() }); // Alias
    return { event, state: getPublicState() };
  },

  // 2. Thả tim tăng nhiệt sàn (Like / Add Heat)
  addHeat(params = {}) {
    const user = params.user;
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const dancer = recordDancer(user, uniqueId, avatar, 0, count);

    state.club.heat = Math.min(state.club.maxHeat, state.club.heat + count);

    // Kiểm tra nếu chạm mốc 200/200: SÀN CHÁY RỒI! (Fever Mode)
    let triggeredFever = false;
    if (state.club.heat >= state.club.maxHeat && !state.club.feverMode) {
      state.club.feverMode = true;
      state.club.feverEndsAt = Date.now() + 18000; // Sàn cháy trong 18s
      triggeredFever = true;
    }

    const ttsText = triggeredFever
      ? 'Sàn quẩy đã đạt cực đại hai trăm nhiệt! Sàn cháy rồi anh em ơi! Quẩy hết mình nào!'
      : (params.readTts ? `${dancer.name} vừa thả tim bốc lửa tăng nhiệt sàn!` : '');

    const event = pushEventLog({
      type: 'addHeat',
      user: dancer.name,
      uniqueId: dancer.uniqueId,
      avatar: dancer.avatar,
      count,
      currentHeat: state.club.heat,
      feverMode: state.club.feverMode,
      triggeredFever,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('bar.event', { event, state: getPublicState() });
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 3. Đổi điệu nhảy (Dance move change)
  setDanceMove(params = {}) {
    const user = params.user;
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const moveKey = params.move || 'hiphop';
    const dancer = recordDancer(user, uniqueId, avatar, 0, 1, moveKey);

    const event = pushEventLog({
      type: 'danceMove',
      user: dancer.name,
      uniqueId: dancer.uniqueId,
      avatar: dancer.avatar,
      move: moveKey,
      ttsText: params.readTts ? `${dancer.name} đang biểu diễn điệu ${moveKey} cực mượt!` : ''
    });

    saveState();
    broadcastNotification('bar.event', { event, state: getPublicState() });
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 4. Kích hoạt sự kiện tặng quà (Gift Event)
  triggerGift(params = {}) {
    const user = params.user;
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 10);
    const giftName = params.giftName || 'Quà Tặng Bar';

    let giftType = 'fireworks';
    const gLower = giftName.toLowerCase();

    if (coins >= 199 || gLower.includes('rồng') || gLower.includes('dragon')) {
      giftType = 'dragon_ride';
    } else if (coins >= 500 || gLower.includes('bánh sinh nhật')) {
      giftType = 'king';
    } else if (coins >= 150 || gLower.includes('nhịp trống')) {
      giftType = 'golden_duck';
    } else if (coins >= 100 || gLower.includes('nhạc tự do')) {
      giftType = 'rocket';
    } else if (coins >= 50 || gLower.includes('mic')) {
      giftType = 'dj_booth';
    } else if (coins >= 40 || gLower.includes('ốc quế') || gLower.includes('kem')) {
      giftType = 'giant';
    } else if (coins >= 30 || gLower.includes('tiktok')) {
      giftType = 'couple';
    } else if (coins >= 20 || gLower.includes('hiểu ý') || gLower.includes('dallah')) {
      giftType = 'bubbles';
    } else if (coins >= 10 || gLower.includes('mantap')) {
      giftType = 'fireworks';
    } else if (coins >= 5 || gLower.includes('bắn tim')) {
      giftType = 'dj_booth';
    } else if (gLower.includes('đỉnh')) {
      giftType = 'catwalk';
    } else if (gLower.includes('yêu bạn')) {
      giftType = 'dance_once';
    } else if (gLower.includes('que') || gLower.includes('sáng')) {
      giftType = 'swap';
    } else if (gLower.includes('hồng') || gLower.includes('rose')) {
      giftType = 'camera';
    } else {
      giftType = 'camera';
    }

    const dancer = recordDancer(user, uniqueId, avatar, coins, 5);

    // Tăng nhiệt sàn mạnh khi tặng quà
    state.club.heat = Math.min(state.club.maxHeat, state.club.heat + Math.min(50, Math.floor(coins / 2)));
    if (state.club.heat >= state.club.maxHeat && !state.club.feverMode) {
      state.club.feverMode = true;
      state.club.feverEndsAt = Date.now() + 18000;
    }

    if (giftType === 'dragon_ride') {
      dancer.isRidingDragon = true;
      setTimeout(() => {
        dancer.isRidingDragon = false;
        saveState();
      }, 10000);
    } else if (giftType === 'giant') {
      dancer.isGiant = true;
      setTimeout(() => {
        dancer.isGiant = false;
        saveState();
      }, 8000);
    } else if (giftType === 'dj_booth') {
      state.club.djName = dancer.name;
    }

    let ttsText = '';
    if (giftType === 'dragon_ride') {
      ttsText = `CHẤN ĐỘNG VŨ TRƯỜNG! Đại gia ${dancer.name} xuất hiện cưỡi rồng vàng kim long rực sáng! Cả vũ trường cùng cúi chào Vua Sàn Nhảy!`;
    } else if (giftType === 'dj_booth') {
      ttsText = `Đại gia ${dancer.name} đã bước lên bục DJ chỉ đạo âm nhạc! Tăng âm lượng nào anh em ơi!`;
    } else if (giftType === 'giant') {
      ttsText = `Úi chà! ${dancer.name} đã hóa khổng lồ dẫm nát sàn nhảy!`;
    } else {
      ttsText = `Cảm ơn đại gia ${dancer.name} đã tặng ${giftName} ${coins} xu! Quẩy bốc lửa lên nào!`;
    }

    const event = pushEventLog({
      type: 'gift',
      giftType,
      giftName,
      coins,
      user: dancer.name,
      uniqueId: dancer.uniqueId,
      avatar: dancer.avatar,
      mascotId: dancer.mascotId,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('bar.event', { event, state: getPublicState() });
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  updateSettings(params = {}) {
    state.settings = { ...state.settings, ...params };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('bar.state', getPublicState());
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  },

  resetState() {
    state.club.heat = 0;
    state.club.feverMode = false;
    state.club.totalDancers = 1;
    state.club.lastJoinUser = 'Dân Chơi Khởi Động';
    state.dancers = {
      starter_dancer: {
        ...DEFAULT_STATE.dancers.starter_dancer,
        joinedAt: Date.now(),
        lastActive: Date.now()
      }
    };
    state.recentEvents = [];
    saveState();
    broadcastNotification('bar.state', getPublicState());
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;
const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw) return null;

  const clean = sanitizeComment(raw);
  if (!clean || clean.length < 1) return null;

  // Chống spam (cooldown 2.5s / người)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 2500) return null;
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 800) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = clean.toLowerCase();

  // Đổi điệu nhảy
  for (const move of DANCE_MOVES) {
    if (lower.includes(move.keyword) || lower.includes(move.id)) {
      return ClubEngine.setDanceMove({ user: cleanUser, uniqueId, avatar, move: move.id, readTts: false });
    }
  }

  // Lên sàn / Tham gia quẩy
  return ClubEngine.joinFloor({ user: cleanUser, uniqueId, avatar, readTts: false });
}

function extractUserFromEvent(data) {
  const user = data?.nickname || data?.uniqueId || data?.user?.nickname || data?.user?.uniqueId || 'Khách VIP';
  const uniqueId = data?.uniqueId || data?.user?.uniqueId || '';
  const avatar = data?.profilePictureUrl || data?.user?.profilePictureUrls?.[0] || '';
  return { user, uniqueId, avatar };
}

async function resolveTikTokUsername(input) {
  if (!input) return null;
  let str = String(input).trim();
  const atMatch = str.match(/@([a-zA-Z0-9_.-]+)/);
  if (atMatch) return atMatch[1];
  const urlMatch = str.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/);
  if (urlMatch) return urlMatch[1];
  return str.replace(/[^a-zA-Z0-9_.-]/g, '');
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('bar.state', getPublicState());
  broadcastNotification('fishing.state', getPublicState());

  tiktokConn = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  // Bảo vệ wsClient khỏi emit error không có listener sau khi đóng kết nối
  tiktokConn.on(ControlEvent.WEBSOCKET_CONNECTED, (wsClient) => {
    if (wsClient && typeof wsClient.on === 'function') {
      wsClient.on('error', (err) => {
        console.warn('[TikTok Live WS Error]', err?.message || err);
      });
      const origRemoveAll = wsClient.removeAllListeners.bind(wsClient);
      wsClient.removeAllListeners = function (event) {
        origRemoveAll(event);
        this.on('error', () => {});
        return this;
      };
    }
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Đã kết nối vũ trường @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('bar.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('bar.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    const errMsg = err?.exception?.message || err?.info || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    state.tiktok.lastError = errMsg;
    console.warn('[TikTok Live Warning]', errMsg);
    broadcastNotification('bar.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('bar.viewerCount', { viewerCount });
    }
  });

  tiktokConn.on(WebcastEvent.MEMBER, (data) => {
    // Chỉ ghi nhận người vào xem, không tự động cho lên sàn.
    // Người xem chỉ lên sàn nhảy khi comment (CHAT) hoặc tặng quà (GIFT).
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(25, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    ClubEngine.addHeat({ user, uniqueId, avatar, count: likeCount });
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    ClubEngine.addHeat({ user, uniqueId, avatar, count: 10 });
  };

  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const text = String(data?.label || '').toLowerCase();
    if (text.includes('follow') || text.includes('share')) {
      handleSocialEvent(data);
    }
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftName = data?.giftName || data?.name || 'Quà Sàn Nhảy';
    const diamondCount = Number(data?.diamondCount || 0);
    const repeatCount = Number(data?.repeatCount || 1);
    const totalCoins = Math.max(1, diamondCount * repeatCount);

    console.log(`[TikTok Gift] ${user} tặng ${giftName} (${totalCoins} xu)`);
    ClubEngine.triggerGift({
      user,
      uniqueId,
      avatar,
      giftName,
      coins: totalCoins
    });
  });

  try {
    const roomState = await tiktokConn.connect();
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('bar.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    broadcastNotification('bar.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('bar.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (GIẢ LẬP KHÁCH QUẨY VŨ TRƯỜNG)
// ============================================================================
let autoSimTimer = null;
const SIM_CLUB_GUESTS = [
  { user: 'Bé Thỏ Quẩy', uniqueId: 'bunny_dancer', move: 'hop', gift: 'camera', coins: 1 },
  { user: 'Gấu B-Boy', uniqueId: 'bear_bboy', move: 'hiphop', gift: 'fireworks', coins: 20 },
  { user: 'Kangaroo Nhảy', uniqueId: 'kanga_kick', move: 'lộn', gift: 'catwalk', coins: 10 },
  { user: 'Hổ Sành Điệu', uniqueId: 'tiger_club', move: 'robot', gift: 'giant', coins: 45 },
  { user: 'Bạch Tuộc DJ', uniqueId: 'octo_dj', move: 'wave', gift: 'dj_booth', coins: 68 },
  { user: 'Đại Gia Phố Lớn', uniqueId: 'daigia_vip', move: 'breakdance', gift: 'dragon_ride', coins: 299 }
];

function runSingleSimulationStep() {
  const pick = SIM_CLUB_GUESTS[Math.floor(Math.random() * SIM_CLUB_GUESTS.length)];
  const roll = Math.random();
  if (roll < 0.40) {
    ClubEngine.addHeat({ user: pick.user, uniqueId: pick.uniqueId, count: 5 });
  } else if (roll < 0.70) {
    ClubEngine.setDanceMove({ user: pick.user, uniqueId: pick.uniqueId, move: pick.move });
  } else if (roll < 0.92) {
    ClubEngine.joinFloor({ user: pick.user, uniqueId: pick.uniqueId });
  } else {
    ClubEngine.triggerGift({
      user: pick.user,
      uniqueId: pick.uniqueId,
      giftName: pick.gift === 'dragon_ride' ? 'Cưỡi Rồng' : 'Pháo Hoa Rực Sàn',
      coins: pick.coins
    });
  }
}

function configureAutoSim(enabled) {
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  state.settings.autoSim = !!enabled;
  if (enabled) {
    console.log('[AutoSim] Bật chế độ giả lập khách quẩy vũ trường...');
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 6500);
  } else {
    console.log('[AutoSim] Đã tắt chế độ giả lập.');
  }
}

// ============================================================================
// 7. BỘ ĐIỀU PHỐI JSON-RPC 2.0 (RPC DISPATCHER)
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    // Bar / Club Methods
    case 'bar.joinFloor':
      return ClubEngine.joinFloor(params);

    case 'bar.addHeat':
    case 'fishing.castBait':
    case 'temple.incense': // Backward-compatible alias
      return ClubEngine.addHeat(params);

    case 'bar.danceMove':
    case 'fishing.castRod':
    case 'temple.prayer': // Backward-compatible alias
      return ClubEngine.setDanceMove(params);

    case 'bar.gift':
    case 'fishing.hookFish':
    case 'fishing.catchBigFish':
    case 'fishing.catchLeviathan':
    case 'temple.fortune':
    case 'temple.drawFortune':
    case 'temple.giftLotus':
    case 'temple.grandCeremony': // Backward-compatible alias
      return ClubEngine.triggerGift(params);

    case 'bar.getState':
    case 'fishing.getState':
    case 'temple.getState':
      return getPublicState();

    case 'bar.getLeaderboard':
    case 'fishing.getLeaderboard':
    case 'temple.getLeaderboard':
      return getLeaderboard(params.limit || 3);

    case 'bar.resetState':
    case 'fishing.resetState':
    case 'temple.resetMerit':
      return ClubEngine.resetState();

    case 'bar.setSettings':
    case 'fishing.setSettings':
    case 'temple.setSettings':
      return ClubEngine.updateSettings(params);

    case 'bar.connectTikTok':
    case 'fishing.connectTikTok':
    case 'temple.connectTikTok':
      return await connectTikTokLive(params.username);

    case 'bar.disconnectTikTok':
    case 'fishing.disconnectTikTok':
    case 'temple.disconnectTikTok':
      return disconnectTikTokLive();

    case 'bar.startAutoSim':
    case 'fishing.startAutoSim':
      configureAutoSim(true);
      return getPublicState();

    case 'bar.stopAutoSim':
    case 'fishing.stopAutoSim':
      configureAutoSim(false);
      return getPublicState();

    case 'tts.synthesize':
      return await zeroTts.synthesize(params.text, params.voice);

    case 'tts.status':
      return zeroTts.getStatus();

    default:
      throw new Error(`Method không tồn tại: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS SERVER & WEBSOCKET BROADCASTER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tĩnh tài nguyên
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/tts-cache', express.static(TTS_CACHE_DIR));

// JSON-RPC 2.0 HTTP Endpoint
app.post('/rpc', async (req, res) => {
  const body = req.body;
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' }
    });
  }

  try {
    const result = await handleRpcCall(body.method, body.params || {});
    return res.json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      result
    });
  } catch (err) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32000, message: err.message || 'Internal RPC Error' }
    });
  }
});

// ZeroTTS HTTP Endpoint (Mai Chi default)
app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('error', (err) => {
  console.warn('[WebSocket Server Error]', err?.message || err);
});

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(payload);
      } catch (err) {
        console.warn('[WS Broadcast Error]', err?.message || err);
      }
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('error', (err) => {
    console.warn('[WS Client Error]', err?.message || err);
  });

  // Gửi trạng thái ban đầu
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'bar.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🪩 SÀN QUẨY VŨ TRƯỜNG TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'zenfacts_vn';
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
    });
  }
});
