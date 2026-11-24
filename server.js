const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'wuxia-arena-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. 7 BINH KHÍ & ĐẠI MÔN PHÁI KIẾM HIỆP (WEAPONS & SECTS CONFIG)
// ============================================================================
const SECTS = {
  vodang: {
    id: 'vodang',
    name: 'Võ Đang',
    fullName: 'Võ Đang Phái',
    weapon: 'Thái Cực Kiếm',
    weaponType: 'kiem',
    weaponLabel: 'Kiếm',
    color: '#38bdf8',
    secondaryColor: '#f1f5f9',
    badge: '☯️',
    ultimate: 'Thái Cực Kiếm Trận',
    baseHp: 280,
    baseAtk: 24,
    range: 2.8,
    speed: 4.5,
    cooldown: 0.95,
    ranged: false,
    keywords: ['kiếm', 'kiem', 'võ đang', 'vo dang', 'wudang', 'thái cực', 'thai cuc', 'nga mi', 'nga my', 'ỷ thiên']
  },
  duonggia: {
    id: 'duonggia',
    name: 'Dương Gia',
    fullName: 'Thiên Vương Dương Gia',
    weapon: 'Phá Quân Thương',
    weaponType: 'thuong',
    weaponLabel: 'Thương',
    color: '#14b8a6',
    secondaryColor: '#dc2626',
    badge: '🔱',
    ultimate: 'Hồi Mã Thần Thương',
    baseHp: 300,
    baseAtk: 26,
    range: 3.7,
    speed: 4.2,
    cooldown: 1.15,
    ranged: false,
    keywords: ['thương', 'thuong', 'dương gia', 'duong gia', 'thiên vương', 'thien vuong', 'giáo', 'giao', 'mâu']
  },
  minhgiao: {
    id: 'minhgiao',
    name: 'Minh Giáo',
    fullName: 'Quang Minh Đỉnh Minh Giáo',
    weapon: 'Đồ Long Đao',
    weaponType: 'dao',
    weaponLabel: 'Đao',
    color: '#ef4444',
    secondaryColor: '#1e1b2e',
    badge: '🔥',
    ultimate: 'Càn Khôn Đại Na Di',
    baseHp: 320,
    baseAtk: 30,
    range: 3.0,
    speed: 4.1,
    cooldown: 1.2,
    ranged: false,
    keywords: ['đao', 'dao', 'minh giáo', 'minh giao', 'ma giáo', 'ma giao', 'đồ long', 'do long', 'huyết đao']
  },
  thieulam: {
    id: 'thieulam',
    name: 'Thiếu Lâm',
    fullName: 'Thiếu Lâm Tự',
    weapon: 'Hàng Ma Côn',
    weaponType: 'con',
    weaponLabel: 'Côn',
    color: '#f59e0b',
    secondaryColor: '#9a3412',
    badge: '📿',
    ultimate: 'Như Lai Thần Chưởng',
    baseHp: 365,
    baseAtk: 25,
    range: 3.3,
    speed: 3.9,
    cooldown: 1.1,
    ranged: false,
    keywords: ['côn', 'con', 'trượng', 'truong', 'thiếu lâm', 'thieu lam', 'shaolin', 'hàng ma']
  },
  tieudao: {
    id: 'tieudao',
    name: 'Tiêu Dao',
    fullName: 'Tiêu Dao Cung Phái',
    weapon: 'Lạc Nhật Cung',
    weaponType: 'cung',
    weaponLabel: 'Cung',
    color: '#22c55e',
    secondaryColor: '#14532d',
    badge: '🏹',
    ultimate: 'Bách Bộ Xuyên Dương',
    baseHp: 245,
    baseAtk: 27,
    range: 10.5,
    speed: 4.6,
    cooldown: 1.25,
    ranged: true,
    projectileType: 'arrow',
    keywords: ['cung', 'đánh cung', 'danh cung', 'bắn cung', 'tiêu dao', 'tieu dao', 'súng', 'sung', 'tên']
  },
  duongmon: {
    id: 'duongmon',
    name: 'Đường Môn',
    fullName: 'Tứ Xuyên Đường Môn',
    weapon: 'Bão Vũ Phi Tiêu',
    weaponType: 'tieu',
    weaponLabel: 'Tiêu',
    color: '#a855f7',
    secondaryColor: '#1e1033',
    badge: '⚡',
    ultimate: 'Bão Vũ Lê Hoa Châm',
    baseHp: 250,
    baseAtk: 22,
    range: 9.2,
    speed: 5.0,
    cooldown: 0.85,
    ranged: true,
    projectileType: 'shuriken',
    keywords: ['tiêu', 'tieu', 'phi tiêu', 'phi tieu', 'ám khí', 'am khi', 'đường môn', 'duong mon', 'châm', 'cham']
  },
  caibang: {
    id: 'caibang',
    name: 'Cái Bang',
    fullName: 'Cái Bang Đệ Nhất Bang',
    weapon: 'Giáng Long Quyền',
    weaponType: 'quyen',
    weaponLabel: 'Quyền',
    color: '#eab308',
    secondaryColor: '#78350f',
    badge: '🐉',
    ultimate: 'Giáng Long Thập Bát Chưởng',
    baseHp: 315,
    baseAtk: 28,
    range: 2.5,
    speed: 4.8,
    cooldown: 0.85,
    ranged: false,
    keywords: ['quyền', 'quyen', 'bổng', 'bong', 'cái bang', 'cai bang', 'chưởng', 'chuong', 'đả cẩu', 'giáng long']
  }
};

const SECT_KEYS = Object.keys(SECTS);

// 4 KỸ NĂNG TẶNG QUÀ CHUẨN TIKTOK LIVE (HOA HỒNG + GG + HỘP QUÀ BÓNG BAY + THẢ TIM)
const GIFT_SKILLS = {
  rose: {
    id: 'rose',
    icon: '🌹',
    iconImg: null,
    giftName: 'Hoa hồng',
    label: 'Vào đấu / +20 máu',
    coins: 1,
    color: '#f43f5e'
  },
  gg: {
    id: 'gg',
    icon: '🎮',
    iconImg: '/assets/gifts/gg.png',
    giftName: 'GG',
    label: 'Hồi máu',
    coins: 1,
    color: '#22c55e'
  },
  giftbox: {
    id: 'giftbox',
    icon: '🎁',
    iconImg: '/assets/gifts/giftbox.png',
    giftName: 'Hộp quà bóng bay',
    label: 'Khổng lồ',
    coins: 100,
    color: '#60a5fa'
  },
  heart_hands: {
    id: 'heart_hands',
    icon: '💎',
    iconImg: '/assets/gifts/heart_hands.png',
    giftName: 'Thả tim',
    label: 'Hồi sinh / Thần Võ',
    coins: 100,
    color: '#c084fc'
  }
};

// ============================================================================
// 1.5. DANH SÁCH 5 ĐẠI BOSS VÕ LÂM XUẤT HIỆN NGẪU NHIÊN (WORLD BOSS ROSTER)
// ============================================================================
const BOSS_ROSTER = [
  {
    type: 'huyet_ma',
    user: '🔥 HUYẾT MA TÔN GIẢ',
    title: 'ĐẠI MA ĐẦU HUYẾT NGỤC',
    baseHp: 680,
    hpPerHero: 150,
    atk: 34,
    aoeDmg: 28,
    aoeRadius: 7.2,
    skillName: 'Huyết Ma Phá Thiên Trảm',
    weaponStyle: 'greatsword',
    colors: { body: '#240b12', armor: '#7f1d1d', glow: '#ff3b1f', accent: '#fb923c' },
    announce: 'Báo động toàn võ lâm! Huyết Ma Tôn Giả giáng lâm võ đài! Toàn bộ hiệp khách tạm đình chiến, đồng tâm diệt Ma!'
  },
  {
    type: 'huyen_bang',
    user: '❄️ HUYỀN BĂNG YÊU HOÀNG',
    title: 'BĂNG ĐẾ VẠN NĂM',
    baseHp: 720,
    hpPerHero: 155,
    atk: 32,
    aoeDmg: 26,
    aoeRadius: 7.6,
    skillName: 'Hàn Băng Vạn Trượng',
    weaponStyle: 'halberd',
    colors: { body: '#0c1e35', armor: '#1d4ed8', glow: '#38bdf8', accent: '#bae6fd' },
    announce: 'Khí lạnh thấu xương! Huyền Băng Yêu Hoàng bất ngờ giáng lâm! Mọi người mau hợp lực phá băng diệt Boss!'
  },
  {
    type: 'kim_giap',
    user: '⚡ THIẾT GIÁP MA VƯƠNG',
    title: 'LÔI ĐÌNH CHIẾN MA',
    baseHp: 780,
    hpPerHero: 165,
    atk: 36,
    aoeDmg: 30,
    aoeRadius: 7.0,
    skillName: 'Thiên Lôi Chấn Địa',
    weaponStyle: 'mace',
    colors: { body: '#23190b', armor: '#92400e', glow: '#facc15', accent: '#fef08a' },
    announce: 'Sấm sét rền vang! Thiết Giáp Ma Vương đột kích trung tâm võ đài! Chư vị anh hùng lập tức hợp công!'
  },
  {
    type: 'doc_vuong',
    user: '☠️ CỬU U ĐỘC TÔN',
    title: 'MA ĐỘC U MINH',
    baseHp: 650,
    hpPerHero: 145,
    atk: 33,
    aoeDmg: 25,
    aoeRadius: 7.8,
    skillName: 'Vạn Độc Phệ Tâm',
    weaponStyle: 'twinblades',
    colors: { body: '#1a0c26', armor: '#581c87', glow: '#4ade80', accent: '#c084fc' },
    announce: 'Độc chướng ngập trời! Cửu U Độc Tôn bất ngờ hiện thân! Toàn võ lâm hãy hợp sức tiêu diệt yêu ma!'
  },
  {
    type: 'hac_long',
    user: '🐉 HẮC LONG MA ĐẾ',
    title: 'CỔ LONG HỖN MANG',
    baseHp: 760,
    hpPerHero: 160,
    atk: 37,
    aoeDmg: 31,
    aoeRadius: 7.5,
    skillName: 'Hắc Long Diệt Thế',
    weaponStyle: 'glaive',
    colors: { body: '#111019', armor: '#312e81', glow: '#f43f5e', accent: '#fde047' },
    announce: 'Long ngâm chấn động cửu thiên! Hắc Long Ma Đế giáng lâm võ đài! Toàn thể anh hùng liên thủ trảm long!'
  }
];

// ============================================================================
// 2. ZEROTTS PYTHON WORKER MANAGER (VOICE: MAI CHI HOẶC FALLBACK)
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
    this.inflight = new Map();
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
    if (!fs.existsSync(scriptPath)) {
      this.status = 'fallback_browser';
      return;
    }
    this.status = 'loading';
    try {
      this.proc = spawn(pyBin, [scriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      this.proc.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString('utf8');
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) this.handleWorkerLine(line.trim());
        }
      });
      this.proc.stderr.on('data', () => {});
      this.proc.on('exit', () => {
        this.ready = false;
        this.status = 'stopped';
        for (const [, item] of this.pending) {
          clearTimeout(item.timer);
          item.resolve({ ok: false, error: 'ZeroTTS exited' });
        }
        this.pending.clear();
      });
    } catch (_) {
      this.status = 'fallback_browser';
    }
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'maichi';
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      }
    } catch (_) {}
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      voice: state.settings.ttsVoice || this.voice || 'maichi'
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = (voiceOverride || state.settings.ttsVoice || 'maichi').toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;
    if (this.inflight.has(dedupKey)) return this.inflight.get(dedupKey);

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: 'ZeroTTS not ready' });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'timeout' });
      }, 25000);
      this.pending.set(id, { resolve, timer });
      this.proc.stdin.write(JSON.stringify({ id, text: cleanText, voice }) + '\n');
    }).finally(() => this.inflight.delete(dedupKey));

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. TRẠNG THÁI VÕ ĐÀI & PERSISTENCE
// ============================================================================
const REGISTRATION_DURATION = 16; // giây ghi danh
const FIGHT_DURATION = 150;       // 2:30 giao đấu
const CORONATION_DURATION = 7;    // giây vinh danh Minh Chủ
const MAX_HEROES_PER_MATCH = 24;
const ARENA_RADIUS = 13.6;

const DEFAULT_PERSISTENT = {
  round: 1,
  champion: null,
  hallOfFame: {},
  lastRoundTopKills: [],
  totalLikes: 0,
  totalKills: 0,
  totalGifts: 0,
  maDauTarget: 1000,
  maDauRemaining: 1000,
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    autoSim: false,
    autoFillBots: false,
    autoSimIntervalMs: 4200,
    randomBossEnabled: true,
    bossMinIntervalSec: 25,
    bossMaxIntervalSec: 50,
    tiktokUsername: '',
    hostName: 'VÕ LÂM LIVE',
    hostLevel: 28,
    graphics3D: {
      quality: 'high',           // 'low' | 'medium' | 'high'
      shadows: true,
      kiAura: true,
      slashTrails: true,
      damageNumbers: true,
      spectators: true,
      braziers: true,
      environmentFx: 'embers',   // 'embers' | 'sakura' | 'snow' | 'fog' | 'none'
      cameraMode: 'broadcast',   // 'broadcast' | 'director' | 'low_hero' | 'side_left' | 'side_right' | 'crowd_pov' | 'cinematic' | 'action' | 'champion' | 'topdown' | 'orbit'
      giftCamZoom: true,         // Tự động zoom camera vào nhân vật khi tặng quà để dễ nhận biết
      aspectMode: '9:16'         // '9:16' | '16:9'
    }
  }
};

function loadPersistent() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_PERSISTENT,
        ...saved,
        hallOfFame: saved.hallOfFame || {},
        lastRoundTopKills: Array.isArray(saved.lastRoundTopKills) ? saved.lastRoundTopKills : [],
        settings: {
          ...DEFAULT_PERSISTENT.settings,
          ...(saved.settings || {}),
          graphics3D: {
            ...DEFAULT_PERSISTENT.settings.graphics3D,
            ...(saved.settings?.graphics3D || {})
          }
        }
      };
    }
  } catch (e) {
    console.warn('[State] Dùng dữ liệu mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_PERSISTENT));
}

const persisted = loadPersistent();

const state = {
  ...persisted,
  phase: 'registration', // Bắt đầu ở pha Ghi danh chờ người xem thật từ TikTok Live
  phaseTimer: REGISTRATION_DURATION,
  matchHeroes: new Map(), // uniqueId -> Fighter runtime object
  waitingQueue: [],       // [{ user, uniqueId, avatar, chosenSect, level }]
  boss: null,             // World Boss object nếu đang xuất hiện (mọi người đình chiến cùng đánh)
  nextBossInSec: null,    // Đếm ngược (giây) tới lần Boss xuất hiện ngẫu nhiên tiếp theo
  bossCeasefireUntil: 0,  // Thời điểm kết thúc ăn mừng sau khi hạ Boss để quay lại tỉ thí
  bossResumePending: false,
  lastBossType: null,
  recentChat: [],
  recentEvents: [],
  tiktok: {
    connected: false,
    connecting: false,
    username: persisted.settings.tiktokUsername || '',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      round: state.round,
      champion: state.champion,
      hallOfFame: state.hallOfFame,
      lastRoundTopKills: state.lastRoundTopKills,
      totalLikes: state.totalLikes,
      totalKills: state.totalKills,
      totalGifts: state.totalGifts,
      maDauTarget: state.maDauTarget,
      maDauRemaining: state.maDauRemaining,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch(() => {});
  }, 1500);
}

// ============================================================================
// 4. DANH SÁCH ANH HÙNG MẪU & TIỆN ÍCH
// ============================================================================
const DEMO_ROSTER = [
  { user: 'Lion_King 🐯', uniqueId: 'lion_king', sect: 'thieulam', level: 24, title: 'Thiếu Hiệp' },
  { user: 'DVDL Trường An', uniqueId: 'dvdl_truong_an', sect: 'vodang', level: 19, title: 'Thiếu Hiệp' },
  { user: 'Là Quang Đây', uniqueId: 'la_quang_day', sect: 'minhgiao', level: 16, title: 'Vô Danh Tiểu Tốt' },
  { user: 'Tí Hin', uniqueId: 'ti_hin', sect: 'duonggia', level: 21, title: 'Thiếu Hiệp' },
  { user: 'sls.vt.c08', uniqueId: 'sls_vt_c08', sect: 'vodang', level: 14, title: 'Vô Danh Tiểu Tốt' },
  { user: 'Coen Thao', uniqueId: 'coen_thao', sect: 'duonggia', level: 15, title: 'Vô Danh Tiểu Tốt' },
  { user: 'Duy anh duy nam', uniqueId: 'duy_anh', sect: 'tieudao', level: 12, title: 'Vô Danh Tiểu Tốt' },
  { user: '阮廷进 💧', uniqueId: 'ruan_tingjin', sect: 'minhgiao', level: 18, title: 'Thiếu Hiệp' },
  { user: 'ZennyLu', uniqueId: 'zennylu', sect: 'duongmon', level: 20, title: 'Hạng 3', rankBadge: '🏅 Hạng 3' },
  { user: '『30th×July』', uniqueId: '30th_july', sect: 'caibang', level: 31, title: 'Đại Hiệp' },
  { user: 'Hoàn Hay Nói', uniqueId: 'hoan_hay_noi', sect: 'tieudao', level: 17, title: 'Thiếu Hiệp' },
  { user: 'Toán Tít\'s', uniqueId: 'toan_tits', sect: 'vodang', level: 29, title: 'Đại Hiệp' },
  { user: 'Aan', uniqueId: 'aan_vn', sect: 'duongmon', level: 9, title: 'Vô Danh Tiểu Tốt' },
  { user: 'huy hoang', uniqueId: 'huy_hoang', sect: 'caibang', level: 11, title: 'Vô Danh Tiểu Tốt' }
];

const DEMO_BUBBLES = [
  'Về quê nuôi cá thôi!',
  'Xem kiếm pháp của ta đây!',
  'Đừng chạy nữa!',
  'Võ Lâm Minh Chủ là của ta!',
  'Hôm nay quyết tử chiến!',
  'Kim Chung Tráo hộ thể!',
  'Nhất kích tất sát!'
];

const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|lừa đảo|telegram)/i;
const ALLOWED_NAME_RE = /[^0-9a-zA-Z\u3000-\u9FFFÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._\-『』×🐯💧🔥⚡]/g;

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .replace(ALLOWED_NAME_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 22);
  if (!normalized || BAD_WORDS_RE.test(normalized) || normalized.length < 2) {
    return 'Vô Danh Hiệp';
  }
  return normalized;
}

function sanitizeChatText(rawText) {
  return String(rawText || '')
    .normalize('NFKC')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function getMartialTitle(kills, isChamp) {
  if (isChamp) return 'Võ Lâm Minh Chủ';
  if (kills >= 8) return 'Võ Thánh';
  if (kills >= 4) return 'Đại Hiệp';
  if (kills >= 1) return 'Thiếu Hiệp';
  return 'Vô Danh Tiểu Tốt';
}

function pushChatMessage(msg) {
  const entry = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...msg
  };
  state.recentChat.push(entry);
  if (state.recentChat.length > 35) {
    state.recentChat.shift();
  }
  broadcastNotification('wuxia.chat', entry);
  return entry;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 30) state.recentEvents.length = 30;
  return entry;
}

// ============================================================================
// 5. SERIALIZE TRẠNG THÁI (STATE SNAPSHOTS & 10HZ TICK)
// ============================================================================
function serializeHero(h) {
  const now = Date.now();
  return {
    id: h.id,
    user: h.user,
    uniqueId: h.uniqueId,
    avatar: h.avatar || '',
    sect: h.sect,
    weapon: h.weapon,
    weaponType: h.weaponType,
    team: h.team,
    x: +h.x.toFixed(2),
    z: +h.z.toFixed(2),
    rotY: +h.rotY.toFixed(2),
    vx: +h.vx.toFixed(2),
    vz: +h.vz.toFixed(2),
    hp: Math.ceil(h.hp),
    maxHp: Math.ceil(h.maxHp),
    shield: Math.ceil(h.shield),
    kills: h.kills,
    totalKills: h.totalKills,
    level: h.level,
    title: getMartialTitle(h.kills, state.champion?.uniqueId === h.uniqueId),
    alive: h.alive,
    isChampion: state.champion?.uniqueId === h.uniqueId,
    buffs: {
      shield: h.shield > 0 && h.buffs.shieldUntil > now,
      rage: h.buffs.rageUntil > now,
      giant: h.buffs.giantUntil > now,
      thanvo: h.buffs.thanvoUntil > now,
      flee: h.buffs.fleeUntil > now
    },
    scale: h.buffs.giantUntil > now ? 1.65 : h.buffs.thanvoUntil > now ? 1.25 : 1.0,
    speech: h.speechUntil > now ? h.speechText : ''
  };
}

function getMatchTopKills(limit = 5) {
  return Array.from(state.matchHeroes.values())
    .sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.hp - a.hp;
    })
    .slice(0, limit)
    .map((h, i) => ({
      rank: i + 1,
      user: h.user,
      uniqueId: h.uniqueId,
      sect: h.sect,
      kills: h.kills,
      alive: h.alive
    }));
}

function getHallOfFame(limit = 6) {
  return Object.values(state.hallOfFame)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return (b.kills || 0) - (a.kills || 0);
    })
    .slice(0, limit)
    .map((entry, idx) => ({
      rank: idx + 1,
      ...entry
    }));
}

function getSectStatsSummary() {
  const summary = {};
  for (const k of SECT_KEYS) {
    summary[k] = { members: 0, alive: 0, kills: 0, power: 20 };
  }
  for (const h of state.matchHeroes.values()) {
    if (!summary[h.sect]) continue;
    summary[h.sect].members += 1;
    if (h.alive) summary[h.sect].alive += 1;
    summary[h.sect].kills += h.kills;
    summary[h.sect].power += (h.alive ? 40 : 10) + h.kills * 35;
  }
  return summary;
}

function getBossDamageTop(boss, limit = 3) {
  if (!boss || !boss.damageByHero) return [];
  return Array.from(boss.damageByHero.values())
    .sort((a, b) => b.damage - a.damage)
    .slice(0, limit)
    .map((entry, idx) => ({
      rank: idx + 1,
      uniqueId: entry.uniqueId,
      user: entry.user,
      sect: entry.sect,
      damage: Math.round(entry.damage)
    }));
}

function serializeBoss(boss) {
  if (!boss || !boss.alive) return null;
  return {
    id: boss.id,
    bossType: boss.bossType,
    user: boss.user,
    title: boss.title,
    skillName: boss.skillName,
    weaponStyle: boss.weaponStyle,
    colors: boss.colors,
    x: +boss.x.toFixed(2),
    z: +boss.z.toFixed(2),
    rotY: +boss.rotY.toFixed(2),
    hp: Math.ceil(boss.hp),
    maxHp: Math.ceil(boss.maxHp),
    enraged: Boolean(boss.enraged),
    alive: true,
    damageTop: getBossDamageTop(boss, 3)
  };
}

function getPublicState() {
  const heroes = Array.from(state.matchHeroes.values());
  const aliveCount = heroes.filter((h) => h.alive).length;
  const serializedBoss = serializeBoss(state.boss);
  return {
    round: state.round,
    phase: state.phase,
    phaseTimer: Math.max(0, Math.ceil(state.phaseTimer)),
    aliveCount,
    totalHeroes: heroes.length,
    maxHeroes: MAX_HEROES_PER_MATCH,
    waitingCount: state.waitingQueue.length,
    maDauTarget: state.maDauTarget,
    maDauRemaining: Math.max(0, state.maDauRemaining),
    nextBossInSec: state.nextBossInSec != null ? Math.max(0, Math.ceil(state.nextBossInSec)) : null,
    bossRaidActive: Boolean(serializedBoss),
    champion: state.champion,
    boss: serializedBoss,
    sects: SECTS,
    giftSkills: GIFT_SKILLS,
    sectStats: getSectStatsSummary(),
    topKills: getMatchTopKills(5),
    lastRoundTopKills: state.lastRoundTopKills.slice(0, 3),
    hallOfFame: getHallOfFame(5),
    activeFighters: heroes.map(serializeHero),
    totalLikes: state.totalLikes,
    totalKills: state.totalKills,
    totalGifts: state.totalGifts,
    recentChat: state.recentChat.slice(-22),
    recentEvents: state.recentEvents.slice(0, 12),
    settings: state.settings,
    tiktok: state.tiktok,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'browser_speech' }
  };
}

function getCompactTick() {
  const heroes = Array.from(state.matchHeroes.values());
  const serializedBoss = serializeBoss(state.boss);
  return {
    round: state.round,
    phase: state.phase,
    phaseTimer: Math.max(0, Math.ceil(state.phaseTimer)),
    aliveCount: heroes.filter((h) => h.alive).length,
    totalHeroes: heroes.length,
    waitingCount: state.waitingQueue.length,
    maDauRemaining: Math.max(0, state.maDauRemaining),
    nextBossInSec: state.nextBossInSec != null ? Math.max(0, Math.ceil(state.nextBossInSec)) : null,
    bossRaidActive: Boolean(serializedBoss),
    totalLikes: state.totalLikes,
    fighters: heroes.map(serializeHero),
    boss: serializedBoss
  };
}

// ============================================================================
// 6. HỆ THỐNG CHIẾN ĐẤU VÕ ĐÀI REAL-TIME (AUTONOMOUS ARENA ENGINE)
// ============================================================================
const WuxiaArena = {
  pickBalancedSect() {
    const counts = {};
    SECT_KEYS.forEach((k) => (counts[k] = 0));
    for (const h of state.matchHeroes.values()) {
      counts[h.sect] = (counts[h.sect] || 0) + 1;
    }
    let min = Infinity;
    let candidates = [];
    for (const k of SECT_KEYS) {
      if (counts[k] < min) {
        min = counts[k];
        candidates = [k];
      } else if (counts[k] === min) {
        candidates.push(k);
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  },

  arrangeRegistrationCircle() {
    const list = Array.from(state.matchHeroes.values());
    const n = Math.max(1, list.length);
    const radius = Math.min(9.4, 6.2 + n * 0.22);
    list.forEach((h, i) => {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      h.x = Math.cos(ang) * radius;
      h.z = Math.sin(ang) * radius;
      h.rotY = Math.atan2(-h.x, -h.z);
      h.vx = 0;
      h.vz = 0;
    });
  },

  spawnHeroOnArena({ user, uniqueId, avatar = '', chosenSect = null, level = null, forceMidMatch = false, bonusHp = 0 }) {
    const cleanUser = sanitizeUserName(user);
    const key = (uniqueId || cleanUser.toLowerCase().replace(/\s+/g, '_')).slice(0, 40);
    const sectKey = chosenSect && SECTS[chosenSect] ? chosenSect : this.pickBalancedSect();
    const sect = SECTS[sectKey];

    let hero = state.matchHeroes.get(key);
    if (hero) {
      // Nếu đã ở trên võ đài
      if (chosenSect && SECTS[chosenSect] && state.phase === 'registration') {
        hero.sect = sectKey;
        hero.weapon = sect.weapon;
        hero.weaponType = sect.weaponType;
        hero.maxHp = sect.baseHp + bonusHp;
        hero.hp = hero.maxHp;
      } else if (forceMidMatch) {
        if (!hero.alive) {
          hero.alive = true;
          hero.hp = Math.round(hero.maxHp * 0.85);
        } else {
          hero.maxHp += bonusHp || 20;
          hero.hp = Math.min(hero.maxHp, hero.hp + (bonusHp || 20));
        }
      }
      if (avatar) hero.avatar = avatar;
      return { hero, queued: false, changed: true };
    }

    // Nếu đang giao đấu & không dùng Quà Vào Đấu -> cho vào hàng đợi trận sau
    if (state.phase === 'fighting' && !forceMidMatch && state.matchHeroes.size >= 8) {
      const existsInQueue = state.waitingQueue.find((q) => q.uniqueId === key);
      if (!existsInQueue) {
        state.waitingQueue.push({
          user: cleanUser,
          uniqueId: key,
          avatar,
          chosenSect: sectKey,
          level: level || (8 + Math.floor(Math.random() * 20))
        });
      } else if (chosenSect && SECTS[chosenSect]) {
        existsInQueue.chosenSect = sectKey;
      }
      broadcastNotification('wuxia.state', getPublicState());
      return { hero: null, queued: true };
    }

    // Tạo anh hùng mới trên võ đài
    const ang = Math.random() * Math.PI * 2;
    const dist = state.phase === 'registration' ? 10.2 : 6 + Math.random() * 6;
    const team = state.matchHeroes.size % 2 === 0 ? 'red' : 'blue';
    const maxHp = sect.baseHp + bonusHp;

    hero = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: cleanUser,
      uniqueId: key,
      avatar,
      sect: sectKey,
      weapon: sect.weapon,
      weaponType: sect.weaponType,
      team,
      x: Math.cos(ang) * dist,
      z: Math.sin(ang) * dist,
      rotY: Math.atan2(-Math.cos(ang), -Math.sin(ang)),
      vx: 0,
      vz: 0,
      hp: maxHp,
      maxHp,
      shield: 0,
      atk: sect.baseAtk,
      kills: 0,
      totalKills: state.hallOfFame[key]?.kills || 0,
      level: level || (10 + Math.floor(Math.random() * 22)),
      alive: true,
      attackCd: Math.random() * 0.6,
      targetId: null,
      speechText: '',
      speechUntil: 0,
      buffs: {
        shieldUntil: 0,
        rageUntil: 0,
        giantUntil: 0,
        thanvoUntil: 0,
        fleeUntil: 0
      }
    };

    state.matchHeroes.set(key, hero);
    if (state.phase === 'registration') {
      this.arrangeRegistrationCircle();
    }

    const event = pushEventLog({
      type: 'join',
      fighter: serializeHero(hero),
      sectName: sect.name,
      weapon: sect.weapon,
      ttsText: state.phase === 'registration' ? '' : `${cleanUser} cầm ${sect.weapon} nhảy thẳng lên võ đài!`
    });
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return { hero, queued: false, changed: true };
  },

  // Xử lý lệnh chat từ người xem
  handleComment(commentText, user, uniqueId, avatar = '', level = null) {
    const raw = sanitizeChatText(commentText);
    if (!raw || BAD_WORDS_RE.test(raw)) return null;

    const cleanUser = sanitizeUserName(user);
    const key = (uniqueId || cleanUser.toLowerCase().replace(/\s+/g, '_')).slice(0, 40);
    const lower = raw.toLowerCase();

    // Đẩy vào Chat Feed 30% dưới
    const existingHero = state.matchHeroes.get(key);
    const hof = state.hallOfFame[key];
    pushChatMessage({
      type: 'chat',
      user: cleanUser,
      uniqueId: key,
      avatar,
      level: level || existingHero?.level || (10 + (cleanUser.length % 20)),
      rankBadge: hof && hof.wins >= 1 ? '🏅 Cao Thủ' : '',
      text: raw
    });

    // Hiển thị bong bóng thoại trên đầu nhân vật nếu đang ở trên đài
    if (existingHero && existingHero.alive) {
      existingHero.speechText = raw.slice(0, 32);
      existingHero.speechUntil = Date.now() + 3800;
    }

    // 1. Kiểm tra chọn Môn Phái hoặc Binh Khí (kiếm, thương, đao, côn, cung, tiêu, quyền)
    let matchedSect = null;
    for (const sk of SECT_KEYS) {
      if (SECTS[sk].keywords.some((kw) => lower.includes(kw))) {
        matchedSect = sk;
        break;
      }
    }

    if (matchedSect) {
      const res = this.spawnHeroOnArena({ user: cleanUser, uniqueId: key, avatar, chosenSect: matchedSect, level });
      if (res.hero && state.phase === 'fighting') {
        this.triggerManualBoost(res.hero, 'attack');
      }
      return res;
    }

    // 2. Lệnh tham gia / chiến / đánh / join
    if (
      lower === 'chiến' || lower === 'chien' || lower === 'đánh' || lower === 'danh' ||
      lower === 'join' || lower === 'pk' || lower === 'đấu' || lower === 'dau' ||
      lower.includes('lên đài') || lower.includes('tham gia') || lower.startsWith('chiến') || lower.startsWith('đánh')
    ) {
      const res = this.spawnHeroOnArena({ user: cleanUser, uniqueId: key, avatar, level });
      if (res.hero && state.phase === 'fighting') {
        this.triggerManualBoost(res.hero, 'attack');
      }
      return res;
    }

    // 3. Lệnh chạy / né (như "ZennyLu: chạy" trong ảnh mẫu 2!)
    if (lower.includes('chạy') || lower.includes('chay') || lower.includes('né') || lower.includes('ne')) {
      if (existingHero && existingHero.alive) {
        existingHero.buffs.fleeUntil = Date.now() + 3000;
        broadcastNotification('wuxia.event', {
          event: { type: 'flee', fighterId: existingHero.uniqueId, user: existingHero.user }
        });
      }
      return { action: 'flee' };
    }

    // 4. Lệnh chém / chưởng / bạo kích / hồi máu
    if (lower.includes('hồi máu') || lower.includes('hoi mau') || lower.includes('buff')) {
      if (existingHero && existingHero.alive) {
        this.applyHeal(existingHero, 35);
      }
      return { action: 'heal' };
    }

    if (existingHero && existingHero.alive && state.phase === 'fighting') {
      this.triggerManualBoost(existingHero, 'attack');
    }

    return { action: 'chat' };
  },

  triggerManualBoost(hero, type) {
    if (!hero || !hero.alive) return;
    if (type === 'attack') {
      hero.attackCd = Math.min(hero.attackCd, 0.05);
    }
  },

  applyHeal(hero, amount) {
    if (!hero || !hero.alive) return;
    const healed = Math.min(hero.maxHp - hero.hp, amount);
    hero.hp = Math.min(hero.maxHp, hero.hp + amount);
    broadcastNotification('wuxia.event', {
      event: {
        type: 'heal',
        fighterId: hero.uniqueId,
        user: hero.user,
        x: hero.x,
        z: hero.z,
        amount: Math.max(10, Math.round(healed || amount))
      }
    });
  },

  // 4 KỸ NĂNG TẶNG QUÀ (HOA HỒNG • GG • HỘP QUÀ BÓNG BAY • THẢ TIM)
  applyGiftSkill({ user, uniqueId, avatar = '', skillId = 'rose', giftName = null, coins = 1, repeatCount = 1 }) {
    const cleanUser = sanitizeUserName(user);
    const key = (uniqueId || cleanUser.toLowerCase().replace(/\s+/g, '_')).slice(0, 40);
    const count = Math.max(1, Number(repeatCount) || 1);

    // Ánh xạ tên quà thực tế từ TikTok Live hoặc coin sang 4 kỹ năng chính
    let resolvedSkill = GIFT_SKILLS[skillId];
    if (!resolvedSkill) {
      const gLower = String(giftName || '').toLowerCase();
      if (gLower.includes('hoa hồng') || gLower.includes('rose')) {
        resolvedSkill = GIFT_SKILLS.rose;
      } else if (gLower === 'gg' || gLower.includes(' gg')) {
        resolvedSkill = GIFT_SKILLS.gg;
      } else if (gLower.includes('bóng bay') || gLower.includes('hộp quà') || gLower.includes('gift box') || gLower.includes('balloon')) {
        resolvedSkill = GIFT_SKILLS.giftbox;
      } else if (gLower.includes('thả tim') || gLower.includes('heart')) {
        resolvedSkill = GIFT_SKILLS.heart_hands;
      } else if (coins >= 100) {
        resolvedSkill = Math.random() < 0.5 ? GIFT_SKILLS.giftbox : GIFT_SKILLS.heart_hands;
      } else {
        resolvedSkill = GIFT_SKILLS.rose;
      }
    }

    const displayGift = giftName || resolvedSkill.giftName;
    state.totalGifts += count;

    pushChatMessage({
      type: 'gift',
      user: cleanUser,
      uniqueId: key,
      avatar,
      giftIcon: resolvedSkill.icon,
      iconImg: resolvedSkill.iconImg,
      giftName: displayGift,
      skillLabel: resolvedSkill.label,
      combo: count,
      color: resolvedSkill.color
    });

    // Đảm bảo anh hùng xuất hiện trên võ đài
    let hero = state.matchHeroes.get(key);
    if (!hero) {
      const spawned = this.spawnHeroOnArena({
        user: cleanUser,
        uniqueId: key,
        avatar,
        forceMidMatch: true,
        bonusHp: resolvedSkill.id === 'rose' ? 20 * count : 0
      });
      hero = spawned.hero;
    }

    const now = Date.now();
    let ttsText = '';
    let vfxType = resolvedSkill.id;

    if (hero) {
      switch (resolvedSkill.id) {
        case 'rose': {
          const hpBonus = 20 * count;
          if (!hero.alive) {
            hero.alive = true;
            hero.hp = Math.min(hero.maxHp, 120 + hpBonus);
          } else {
            hero.maxHp += hpBonus;
            hero.hp = Math.min(hero.maxHp, hero.hp + hpBonus);
          }
          break;
        }
        case 'gg': {
          const healVal = 120 * count;
          if (!hero.alive) {
            hero.alive = true;
            hero.hp = Math.min(hero.maxHp, healVal);
          } else {
            hero.hp = Math.min(hero.maxHp, hero.hp + healVal);
          }
          hero.buffs.rageUntil = Math.max(hero.buffs.rageUntil, now) + 6000;
          this.applyHeal(hero, healVal);
          vfxType = 'heal';
          break;
        }
        case 'giftbox': {
          if (!hero.alive) {
            hero.alive = true;
            hero.hp = hero.maxHp;
          }
          hero.maxHp += 220;
          hero.hp = Math.min(hero.maxHp, hero.hp + 250);
          hero.shield = Math.min(500, hero.shield + 180 * count);
          hero.buffs.shieldUntil = Math.max(hero.buffs.shieldUntil, now) + 14000;
          hero.buffs.giantUntil = Math.max(hero.buffs.giantUntil, now) + 18000;
          this.applyAoEShockwave(hero, 6.0, 45, 'Hộp Quà Khổng Lồ Chấn Địa');
          ttsText = `${hero.user} tặng Hộp quà bóng bay, hóa thân Khổng Lồ kèm Kim Chung Tráo hộ thể!`;
          vfxType = 'giant';
          break;
        }
        case 'heart_hands': {
          hero.alive = true;
          hero.maxHp += 260;
          hero.hp = hero.maxHp;
          hero.shield = Math.min(500, hero.shield + 220);
          hero.buffs.shieldUntil = now + 15000;
          hero.buffs.thanvoUntil = now + 20000;
          const sectInfo = SECTS[hero.sect] || SECTS.vodang;
          this.applyAoEShockwave(hero, 8.5, 68, `Thần Võ • ${sectInfo.ultimate}`);
          ttsText = `Kinh thiên động địa! ${hero.user} Thả Tim Hồi Sinh & giáng lâm Thần Võ, thi triển ${sectInfo.ultimate}!`;
          vfxType = 'thanvo';
          break;
        }
      }
    }

    const event = pushEventLog({
      type: 'giftSkill',
      skillId: vfxType,
      giftId: resolvedSkill.id,
      skillLabel: resolvedSkill.label,
      giftIcon: resolvedSkill.icon,
      iconImg: resolvedSkill.iconImg,
      giftName: displayGift,
      combo: count,
      user: cleanUser,
      uniqueId: key,
      avatar,
      fighter: hero ? serializeHero(hero) : null,
      ttsText
    });

    saveState();
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  applyAoEShockwave(attacker, radius, dmg, skillName) {
    // Khi Boss đang xuất hiện: toàn võ lâm ĐÌNH CHIẾN (không gây sát thương đồng đội, dồn toàn lực sát thương vào Boss!)
    if (state.boss && state.boss.alive) {
      this.dealDamageToBoss(attacker, dmg * 1.9, skillName);
      return;
    }
    for (const target of state.matchHeroes.values()) {
      if (!target.alive || target.uniqueId === attacker.uniqueId) continue;
      const dist = Math.hypot(target.x - attacker.x, target.z - attacker.z);
      if (dist <= radius) {
        this.dealDamage(attacker, target, dmg, true, skillName);
      }
    }
  },

  // Thả Tim (Like) -> Giảm mục tiêu Ma Đấu Boss
  handleLike({ user, uniqueId, avatar = '', count = 1 }) {
    const cleanUser = sanitizeUserName(user);
    const n = Math.max(1, Math.min(50, Number(count) || 1));
    state.totalLikes += n;
    state.maDauRemaining = Math.max(0, state.maDauRemaining - n);

    // Gửi thông báo thích phiên live thỉnh thoảng để chat gọn đẹp
    if (Math.random() < 0.35 || n >= 5) {
      pushChatMessage({
        type: 'like',
        user: cleanUser,
        avatar,
        count: n,
        text: 'đã thích phiên LIVE'
      });
    }

    // Nếu tim đạt mục tiêu -> Triệu hồi Boss ngẫu nhiên ngay lập tức!
    if (state.maDauRemaining <= 0 && !state.boss && state.phase === 'fighting') {
      this.spawnMaDauBoss({ trigger: 'likes' });
    }

    return { maDauRemaining: state.maDauRemaining, totalLikes: state.totalLikes };
  },

  scheduleNextRandomBoss() {
    if (state.settings.randomBossEnabled === false) {
      state.nextBossInSec = null;
      return null;
    }
    const minSec = Math.max(10, Number(state.settings.bossMinIntervalSec) || 25);
    const maxSec = Math.max(minSec + 5, Number(state.settings.bossMaxIntervalSec) || 50);
    const delay = minSec + Math.random() * (maxSec - minSec);
    state.nextBossInSec = Math.round(delay);
    return state.nextBossInSec;
  },

  pickRandomBossTemplate(requestedType = null) {
    if (requestedType) {
      const found = BOSS_ROSTER.find((b) => b.type === requestedType);
      if (found) return found;
    }
    const pool = BOSS_ROSTER.filter((b) => b.type !== state.lastBossType);
    const candidates = pool.length ? pool : BOSS_ROSTER;
    return candidates[Math.floor(Math.random() * candidates.length)];
  },

  spawnMaDauBoss(options = {}) {
    if (state.boss && state.boss.alive) {
      return serializeBoss(state.boss);
    }

    // Nếu host triệu hồi thủ công khi đang ở pha ghi danh mà đã có >= 2 anh hùng -> vào chiến luôn
    if (state.phase === 'registration' && state.matchHeroes.size >= 2) {
      this.startFightingPhase();
    }

    const template = this.pickRandomBossTemplate(options.bossType || null);
    state.lastBossType = template.type;
    state.maDauRemaining = 0;
    state.nextBossInSec = null;
    state.bossCeasefireUntil = 0;
    state.bossResumePending = false;

    const aliveCount = Math.max(2, Array.from(state.matchHeroes.values()).filter((h) => h.alive).length);
    const scaledMaxHp = Math.round(template.baseHp + aliveCount * template.hpPerHero);

    // Xóa cờ fallenToBoss cũ và đẩy nhẹ các anh hùng ra vòng ngoài tâm Bát Quái để Boss giáng lâm hoành tráng
    for (const h of state.matchHeroes.values()) {
      h.fallenToBoss = false;
      if (h.alive) {
        const d = Math.hypot(h.x, h.z);
        if (d < 4.2) {
          const ang = d > 0.05 ? Math.atan2(h.z, h.x) : Math.random() * Math.PI * 2;
          h.x = Math.cos(ang) * 5.2;
          h.z = Math.sin(ang) * 5.2;
          this.clampToArena(h);
        }
      }
    }

    state.boss = {
      id: `boss_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      bossType: template.type,
      user: template.user,
      title: template.title,
      skillName: template.skillName,
      weaponStyle: template.weaponStyle,
      colors: template.colors,
      uniqueId: 'ma_dau_boss',
      x: 0,
      z: 0,
      rotY: 0,
      hp: scaledMaxHp,
      maxHp: scaledMaxHp,
      atk: template.atk,
      aoeDmg: template.aoeDmg,
      aoeRadius: template.aoeRadius,
      attackCd: 1.2,
      aoeCd: 4.8,
      enraged: false,
      alive: true,
      damageByHero: new Map(),
      fallenHeroes: new Set(),
      trigger: options.trigger || 'manual',
      spawnedAt: Date.now()
    };

    const serialized = serializeBoss(state.boss);
    const event = pushEventLog({
      type: 'bossSpawn',
      boss: serialized,
      trigger: state.boss.trigger,
      ttsText: template.announce
    });
    pushChatMessage({
      type: 'system',
      user: '👹 BOSS GIÁNG LÂM',
      text: `${template.user} (${scaledMaxHp} HP) đã xuất hiện! Toàn võ lâm TẠM ĐÌNH CHIẾN, cùng hợp lực đánh Boss!`
    });
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return serialized;
  },

  dealDamage(attacker, target, rawDmg, isCrit = false, skillName = null) {
    if (!target.alive) return;
    const now = Date.now();
    let dmg = Math.max(8, Math.round(rawDmg));

    // Hấp thụ sát thương bằng Kim Chung Tráo
    let blocked = 0;
    if (target.shield > 0 && target.buffs.shieldUntil > now) {
      blocked = Math.min(target.shield, dmg);
      target.shield -= blocked;
      dmg -= blocked;
    }

    target.hp = Math.max(0, target.hp - dmg);

    // Đẩy lùi vật lý
    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    const len = Math.hypot(dx, dz) || 1;
    const knock = isCrit ? 1.4 : 0.65;
    target.x += (dx / len) * knock;
    target.z += (dz / len) * knock;
    this.clampToArena(target);

    let isKill = false;
    const isBossAttack = attacker.uniqueId === 'ma_dau_boss';
    if (target.hp <= 0) {
      target.alive = false;
      isKill = true;
      if (isBossAttack) {
        // Đánh dấu bị Boss hạ gục để hồi sinh cùng mọi người quay lại tỉ thí sau khi Boss chết
        target.fallenToBoss = true;
        if (state.boss && state.boss.fallenHeroes) {
          state.boss.fallenHeroes.add(target.uniqueId);
        }
      } else {
        attacker.kills += 1;
        attacker.totalKills += 1;
        state.totalKills += 1;

        // Cập nhật Hall of Fame kill counts
        if (!state.hallOfFame[attacker.uniqueId]) {
          state.hallOfFame[attacker.uniqueId] = {
            user: attacker.user,
            uniqueId: attacker.uniqueId,
            wins: 0,
            kills: 0,
            sect: attacker.sect
          };
        }
        state.hallOfFame[attacker.uniqueId].kills += 1;
      }
    }

    const sect = SECTS[attacker.sect] || SECTS.vodang;
    broadcastNotification('wuxia.event', {
      event: {
        type: 'attack',
        attackerId: attacker.uniqueId,
        attackerUser: attacker.user,
        attackerSect: attacker.sect || 'minhgiao',
        weaponType: attacker.weaponType || 'dao',
        ranged: !isBossAttack && Boolean(sect.ranged),
        projectileType: isBossAttack ? null : (sect.projectileType || null),
        fromX: +attacker.x.toFixed(2),
        fromZ: +attacker.z.toFixed(2),
        targetId: target.uniqueId,
        targetUser: target.user,
        toX: +target.x.toFixed(2),
        toZ: +target.z.toFixed(2),
        damage: dmg,
        blocked,
        isCrit,
        isKill,
        bossAttack: isBossAttack,
        bossGlow: isBossAttack ? (attacker.colors?.glow || '#ff3b1f') : null,
        attackerKills: attacker.kills || 0,
        skillName: skillName || sect.weapon
      }
    });

    if (isKill && !isBossAttack) {
      const killEvt = pushEventLog({
        type: 'kill',
        killerId: attacker.uniqueId,
        killerUser: attacker.user,
        killerSect: attacker.sect || 'minhgiao',
        killerKills: attacker.kills || 1,
        killerTotalKills: attacker.totalKills || attacker.kills || 1,
        victimUser: target.user,
        victimId: target.uniqueId,
        ttsText: attacker.kills >= 3 ? `${attacker.user} liên trảm ${attacker.kills} mạng trên võ đài!` : ''
      });
      broadcastNotification('wuxia.event', { event: killEvt, state: getPublicState() });
    }
  },

  addHallOfFameKills(hero, bonusKills) {
    if (!hero || bonusKills <= 0) return;
    if (!state.hallOfFame[hero.uniqueId]) {
      state.hallOfFame[hero.uniqueId] = {
        user: hero.user,
        uniqueId: hero.uniqueId,
        wins: 0,
        kills: 0,
        sect: hero.sect
      };
    }
    state.hallOfFame[hero.uniqueId].kills += bonusKills;
  },

  triggerBossAoE(boss, aliveHeroes) {
    if (!boss || !boss.alive || aliveHeroes.length === 0) return;
    const radius = boss.aoeRadius || 7.2;
    const baseDmg = boss.aoeDmg * (boss.enraged ? 1.25 : 1.0);
    let hitCount = 0;

    for (const h of aliveHeroes) {
      if (!h.alive) continue;
      const dist = Math.hypot(h.x - boss.x, h.z - boss.z);
      if (dist <= radius) {
        hitCount += 1;
        this.dealDamage(boss, h, baseDmg * (0.85 + Math.random() * 0.3), true, boss.skillName);
      }
    }

    broadcastNotification('wuxia.event', {
      event: {
        type: 'bossAoE',
        bossName: boss.user,
        skillName: boss.skillName,
        x: +boss.x.toFixed(2),
        z: +boss.z.toFixed(2),
        radius,
        hitCount,
        color: boss.colors?.glow || '#ff3b1f'
      }
    });
  },

  reviveFallenBossHeroes(hpRatio = 0.55) {
    let revived = 0;
    for (const h of state.matchHeroes.values()) {
      if (!h.alive && h.fallenToBoss) {
        h.alive = true;
        h.fallenToBoss = false;
        h.hp = Math.max(60, Math.round(h.maxHp * hpRatio));
        h.attackCd = 0.8;
        revived += 1;
      }
    }
    return revived;
  },

  spreadHeroesForPvpResume(centerX = 0, centerZ = 0) {
    const alive = Array.from(state.matchHeroes.values()).filter((h) => h.alive);
    alive.forEach((h, idx) => {
      const dx = h.x - centerX;
      const dz = h.z - centerZ;
      const d = Math.hypot(dx, dz);
      if (d < 4.5) {
        const ang = d > 0.05 ? Math.atan2(dz, dx) : (idx / Math.max(1, alive.length)) * Math.PI * 2;
        h.x = centerX + Math.cos(ang) * 5.6;
        h.z = centerZ + Math.sin(ang) * 5.6;
        this.clampToArena(h);
      }
      h.attackCd = Math.max(h.attackCd, 0.5);
    });
  },

  handleBossEscape() {
    const boss = state.boss;
    if (!boss) return;
    const bossName = boss.user;
    const bx = boss.x;
    const bz = boss.z;
    boss.alive = false;
    state.boss = null;
    state.maDauRemaining = state.maDauTarget;

    this.reviveFallenBossHeroes(0.65);
    this.spreadHeroesForPvpResume(bx, bz);
    state.bossCeasefireUntil = Date.now() + 2400;
    state.bossResumePending = true;
    this.scheduleNextRandomBoss();

    const evt = pushEventLog({
      type: 'bossEscaped',
      bossName,
      ttsText: `${bossName} quá hung hãn đã càn quét võ đài rồi rút lui! Các hiệp khách mau hồi phục quay lại tỉ thí!`
    });
    pushChatMessage({
      type: 'system',
      user: 'VÕ ĐÀI',
      text: `💨 ${bossName} đã rời võ đài! Toàn thể anh hùng hồi sinh quay lại tỉ thí!`
    });
    broadcastNotification('wuxia.event', { event: evt, state: getPublicState() });
  },

  dealDamageToBoss(attacker, rawDmg, skillName = null) {
    const boss = state.boss;
    if (!boss || !boss.alive) return;
    const dmg = Math.max(12, Math.round(rawDmg));
    boss.hp = Math.max(0, boss.hp - dmg);

    // Ghi nhận sát thương đóng góp của từng hiệp khách lên Boss
    const prevRec = boss.damageByHero.get(attacker.uniqueId);
    if (prevRec) {
      prevRec.damage += dmg;
      prevRec.user = attacker.user;
    } else {
      boss.damageByHero.set(attacker.uniqueId, {
        uniqueId: attacker.uniqueId,
        user: attacker.user,
        sect: attacker.sect,
        damage: dmg
      });
    }

    const sect = SECTS[attacker.sect] || SECTS.vodang;
    const isKill = boss.hp <= 0;

    broadcastNotification('wuxia.event', {
      event: {
        type: 'attack',
        attackerId: attacker.uniqueId,
        attackerUser: attacker.user,
        attackerSect: attacker.sect,
        weaponType: attacker.weaponType,
        ranged: Boolean(sect.ranged),
        projectileType: sect.projectileType || null,
        fromX: +attacker.x.toFixed(2),
        fromZ: +attacker.z.toFixed(2),
        targetId: boss.uniqueId,
        targetUser: boss.user,
        toX: +boss.x.toFixed(2),
        toZ: +boss.z.toFixed(2),
        damage: dmg,
        isCrit: dmg >= 35 || isKill,
        isKill,
        skillName: skillName || sect.weapon
      }
    });

    // Boss cuồng nộ khi tụt dưới 40% máu
    if (!isKill && !boss.enraged && boss.hp <= boss.maxHp * 0.4) {
      boss.enraged = true;
      boss.aoeCd = 0.4;
      const enrageEvt = pushEventLog({
        type: 'bossEnrage',
        bossName: boss.user,
        skillName: boss.skillName,
        x: +boss.x.toFixed(2),
        z: +boss.z.toFixed(2),
        color: boss.colors?.glow || '#ff3b1f',
        ttsText: `${boss.user} đã nổi cuồng nộ, chuẩn bị thi triển ${boss.skillName}!`
      });
      pushChatMessage({
        type: 'system',
        user: '⚠️ BOSS CUỒNG NỘ',
        text: `${boss.user} máu dưới 40% — BẠO PHÁT CUỒNG NỘ!`
      });
      broadcastNotification('wuxia.event', { event: enrageEvt, state: getPublicState() });
    }

    if (isKill) {
      const now = Date.now();
      const bossName = boss.user;
      const bossPos = { x: +boss.x.toFixed(2), z: +boss.z.toFixed(2) };
      const bossColors = boss.colors || { glow: '#ff3b1f', accent: '#fde047' };
      const topDamage = getBossDamageTop(boss, 3);
      const mvpEntry = topDamage[0] || null;
      const mvpHero = mvpEntry ? state.matchHeroes.get(mvpEntry.uniqueId) : null;

      boss.alive = false;
      state.boss = null;
      state.maDauRemaining = state.maDauTarget;

      // 1. Thưởng người tung đòn kết liễu Boss (+3 Hạ Gục + Hồi đầy máu)
      const isSameMvp = mvpHero && mvpHero.uniqueId === attacker.uniqueId;
      const slayerBonus = isSameMvp ? 4 : 3;
      attacker.kills += slayerBonus;
      attacker.totalKills += slayerBonus;
      state.totalKills += slayerBonus;
      this.addHallOfFameKills(attacker, slayerBonus);
      attacker.hp = attacker.maxHp;
      if (isSameMvp) {
        attacker.shield = Math.min(500, attacker.shield + 160);
        attacker.buffs.shieldUntil = Math.max(attacker.buffs.shieldUntil, now) + 8000;
      }

      // 2. Thưởng MVP Top Sát Thương Boss (+2 Hạ Gục + Khiên Kim Chung Tráo 8s)
      if (mvpHero && !isSameMvp) {
        mvpHero.kills += 2;
        mvpHero.totalKills += 2;
        state.totalKills += 2;
        this.addHallOfFameKills(mvpHero, 2);
        mvpHero.alive = true;
        mvpHero.fallenToBoss = false;
        mvpHero.hp = Math.min(mvpHero.maxHp, mvpHero.hp + Math.round(mvpHero.maxHp * 0.5));
        mvpHero.shield = Math.min(500, mvpHero.shield + 160);
        mvpHero.buffs.shieldUntil = Math.max(mvpHero.buffs.shieldUntil, now) + 8000;
      }

      // 3. Hồi phục +30% máu cho toàn thể anh hùng tham chiến & hồi sinh người bị Boss đánh gục để quay lại tỉ thí!
      for (const h of state.matchHeroes.values()) {
        if (h.alive && h.uniqueId !== attacker.uniqueId) {
          h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3));
        }
      }
      this.reviveFallenBossHeroes(0.5);
      this.spreadHeroesForPvpResume(bossPos.x, bossPos.z);

      // Nghỉ 2.6 giây ăn mừng rồi toàn võ lâm lập tức quay lại tỉ thí!
      state.bossCeasefireUntil = now + 2600;
      state.bossResumePending = true;
      this.scheduleNextRandomBoss();

      const mvpText = mvpHero && !isSameMvp
        ? ` Top sát thương: ${mvpHero.user} (${mvpEntry.damage} DMG, +2 hạ gục)!`
        : '';

      const evt = pushEventLog({
        type: 'bossDefeated',
        bossName,
        bossPos,
        bossColors,
        killerUser: attacker.user,
        killerId: attacker.uniqueId,
        killerKills: attacker.kills,
        slayerBonus,
        mvpUser: mvpHero ? mvpHero.user : attacker.user,
        mvpDamage: mvpEntry ? mvpEntry.damage : dmg,
        topDamage,
        ttsText: `Tuyệt thế anh hùng! ${attacker.user} đã kết liễu ${bossName}!${mvpText} Toàn võ lâm chuẩn bị quay lại tỉ thí!`
      });
      pushChatMessage({
        type: 'system',
        user: '🏆 HẠ BOSS',
        text: `${attacker.user} kết liễu ${bossName} (+${slayerBonus} hạ gục)!${mvpHero && !isSameMvp ? ` MVP: ${mvpHero.user} (${mvpEntry.damage} DMG).` : ''} Quay lại tỉ thí!`
      });
      saveState();
      broadcastNotification('wuxia.event', { event: evt, state: getPublicState() });
    }
  },

  clampToArena(entity) {
    const dist = Math.hypot(entity.x, entity.z);
    if (dist > ARENA_RADIUS) {
      entity.x = (entity.x / dist) * ARENA_RADIUS;
      entity.z = (entity.z / dist) * ARENA_RADIUS;
    }
  },

  // Bắt đầu giai đoạn Ghi Danh cho trận mới
  startRegistrationPhase() {
    state.round += 1;
    state.phase = 'registration';
    state.phaseTimer = REGISTRATION_DURATION;
    state.boss = null;
    state.nextBossInSec = null;
    state.bossCeasefireUntil = 0;
    state.bossResumePending = false;
    state.matchHeroes.clear();

    // Đưa toàn bộ người xem trong hàng chờ lên võ đài trước!
    while (state.waitingQueue.length > 0 && state.matchHeroes.size < MAX_HEROES_PER_MATCH) {
      const q = state.waitingQueue.shift();
      this.spawnHeroOnArena({
        user: q.user,
        uniqueId: q.uniqueId,
        avatar: q.avatar,
        chosenSect: q.chosenSect,
        level: q.level
      });
    }

    // Luôn để đương kim Võ Lâm Minh Chủ lên đài bảo vệ ngôi vị
    if (state.champion && !state.matchHeroes.has(state.champion.uniqueId)) {
      this.spawnHeroOnArena({
        user: state.champion.user,
        uniqueId: state.champion.uniqueId,
        chosenSect: state.champion.sect || 'thieulam',
        level: 25
      });
    }

    // Nếu ít anh hùng & bật autoFillBots, thêm dần các hiệp khách cho sôi động
    if (state.settings.autoFillBots) {
      const shuffled = [...DEMO_ROSTER].sort(() => Math.random() - 0.5);
      for (const bot of shuffled) {
        if (state.matchHeroes.size >= 11) break;
        if (!state.matchHeroes.has(bot.uniqueId)) {
          this.spawnHeroOnArena({
            user: bot.user,
            uniqueId: bot.uniqueId,
            chosenSect: bot.sect,
            level: bot.level
          });
        }
      }
    }

    this.arrangeRegistrationCircle();

    pushChatMessage({
      type: 'system',
      user: 'VÕ ĐÀI',
      text: `⚔️ TRẬN ${state.round} mở GHI DANH! Gõ "chiến" hoặc chọn binh khí: kiếm · thương · đao · côn · cung · tiêu · quyền`
    });
    broadcastNotification('wuxia.state', getPublicState());
  },

  // Bắt đầu giao đấu (chỉ tự thêm bot khi host bật autoFillBots)
  startFightingPhase() {
    if (state.matchHeroes.size < 2) {
      if (state.settings.autoFillBots) {
        this.ensureDemoHeroes(8);
      } else {
        state.phase = 'registration';
        state.phaseTimer = REGISTRATION_DURATION;
        broadcastNotification('wuxia.state', getPublicState());
        return;
      }
    }
    state.phase = 'fighting';
    state.phaseTimer = FIGHT_DURATION;
    state.boss = null;
    state.bossCeasefireUntil = 0;
    state.bossResumePending = false;
    this.scheduleNextRandomBoss();

    const event = pushEventLog({
      type: 'phaseChange',
      phase: 'fighting',
      round: state.round,
      ttsText: `Trận ${state.round} chính thức khai chiến! ${state.matchHeroes.size} vị anh hùng tranh đoạt ngôi Võ Lâm Minh Chủ!`
    });
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
  },

  // Xóa sạch toàn bộ dữ liệu cũ / Reset cho phiên livestream thật mới
  clearAllData() {
    state.round = 1;
    state.phase = 'registration';
    state.phaseTimer = REGISTRATION_DURATION;
    state.champion = null;
    state.hallOfFame = {};
    state.lastRoundTopKills = [];
    state.matchHeroes.clear();
    state.waitingQueue = [];
    state.boss = null;
    state.nextBossInSec = null;
    state.bossCeasefireUntil = 0;
    state.bossResumePending = false;
    state.recentChat = [];
    state.recentEvents = [];
    state.totalLikes = 0;
    state.totalKills = 0;
    state.totalGifts = 0;
    state.maDauRemaining = state.maDauTarget;
    saveState();
    broadcastNotification('wuxia.state', getPublicState());
    return getPublicState();
  },

  // Vinh danh Võ Lâm Minh Chủ cuối trận
  startCoronationPhase(winner) {
    state.phase = 'coronation';
    state.phaseTimer = CORONATION_DURATION;
    state.boss = null;
    state.nextBossInSec = null;
    state.bossCeasefireUntil = 0;
    state.bossResumePending = false;

    // Lưu top hạ gục cho bảng TRẬN VỪA RỒI ở vòng sau
    state.lastRoundTopKills = getMatchTopKills(3);

    if (winner) {
      if (!state.hallOfFame[winner.uniqueId]) {
        state.hallOfFame[winner.uniqueId] = {
          user: winner.user,
          uniqueId: winner.uniqueId,
          wins: 0,
          kills: 0,
          sect: winner.sect
        };
      }
      state.hallOfFame[winner.uniqueId].wins += 1;
      state.hallOfFame[winner.uniqueId].sect = winner.sect;

      state.champion = {
        user: winner.user,
        uniqueId: winner.uniqueId,
        avatar: winner.avatar || '',
        sect: winner.sect,
        weapon: winner.weapon,
        wins: state.hallOfFame[winner.uniqueId].wins,
        kills: winner.kills
      };

      const sectInfo = SECTS[winner.sect] || SECTS.vodang;
      const event = pushEventLog({
        type: 'coronation',
        round: state.round,
        champion: state.champion,
        ttsText: `Thiên hạ quy tâm! Chúc mừng đại hiệp ${winner.user} phái ${sectInfo.name} xuất sắc đăng quang VÕ LÂM MINH CHỦ trận ${state.round}!`
      });
      pushChatMessage({
        type: 'system',
        user: '👑 MINH CHỦ',
        text: `${winner.user} (${sectInfo.name}) đã đoạt ngôi VÕ LÂM MINH CHỦ trận ${state.round}!`
      });
      saveState();
      broadcastNotification('wuxia.event', { event, state: getPublicState() });
    } else {
      broadcastNotification('wuxia.state', getPublicState());
    }
  },

  ensureDemoHeroes(count = 11) {
    for (let i = 0; i < Math.min(count, DEMO_ROSTER.length); i++) {
      const bot = DEMO_ROSTER[i];
      if (!state.matchHeroes.has(bot.uniqueId)) {
        this.spawnHeroOnArena({
          user: bot.user,
          uniqueId: bot.uniqueId,
          chosenSect: bot.sect,
          level: bot.level,
          forceMidMatch: true
        });
      }
    }
  },

  // 10HZ AUTONOMOUS REAL-TIME COMBAT TICK
  tick(dt) {
    if (state.phase === 'registration') {
      // Chỉ bắt đầu đếm ngược khi có ít nhất 2 người xem thật lên võ đài!
      if (state.matchHeroes.size >= 2) {
        state.phaseTimer -= dt;
        if (state.phaseTimer <= 0) {
          this.startFightingPhase();
        }
      } else {
        state.phaseTimer = REGISTRATION_DURATION;
      }
      broadcastNotification('wuxia.tick', getCompactTick());
      return;
    }

    if (state.phase === 'coronation') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        this.startRegistrationPhase();
      }
      broadcastNotification('wuxia.tick', getCompactTick());
      return;
    }

    // PHASE: FIGHTING
    const now = Date.now();
    const bossActive = Boolean(state.boss && state.boss.alive);
    const inCeasefire = !bossActive && now < state.bossCeasefireUntil;

    // Khi kết thúc 2.6 giây nghỉ ăn mừng hạ Boss -> thông báo quay lại tỉ thí!
    if (state.bossResumePending && !bossActive && !inCeasefire) {
      state.bossResumePending = false;
      const resumeEvt = pushEventLog({
        type: 'pvpResumed',
        round: state.round,
        ttsText: 'Boss đã ngã xuống! Toàn võ lâm lập tức quay lại tỉ thí tranh ngôi Minh Chủ!'
      });
      pushChatMessage({
        type: 'system',
        user: '⚔️ TỈ THÍ TIẾP',
        text: 'Boss đã bị tiêu diệt — Các anh hùng lập tức quay ra tỉ thí tranh ngôi Võ Lâm Minh Chủ!'
      });
      broadcastNotification('wuxia.event', { event: resumeEvt, state: getPublicState() });
    }

    // Tạm dừng đồng hồ trận đấu trong lúc đang hợp lực đánh Boss để trận chiến không bị cắt ngang
    if (!bossActive && !inCeasefire) {
      state.phaseTimer -= dt;
    }

    const aliveHeroes = Array.from(state.matchHeroes.values()).filter((h) => h.alive);

    // Nếu Boss quét sạch toàn bộ anh hùng -> Boss rời đi & hồi sinh tất cả để tiếp tục tỉ thí
    if (bossActive && aliveHeroes.length === 0) {
      this.handleBossEscape();
      return;
    }

    // Kiểm tra điều kiện kết thúc trận đấu (chỉ xét khi KHÔNG đang đánh Boss hoặc đang nghỉ sau Boss)
    if (!bossActive && !inCeasefire && (aliveHeroes.length <= 1 || state.phaseTimer <= 0)) {
      const winner = aliveHeroes.length === 1
        ? aliveHeroes[0]
        : aliveHeroes.sort((a, b) => (b.kills - a.kills) || (b.hp - a.hp))[0] || null;
      this.startCoronationPhase(winner);
      return;
    }

    // Hệ thống triệu hồi BOSS NGẪU NHIÊN tự động khi đang giao đấu (cần >= 2 anh hùng còn sống và còn > 12s)
    if (!bossActive && !inCeasefire && aliveHeroes.length >= 2 && state.settings.randomBossEnabled !== false) {
      if (state.nextBossInSec === null) {
        this.scheduleNextRandomBoss();
      } else {
        state.nextBossInSec -= dt;
        if (state.nextBossInSec <= 0) {
          if (state.phaseTimer > 12) {
            this.spawnMaDauBoss({ trigger: 'random' });
          } else {
            state.nextBossInSec = null;
          }
        }
      }
    }

    // Cập nhật AI di chuyển & đánh nhau của từng anh hùng
    for (const hero of aliveHeroes) {
      if (!hero.alive) continue;
      // Kiểm tra trạng thái Boss động trong vòng lặp (tránh lỗi khi hiệp khách trước vừa kết liễu Boss trong cùng tick)
      const isRaidNow = Boolean(state.boss && state.boss.alive);
      const isCeasefireNow = !isRaidNow && now < state.bossCeasefireUntil;

      const sect = SECTS[hero.sect] || SECTS.vodang;
      const isRage = hero.buffs.rageUntil > now;
      const isGiant = hero.buffs.giantUntil > now;
      const isThanVo = hero.buffs.thanvoUntil > now;
      const isFlee = hero.buffs.fleeUntil > now;

      // Khoảng nghỉ 2.6s ngay sau khi hạ Boss: tản nhẹ ra vòng ngoài chuẩn bị quay lại tỉ thí
      if (isCeasefireNow) {
        const dCenter = Math.hypot(hero.x, hero.z) || 0.01;
        const desiredR = 7.2;
        const pushOut = dCenter < desiredR ? 2.4 : -0.6;
        const nx = hero.x / dCenter;
        const nz = hero.z / dCenter;
        const vx = (nx * pushOut - nz * 1.4);
        const vz = (nz * pushOut + nx * 1.4);
        hero.vx = vx;
        hero.vz = vz;
        hero.x += vx * dt;
        hero.z += vz * dt;
        this.clampToArena(hero);
        hero.rotY = Math.atan2(-hero.x, -hero.z);
        continue;
      }

      // Tìm mục tiêu: Khi có Boss -> 100% TOÀN BỘ anh hùng trên võ đài ĐÌNH CHIẾN và dồn vào đánh Boss!
      let target = null;
      let minDist = Infinity;

      if (isRaidNow) {
        target = state.boss;
        minDist = Math.hypot(state.boss.x - hero.x, state.boss.z - hero.z);
      } else {
        for (const other of aliveHeroes) {
          if (other.uniqueId === hero.uniqueId) continue;
          const d = Math.hypot(other.x - hero.x, other.z - hero.z);
          if (d < minDist) {
            minDist = d;
            target = other;
          }
        }
      }

      if (!target) continue;

      const dx = target.x - hero.x;
      const dz = target.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;

      const moveSpeed = sect.speed * (isRage ? 1.35 : 1.0) * (isFlee ? 1.45 : 1.0) * (isGiant ? 0.85 : 1.0);
      const bossRangeBonus = isRaidNow ? 1.15 : 0;
      const effectiveRange = sect.range * (isGiant ? 1.35 : 1.0) + bossRangeBonus;

      let vx = 0;
      let vz = 0;

      if (isFlee) {
        // Chạy né khỏi đối thủ!
        vx = -nx * moveSpeed;
        vz = -nz * moveSpeed;
      } else if (sect.ranged && dist < (isRaidNow ? 5.6 : 4.5)) {
        // Cung thủ / Đường Môn giữ khoảng cách (kite)
        vx = (-nx * 0.75 + -nz * 0.65) * moveSpeed;
        vz = (-nz * 0.75 + nx * 0.65) * moveSpeed;
      } else if (dist > effectiveRange * 0.88) {
        // Tiến lại gần mục tiêu với một chút lạng lách
        const strafe = Math.sin(now * 0.002 + hero.level) * 0.25;
        vx = (nx - nz * strafe) * moveSpeed;
        vz = (nz + nx * strafe) * moveSpeed;
      } else {
        // Đứng trong tầm đánh -> xoay lách nhẹ bao vây mục tiêu
        const orbit = (hero.level % 2 === 0 ? 1 : -1) * (isRaidNow ? 0.52 : 0.35);
        vx = -nz * orbit * moveSpeed;
        vz = nx * orbit * moveSpeed;
      }

      // Lực đẩy nhẹ tránh dính chồng vào nhau
      for (const other of aliveHeroes) {
        if (other.uniqueId === hero.uniqueId) continue;
        const ox = hero.x - other.x;
        const oz = hero.z - other.z;
        const od = Math.hypot(ox, oz);
        if (od > 0.01 && od < 1.95) {
          const push = (1.95 - od) * 3.1;
          vx += (ox / od) * push;
          vz += (oz / od) * push;
        }
      }

      hero.vx = vx;
      hero.vz = vz;
      hero.x += vx * dt;
      hero.z += vz * dt;
      this.clampToArena(hero);

      // Hướng mặt về phía mục tiêu (hoặc hướng chạy nếu đang flee)
      hero.rotY = isFlee ? Math.atan2(vx, vz) : Math.atan2(dx, dz);

      // Tấn công nếu hết cooldown và trong tầm vũ khí
      hero.attackCd -= dt * (isRage || isThanVo ? 1.65 : 1.0);
      if (!isFlee && hero.attackCd <= 0 && dist <= effectiveRange + 0.5) {
        hero.attackCd = sect.cooldown * (0.85 + Math.random() * 0.3);
        const isCrit = Math.random() < (isRage || isThanVo ? 0.45 : 0.2);
        let dmg = hero.atk * (0.7 + Math.random() * 0.55);
        if (isCrit) dmg *= 1.55;
        if (isRage) dmg *= 1.45;
        if (isGiant) dmg *= 1.35;
        if (isThanVo) dmg *= 1.5;

        if (target.uniqueId === 'ma_dau_boss') {
          this.dealDamageToBoss(hero, dmg);
        } else {
          this.dealDamage(hero, target, dmg, isCrit);
        }
      }
    }

    // Cập nhật AI của World Boss (truy kích + đánh đơn + tung Tuyệt Kỹ AoE đẩy lùi)
    if (state.boss && state.boss.alive) {
      const boss = state.boss;
      const survivors = Array.from(state.matchHeroes.values()).filter((h) => h.alive);
      if (survivors.length > 0) {
        let nearest = survivors[0];
        let bestD = Infinity;
        for (const h of survivors) {
          const d = Math.hypot(h.x - boss.x, h.z - boss.z);
          if (d < bestD) {
            bestD = d;
            nearest = h;
          }
        }
        const dx = nearest.x - boss.x;
        const dz = nearest.z - boss.z;
        const dist = Math.hypot(dx, dz) || 1;
        boss.rotY = Math.atan2(dx, dz);
        const bossSpeed = boss.enraged ? 3.5 : 2.7;
        if (dist > 3.1) {
          boss.x += (dx / dist) * bossSpeed * dt;
          boss.z += (dz / dist) * bossSpeed * dt;
          this.clampToArena(boss);
        }

        // Đánh đơn cận chiến
        boss.attackCd -= dt * (boss.enraged ? 1.25 : 1.0);
        if (boss.attackCd <= 0 && dist <= 4.3) {
          boss.attackCd = 1.65;
          this.dealDamage(
            boss,
            nearest,
            boss.atk * (0.8 + Math.random() * 0.35),
            boss.enraged || Math.random() < 0.35,
            boss.skillName
          );
        }

        // Tuyệt kỹ AoE quét xung quanh Boss
        boss.aoeCd -= dt;
        if (boss.aoeCd <= 0) {
          boss.aoeCd = boss.enraged ? 4.2 : 6.0;
          this.triggerBossAoE(boss, survivors);
        }
      }
    }

    broadcastNotification('wuxia.tick', getCompactTick());
  },

  updateSettings(newSettings = {}) {
    state.settings = {
      ...state.settings,
      ...newSettings,
      graphics3D: {
        ...state.settings.graphics3D,
        ...(newSettings.graphics3D || {})
      }
    };
    if (typeof newSettings.autoSim === 'boolean') {
      configureAutoSim(newSettings.autoSim);
    }
    if (
      typeof newSettings.randomBossEnabled === 'boolean' ||
      newSettings.bossMinIntervalSec !== undefined ||
      newSettings.bossMaxIntervalSec !== undefined
    ) {
      if (state.settings.randomBossEnabled === false) {
        state.nextBossInSec = null;
      } else if (state.phase === 'fighting' && !state.boss) {
        this.scheduleNextRandomBoss();
      }
    }
    saveState();
    broadcastNotification('wuxia.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 7. TIKTOK LIVE CONNECTOR (DỮ LIỆU THẬT TIKTOK LIVE v2.1.0)
// ============================================================================
let tiktokConn = null;
const giftComboTracker = new Map();

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) throw new Error('Vui lòng nhập @username hoặc link TikTok Live');
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) return directMatch[1];
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow' });
      const resolvedMatch = (resp.url || '').match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) return resolvedMatch[1];
    } catch (e) {
      console.warn('[TikTok URL Resolve]', e.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUser(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Hiệp Khách';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) throw new Error('Không tìm thấy @username hợp lệ');

  if (tiktokConn) {
    try { await tiktokConn.disconnect(); } catch (_) {}
    tiktokConn = null;
  }

  state.settings.tiktokUsername = cleanUser;
  saveState();

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('tiktok.status', state.tiktok);
  broadcastNotification('wuxia.state', getPublicState());

  console.log(`[TikTok Live] Đang kết nối dữ liệu thật tới @${cleanUser}...`);

  tiktokConn = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Đã kết nối phòng @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('tiktok.status', state.tiktok);
    broadcastNotification('wuxia.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('tiktok.status', state.tiktok);
    broadcastNotification('wuxia.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    state.tiktok.lastError = err?.message || String(err);
    console.warn('[TikTok Live Warning]', state.tiktok.lastError);
    broadcastNotification('tiktok.status', state.tiktok);
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (d) => {
    const viewerCount = Number(d?.total ?? d?.viewerCount ?? 0);
    if (viewerCount >= 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('tiktok.status', state.tiktok);
    }
  });

  tiktokConn.on(WebcastEvent.CHAT, (d) => {
    const { user, uniqueId, avatar } = extractUser(d);
    const commentText = d?.content || d?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    WuxiaArena.handleComment(commentText, user, uniqueId, avatar);
  });

  tiktokConn.on(WebcastEvent.LIKE, (d) => {
    const { user, uniqueId, avatar } = extractUser(d);
    const count = Math.max(1, Number(d?.count ?? d?.likeCount ?? 1));
    WuxiaArena.handleLike({ user, uniqueId, avatar, count });
  });

  tiktokConn.on(WebcastEvent.GIFT, (d) => {
    const { user, uniqueId, avatar } = extractUser(d);
    const giftObj = d?.gift || d?.giftDetails || {};
    const giftId = String(d?.giftId || giftObj?.id || 'rose');
    const groupId = String(d?.groupId || `${uniqueId}_${giftId}`);
    const repeatCount = Math.max(1, Number(d?.repeatCount || d?.comboCount || 1));

    const prevCount = giftComboTracker.get(groupId) || 0;
    if (repeatCount <= prevCount && d?.repeatEnd) {
      giftComboTracker.delete(groupId);
      return;
    }
    const deltaCount = Math.max(1, repeatCount - prevCount);
    giftComboTracker.set(groupId, repeatCount);
    if (giftComboTracker.size > 500) {
      giftComboTracker.delete(giftComboTracker.keys().next().value);
    }

    const diamondCount = Math.max(1, Number(giftObj?.diamondCount || d?.diamondCount || d?.cost || 1));
    const rawGiftName = giftObj?.name || d?.giftName || giftObj?.describe || 'Hoa hồng';
    console.log(`[TikTok Gift] ${user} gửi ${deltaCount}x ${rawGiftName} (${diamondCount * deltaCount} xu)`);

    WuxiaArena.applyGiftSkill({
      user,
      uniqueId,
      avatar,
      skillId: null,
      giftName: rawGiftName,
      coins: diamondCount * deltaCount,
      repeatCount: deltaCount
    });
  });

  const handleSocial = (d) => {
    const { user, uniqueId, avatar } = extractUser(d);
    console.log(`[TikTok Social] ${user} tương tác Follow/Share`);
    WuxiaArena.spawnHeroOnArena({ user, uniqueId, avatar });
  };
  tiktokConn.on(WebcastEvent.FOLLOW, handleSocial);
  tiktokConn.on(WebcastEvent.SHARE, handleSocial);
  tiktokConn.on(WebcastEvent.SOCIAL, (d) => {
    const action = String(d?.action || '');
    const disp = String(d?.common?.displayText?.displayType || d?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || disp.includes('follow') || disp.includes('share')) {
      handleSocial(d);
    }
  });

  try {
    const roomState = await tiktokConn.connect();
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    broadcastNotification('tiktok.status', state.tiktok);
    broadcastNotification('wuxia.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    console.error(`[TikTok Live] Lỗi kết nối @${cleanUser}:`, state.tiktok.lastError);
    broadcastNotification('tiktok.status', state.tiktok);
    broadcastNotification('wuxia.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (_) {}
    tiktokConn = null;
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('tiktok.status', state.tiktok);
  broadcastNotification('wuxia.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 8. MÔ PHỎNG TƯƠNG TÁC TỰ ĐỘNG CHO LIVESTREAM DEMO (AUTO SIM)
// ============================================================================
let autoSimTimer = null;

function runSimInteraction() {
  const bot = DEMO_ROSTER[Math.floor(Math.random() * DEMO_ROSTER.length)];
  const r = Math.random();

  if (r < 0.30) {
    // Chat / gọi chiêu / bong bóng thoại
    const cmds = ['chiến', 'kiếm', 'thương', 'đao', 'côn', 'cung', 'tiêu', 'quyền', 'chạy', ...DEMO_BUBBLES];
    const msg = cmds[Math.floor(Math.random() * cmds.length)];
    WuxiaArena.handleComment(msg, bot.user, bot.uniqueId, '', bot.level);
  } else if (r < 0.62) {
    // Thả tim
    WuxiaArena.handleLike({ user: bot.user, uniqueId: bot.uniqueId, count: 3 + Math.floor(Math.random() * 12) });
  } else if (r < 0.80) {
    // Người mới tham gia
    pushChatMessage({ type: 'join', user: bot.user, uniqueId: bot.uniqueId, level: bot.level, text: 'đã tham gia' });
    WuxiaArena.spawnHeroOnArena({ user: bot.user, uniqueId: bot.uniqueId, chosenSect: bot.sect, level: bot.level });
  } else {
    // Tặng quà kỹ năng (4 quà chuẩn: Hoa hồng, GG, Hộp quà bóng bay, Thả tim)
    const skillPool = ['rose', 'rose', 'gg', 'gg', 'giftbox', 'heart_hands'];
    const skillId = skillPool[Math.floor(Math.random() * skillPool.length)];
    WuxiaArena.applyGiftSkill({
      user: bot.user,
      uniqueId: bot.uniqueId,
      skillId,
      repeatCount: skillId === 'rose' ? (1 + Math.floor(Math.random() * 2)) : 1
    });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    autoSimTimer = setInterval(runSimInteraction, state.settings.autoSimIntervalMs || 4200);
  }
}

// ============================================================================
// 9. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'wuxia.getState':
      return getPublicState();
    case 'wuxia.join':
      return {
        ...WuxiaArena.spawnHeroOnArena({
          user: params.user,
          uniqueId: params.uniqueId,
          avatar: params.avatar,
          chosenSect: params.chosenSect,
          forceMidMatch: Boolean(params.forceMidMatch)
        }),
        state: getPublicState()
      };
    case 'wuxia.comment':
      return WuxiaArena.handleComment(params.comment, params.user, params.uniqueId, params.avatar, params.level);
    case 'wuxia.giftSkill':
    case 'wuxia.giftUltimate':
      return WuxiaArena.applyGiftSkill({
        user: params.user,
        uniqueId: params.uniqueId,
        avatar: params.avatar,
        skillId: params.skillId || 'thanvo',
        giftName: params.giftName,
        coins: params.coins || 1,
        repeatCount: params.repeatCount || 1
      });
    case 'wuxia.buffLike':
      return WuxiaArena.handleLike(params);
    case 'wuxia.attack': {
      const key = (params.uniqueId || sanitizeUserName(params.user).toLowerCase().replace(/\s+/g, '_')).slice(0, 40);
      const hero = state.matchHeroes.get(key);
      if (hero && hero.alive) {
        if (params.isCrit) hero.buffs.rageUntil = Math.max(hero.buffs.rageUntil, Date.now() + 4000);
        WuxiaArena.triggerManualBoost(hero, 'attack');
      } else {
        WuxiaArena.spawnHeroOnArena({ user: params.user, uniqueId: key, forceMidMatch: true });
      }
      return getPublicState();
    }
    case 'wuxia.heal': {
      const key = (params.uniqueId || sanitizeUserName(params.user).toLowerCase().replace(/\s+/g, '_')).slice(0, 40);
      const hero = state.matchHeroes.get(key);
      if (hero) WuxiaArena.applyHeal(hero, 120);
      return getPublicState();
    }
    case 'wuxia.spawnBoss':
      return { boss: WuxiaArena.spawnMaDauBoss({ bossType: params.bossType, trigger: 'manual' }), state: getPublicState() };
    case 'wuxia.startMatchNow':
      WuxiaArena.startFightingPhase();
      return getPublicState();
    case 'wuxia.resetRound':
      WuxiaArena.startRegistrationPhase();
      return getPublicState();
    case 'wuxia.clearAllData':
      return WuxiaArena.clearAllData();
    case 'wuxia.updateSettings':
      return WuxiaArena.updateSettings(params);
    case 'wuxia.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice || 'maichi');
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', { text: params.text, voice: res.voice, url: res.url });
      }
      return res;
    }
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('wuxia.state', getPublicState());
      return getPublicState();
    default:
      throw new Error(`Không tìm thấy phương thức JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 10. EXPRESS + WEBSOCKET SERVER & BOOTSTRAP
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three/examples/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Missing method' } });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({ jsonrpc: jsonrpc || '2.0', id: id ?? null, result });
  } catch (err) {
    res.status(200).json({ jsonrpc: jsonrpc || '2.0', id: id ?? null, error: { code: -32000, message: err.message } });
  }
});

app.get('/api/state', (_req, res) => res.json(getPublicState()));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastNotification(method, params) {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'wuxia.state', params: getPublicState() }));
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); } catch (_) { return; }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: err.message } }));
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

// Vòng lặp chiến đấu Real-Time 10Hz (100% dữ liệu thật từ TikTok Live — KHÔNG tự thêm bot/dữ liệu giả)
setInterval(() => WuxiaArena.tick(0.1), 100);
configureAutoSim(state.settings.autoSim);

server.listen(PORT, () => {
  console.log('============================================================');
  console.log('⚔️  VÕ ĐÀI 3D — ĐI TÌM VÕ LÂM MINH CHỦ (TIKTOK LIVE DATA THẬT)');
  console.log(`📺 Màn hình Live 3D : http://localhost:${PORT}`);
  console.log(`🎛️ Bảng Admin RPC   : http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0     : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log('============================================================');

  // Tự động kết nối tới kênh TikTok đã lưu hoặc truyền qua TIKTOK_USER
  const autoChannel = process.env.TIKTOK_USER || state.settings.tiktokUsername;
  if (autoChannel) {
    connectTikTokLive(autoChannel).catch((err) => {
      console.warn(`[Auto-Connect @${autoChannel}] Chưa kết nối được:`, err.message);
    });
  }
});
