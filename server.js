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
const STATE_FILE = path.join(DATA_DIR, 'wuxia-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. CÁC ĐẠI MÔN PHÁI & BINH KHÍ TƯƠNG XỨNG (6 MAJOR WUXIA SECTS & WEAPONS)
// ============================================================================
const SECTS = {
  thieulam: {
    id: 'thieulam',
    name: 'Thiếu Lâm',
    fullName: 'Thiếu Lâm Tự',
    weapon: 'Hàng Ma Côn',
    weaponType: 'con', // côn / trượng
    weaponName: 'Côn & Thiền Trượng',
    color: '#f59e0b',
    glowColor: '#fbbf24',
    badge: '📿',
    ultimate: 'Như Lai Thần Chưởng',
    motto: 'Kim Cang Bất Hoại • Trừ Ma Vệ Đạo',
    keywords: ['thiếu lâm', 'thieu lam', 'shaolin', 'côn', 'con', 'trượng', 'truong', 'hàng ma côn']
  },
  vodang: {
    id: 'vodang',
    name: 'Võ Đang',
    fullName: 'Võ Đang Phái',
    weapon: 'Thái Cực Kiếm',
    weaponType: 'kiem', // kiếm
    weaponName: 'Đạo Kiếm',
    color: '#06b6d4',
    glowColor: '#38bdf8',
    badge: '☯️',
    ultimate: 'Thái Cực Kiếm Trận',
    motto: 'Lấy Nhu Thắng Cương • Đạo Pháp Tự Nhiên',
    keywords: ['võ đang', 'vo dang', 'wudang', 'kiếm', 'kiem', 'thái cực', 'thai cuc', 'thái cực kiếm']
  },
  caibang: {
    id: 'caibang',
    name: 'Cái Bang',
    fullName: 'Cái Bang Đệ Nhất Bang',
    weapon: 'Đả Cẩu Bổng',
    weaponType: 'bong', // bổng
    weaponName: 'Đả Cẩu Bổng',
    color: '#10b981',
    glowColor: '#34d399',
    badge: '🐉',
    ultimate: 'Giáng Long Thập Bát Chưởng',
    motto: 'Trượng Nghĩa Khắp Giang Hồ • Đả Cẩu Xuất Thế',
    keywords: ['cái bang', 'cai bang', 'bổng', 'bong', 'đả cẩu', 'da cau', 'giáng long', 'giang long']
  },
  ngami: {
    id: 'ngami',
    name: 'Nga Mi',
    fullName: 'Nga Mi Phái',
    weapon: 'Ỷ Thiên Kiếm',
    weaponType: 'songkiem', // song kiếm / kiếm
    weaponName: 'Ỷ Thiên Thần Kiếm',
    color: '#ec4899',
    glowColor: '#f472b6',
    badge: '🌸',
    ultimate: 'Ỷ Thiên Trảm Nguyệt',
    motto: 'Thanh Phong Kiếm Ảnh • Đoạt Hồn Thần Kiếm',
    keywords: ['nga mi', 'nga my', 'emei', 'song kiếm', 'song kiem', 'ỷ thiên', 'y thien', 'song kiếm nga mi']
  },
  minhgiao: {
    id: 'minhgiao',
    name: 'Minh Giáo',
    fullName: 'Quang Minh Đỉnh Minh Giáo',
    weapon: 'Huyết Long Đao',
    weaponType: 'dao', // đao
    weaponName: 'Đại Đao & Thánh Hỏa Lệnh',
    color: '#ef4444',
    glowColor: '#f87171',
    badge: '🔥',
    ultimate: 'Càn Khôn Đại Na Di',
    motto: 'Thánh Hỏa Bất Diệt • Càn Khôn Vạn Biến',
    keywords: ['minh giáo', 'minh giao', 'ma giáo', 'ma giao', 'đao', 'dao', 'huyết đao', 'huyet dao', 'đồ long', 'do long']
  },
  duongmon: {
    id: 'duongmon',
    name: 'Đường Môn',
    fullName: 'Tứ Xuyên Đường Môn',
    weapon: 'Ám Khí Phi Tiêu',
    weaponType: 'amkhi', // ám khí / phi tiêu
    weaponName: 'Bão Vũ Phi Tiêu',
    color: '#8b5cf6',
    glowColor: '#a78bfa',
    badge: '⚡',
    ultimate: 'Bão Vũ Lê Hoa Châm',
    motto: 'Ám Ảnh Vô Ngân • Nhất Tiêu Đoạt Mệnh',
    keywords: ['đường môn', 'duong mon', 'ám khí', 'am khi', 'tiêu', 'phi tieu', 'phi đao', 'phi dao', 'châm', 'cham']
  }
};

const SECT_KEYS = Object.keys(SECTS);

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
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin}...`);

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
    } catch (e) {
      console.warn('[ZeroTTS] Không khởi chạy được Python TTS worker, client sẽ dùng Web Speech:', e.message);
      this.status = 'fallback_browser';
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
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        console.error('[ZeroTTS Error]', msg.error);
        this.status = 'error';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (err) {
      console.log('[ZeroTTS stdout]', line);
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'ZeroTTS (zeroweight-ai/ZeroTTS)',
      voice: state.settings.ttsVoice || this.voice || 'maichi',
      voices: this.voices,
      model: this.model
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = (voiceOverride || state.settings.ttsVoice || 'maichi').toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: `ZeroTTS đang ở trạng thái: ${this.status}` });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS synthesis timeout' });
      }, 30000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice }) + '\n';
      this.proc.stdin.write(payload);
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. TRẠNG THÁI ĐẠI HỘI VÕ LÂM & ĐẤU SĨ (WUXIA GAME STATE)
// ============================================================================
const DEFAULT_STATE = {
  round: 1,
  roundStatus: 'fighting', // 'fighting', 'intermission'
  champion: null, // Đương kim Võ Lâm Minh Chủ
  championHistory: [],
  fighters: {}, // key: uniqueId -> Fighter
  sectStats: {
    thieulam: { members: 0, kills: 0, power: 100 },
    vodang: { members: 0, kills: 0, power: 100 },
    caibang: { members: 0, kills: 0, power: 100 },
    ngami: { members: 0, kills: 0, power: 100 },
    minhgiao: { members: 0, kills: 0, power: 100 },
    duongmon: { members: 0, kills: 0, power: 100 }
  },
  totalKills: 0,
  totalAttacks: 0,
  totalLikes: 0,
  totalGifts: 0,
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    autoSim: false,
    autoSimIntervalMs: 5000,
    // Cài đặt đồ họa 3D lưu trữ trên server
    graphics3D: {
      quality: 'high', // 'low', 'medium', 'high'
      shadows: true,
      kiAura: true,
      slashTrails: true,
      damageNumbers: true,
      environmentFx: 'sakura', // 'sakura', 'snow', 'fire', 'fog', 'none'
      cameraMode: 'cinematic', // 'cinematic', 'action', 'champion', 'topdown', 'orbit'
      aspectMode: '9:16' // '9:16' (OBS Live), '16:9' (Fullscreen)
    }
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'wuxia_live',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        fighters: saved.fighters || {},
        sectStats: { ...DEFAULT_STATE.sectStats, ...(saved.sectStats || {}) },
        settings: {
          ...DEFAULT_STATE.settings,
          ...(saved.settings || {}),
          graphics3D: {
            ...DEFAULT_STATE.settings.graphics3D,
            ...((saved.settings && saved.settings.graphics3D) || {})
          }
        },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được wuxia-state.json, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      round: state.round,
      champion: state.champion,
      championHistory: state.championHistory.slice(0, 20),
      fighters: state.fighters,
      sectStats: state.sectStats,
      totalKills: state.totalKills,
      totalAttacks: state.totalAttacks,
      totalLikes: state.totalLikes,
      totalGifts: state.totalGifts,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  }, 1500);
}

// Lọc từ bậy và spam
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|i cư|lừa đảo|te-le gram|telegram)/i;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_NAME_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);

  if (!normalized || BAD_WORDS_RE.test(normalized) || normalized.length < 2) {
    return 'Vô Danh Hiệp';
  }
  return normalized;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 40) {
    state.recentEvents.length = 40;
  }
  return entry;
}

function getLeaderboard(limit = 10) {
  return Object.values(state.fighters)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.streak - a.streak;
    })
    .slice(0, limit)
    .map((f, idx) => ({
      rank: idx + 1,
      id: f.id,
      user: f.user,
      uniqueId: f.uniqueId,
      avatar: f.avatar,
      sect: f.sect,
      weapon: f.weapon,
      score: f.score,
      kills: f.kills,
      streak: f.streak,
      hp: f.hp,
      maxHp: f.maxHp,
      alive: f.alive,
      isChampion: state.champion?.uniqueId === f.uniqueId
    }));
}

function getPublicState() {
  return {
    round: state.round,
    roundStatus: state.roundStatus,
    champion: state.champion,
    championHistory: state.championHistory.slice(0, 6),
    sects: SECTS,
    sectStats: state.sectStats,
    leaderboard: getLeaderboard(12),
    activeFighters: Object.values(state.fighters)
      .filter((f) => f.alive)
      .slice(0, 36)
      .map((f) => ({
        id: f.id,
        user: f.user,
        uniqueId: f.uniqueId,
        avatar: f.avatar,
        sect: f.sect,
        weapon: f.weapon,
        weaponType: f.weaponType,
        hp: f.hp,
        maxHp: f.maxHp,
        score: f.score,
        kills: f.kills,
        streak: f.streak,
        title: f.title,
        isChampion: state.champion?.uniqueId === f.uniqueId
      })),
    totalKills: state.totalKills,
    totalAttacks: state.totalAttacks,
    totalLikes: state.totalLikes,
    totalGifts: state.totalGifts,
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'browser_speech', voice: 'maichi' }
  };
}

// ============================================================================
// 4. HỆ THỐNG CHIẾN ĐẤU KIẾM HIỆP & QUẢN LÝ ĐẤU SĨ (COMBAT ENGINE)
// ============================================================================
const WuxiaGame = {
  // Tìm môn phái đang ít thành viên nhất để cân bằng
  getBalancedSect() {
    let minSect = SECT_KEYS[0];
    let minMembers = Infinity;
    for (const key of SECT_KEYS) {
      const count = state.sectStats[key]?.members || 0;
      if (count < minMembers) {
        minMembers = count;
        minSect = key;
      }
    }
    return minSect;
  },

  // Đấu sĩ tham gia hoặc tái xuất
  joinBattle({ user, uniqueId, avatar, chosenSect = null, chosenWeapon = null }) {
    const cleanUser = sanitizeUserName(user);
    const key = (uniqueId || cleanUser).slice(0, 40);

    let sectKey = chosenSect;
    if (!sectKey || !SECTS[sectKey]) {
      sectKey = this.getBalancedSect();
    }
    const sectInfo = SECTS[sectKey];
    const weaponName = chosenWeapon || sectInfo.weapon;

    let fighter = state.fighters[key];
    const isNew = !fighter;

    if (isNew) {
      fighter = {
        id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user: cleanUser,
        uniqueId: key,
        avatar: avatar || '',
        sect: sectKey,
        weapon: weaponName,
        weaponType: sectInfo.weaponType,
        hp: 1000,
        maxHp: 1000,
        atk: 120 + Math.floor(Math.random() * 40),
        defense: 50,
        score: 100,
        kills: 0,
        streak: 0,
        alive: true,
        joinedAt: Date.now(),
        lastAction: Date.now(),
        title: 'Tân Binh Giang Hồ'
      };
      state.fighters[key] = fighter;
      state.sectStats[sectKey].members = (state.sectStats[sectKey].members || 0) + 1;
    } else {
      // Đã có từ trước: nếu chết thì hồi sinh, nếu còn sống thì đổi phái hoặc tăng HP
      fighter.user = cleanUser;
      if (avatar) fighter.avatar = avatar;
      if (chosenSect && chosenSect !== fighter.sect) {
        // Trừ môn phái cũ, cộng môn phái mới
        if (state.sectStats[fighter.sect]?.members > 0) {
          state.sectStats[fighter.sect].members -= 1;
        }
        fighter.sect = sectKey;
        fighter.weapon = weaponName;
        fighter.weaponType = sectInfo.weaponType;
        state.sectStats[sectKey].members = (state.sectStats[sectKey].members || 0) + 1;
      }
      fighter.alive = true;
      fighter.hp = fighter.maxHp;
      fighter.lastAction = Date.now();
    }

    state.sectStats[sectKey].power += 50;

    const ttsText = isNew
      ? `Hiệp khách ${fighter.user} gia nhập phái ${sectInfo.name}, vung kiếm ${weaponName} bước lên lôi đài!`
      : `Hiệp khách ${fighter.user} phái ${sectInfo.name} tái xuất giang hồ, khí thế kinh người!`;

    const event = pushEventLog({
      type: 'join',
      fighterId: fighter.id,
      user: fighter.user,
      uniqueId: fighter.uniqueId,
      avatar: fighter.avatar,
      sect: fighter.sect,
      weapon: fighter.weapon,
      weaponType: fighter.weaponType,
      isNew,
      ttsText
    });

    this.checkChampion();
    saveState();
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return { event, fighter, state: getPublicState() };
  },

  // Tấn công / Xuất chiêu
  attack({ uniqueId, user, avatar, isCrit = false, skillName = null }) {
    const key = (uniqueId || user).slice(0, 40);
    let fighter = state.fighters[key];

    if (!fighter) {
      // Nếu chưa tham gia, tự động cho tham gia trước
      const joined = this.joinBattle({ user, uniqueId, avatar });
      fighter = joined.fighter;
    }

    if (!fighter.alive) {
      fighter.alive = true;
      fighter.hp = fighter.maxHp;
    }

    fighter.lastAction = Date.now();
    state.totalAttacks += 1;

    // Tìm đối thủ ngẫu nhiên khác môn phái đang còn sống
    const opponents = Object.values(state.fighters).filter(
      (f) => f.uniqueId !== fighter.uniqueId && f.alive && f.sect !== fighter.sect
    );

    let target = null;
    if (opponents.length > 0) {
      // Ưu tiên nhắm vào Minh Chủ hoặc người điểm cao nhất
      if (state.champion && state.champion.uniqueId !== fighter.uniqueId && state.champion.alive) {
        target = Math.random() < 0.4 ? opponents.find((f) => f.uniqueId === state.champion.uniqueId) || opponents[0] : opponents[Math.floor(Math.random() * opponents.length)];
      } else {
        target = opponents[Math.floor(Math.random() * opponents.length)];
      }
    } else {
      // Nếu không có khác phái, chọn bất kỳ ai khác
      const anyOpponents = Object.values(state.fighters).filter(
        (f) => f.uniqueId !== fighter.uniqueId && f.alive
      );
      if (anyOpponents.length > 0) {
        target = anyOpponents[Math.floor(Math.random() * anyOpponents.length)];
      }
    }

    let damage = Math.floor(fighter.atk * (0.8 + Math.random() * 0.5));
    if (isCrit) damage = Math.floor(damage * 1.8);
    let isKill = false;
    let attackSkill = skillName || (isCrit ? 'Bạo Kích Vô Song' : 'Liên Hoàn Kích');

    if (target) {
      target.hp = Math.max(0, target.hp - damage);
      if (target.hp <= 0) {
        target.alive = false;
        target.streak = 0;
        isKill = true;
        fighter.kills += 1;
        fighter.streak += 1;
        fighter.score += 250;
        state.totalKills += 1;
        state.sectStats[fighter.sect].kills = (state.sectStats[fighter.sect].kills || 0) + 1;
        state.sectStats[fighter.sect].power += 150;
      } else {
        fighter.score += 30;
      }
    } else {
      fighter.score += 10;
    }

    // Cập nhật danh hiệu
    if (fighter.kills >= 10) fighter.title = 'Võ Thánh';
    else if (fighter.kills >= 6) fighter.title = 'Tuyệt Đỉnh Cao Thủ';
    else if (fighter.kills >= 3) fighter.title = 'Giang Hồ Danh Hiệp';
    else fighter.title = 'Hiệp Khách';

    let ttsText = '';
    if (isKill && target) {
      ttsText = `${fighter.user} phái ${SECTS[fighter.sect]?.name} xuất chiêu ${attackSkill}, đoạt mạng ${target.user}!`;
    }

    const event = pushEventLog({
      type: 'attack',
      attacker: {
        id: fighter.id,
        user: fighter.user,
        uniqueId: fighter.uniqueId,
        sect: fighter.sect,
        weapon: fighter.weapon,
        weaponType: fighter.weaponType,
        score: fighter.score,
        kills: fighter.kills,
        streak: fighter.streak
      },
      target: target
        ? {
            id: target.id,
            user: target.user,
            uniqueId: target.uniqueId,
            sect: target.sect,
            hp: target.hp,
            maxHp: target.maxHp,
            alive: target.alive
          }
        : null,
      damage,
      isCrit,
      isKill,
      skillName: attackSkill,
      ttsText
    });

    this.checkChampion();
    saveState();
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return { event, fighter, target, state: getPublicState() };
  },

  // Hồi máu / Hộ thể khí công
  heal({ uniqueId, user, avatar }) {
    const key = (uniqueId || user).slice(0, 40);
    let fighter = state.fighters[key];
    if (!fighter) {
      const res = this.joinBattle({ user, uniqueId, avatar });
      fighter = res.fighter;
    }
    const healAmount = 250 + Math.floor(Math.random() * 150);
    fighter.hp = Math.min(fighter.maxHp, fighter.hp + healAmount);
    fighter.alive = true;
    fighter.score += 20;

    const event = pushEventLog({
      type: 'heal',
      fighter: {
        id: fighter.id,
        user: fighter.user,
        uniqueId: fighter.uniqueId,
        sect: fighter.sect,
        hp: fighter.hp,
        maxHp: fighter.maxHp
      },
      healAmount,
      ttsText: `${fighter.user} vận công điều tức, hồi phục ${healAmount} sinh lực!`
    });

    saveState();
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return { event, fighter, state: getPublicState() };
  },

  // Like: Buff nội lực cho môn phái
  buffLike({ user, uniqueId, avatar, count = 1 }) {
    state.totalLikes += count;
    const cleanUser = sanitizeUserName(user);
    const key = (uniqueId || cleanUser).slice(0, 40);
    let fighter = state.fighters[key];

    let targetSect = fighter ? fighter.sect : this.getBalancedSect();
    state.sectStats[targetSect].power += count * 5;

    // Tăng nhẹ HP và ATK cho toàn bộ thành viên trong phái
    const sectMembers = Object.values(state.fighters).filter((f) => f.sect === targetSect && f.alive);
    sectMembers.forEach((m) => {
      m.hp = Math.min(m.maxHp, m.hp + count * 5);
      m.score += count;
    });

    const event = pushEventLog({
      type: 'likeBuff',
      user: cleanUser,
      uniqueId: key,
      sect: targetSect,
      count,
      ttsText: ''
    });

    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // Tặng quà: Kích hoạt Thần Binh & Tuyệt Kỹ Môn Phái
  giftUltimate({ user, uniqueId, avatar, giftName, coins = 10 }) {
    state.totalGifts += 1;
    const cleanUser = sanitizeUserName(user);
    const key = (uniqueId || cleanUser).slice(0, 40);
    let fighter = state.fighters[key];

    if (!fighter) {
      const res = this.joinBattle({ user, uniqueId, avatar });
      fighter = res.fighter;
    }

    fighter.alive = true;
    fighter.hp = fighter.maxHp;
    fighter.atk += Math.floor(coins * 1.5);
    fighter.score += coins * 20;

    const sectInfo = SECTS[fighter.sect] || SECTS.vodang;
    const ultimateSkill = sectInfo.ultimate;

    // Sát thương diện rộng quét toàn bộ đối thủ khác phái
    const opponents = Object.values(state.fighters).filter(
      (f) => f.uniqueId !== fighter.uniqueId && f.alive && f.sect !== fighter.sect
    );
    const aoeDamage = 200 + Math.floor(coins * 4);
    let killedCount = 0;

    opponents.forEach((opp) => {
      opp.hp = Math.max(0, opp.hp - aoeDamage);
      if (opp.hp <= 0) {
        opp.alive = false;
        opp.streak = 0;
        killedCount += 1;
      }
    });

    fighter.kills += killedCount;
    fighter.streak += killedCount;
    state.totalKills += killedCount;

    const ttsText = `Kinh thiên động địa! Hiệp khách ${fighter.user} dâng bảo vật ${giftName}, phóng thích đại tuyệt kỹ ${ultimateSkill} phái ${sectInfo.name}, chấn động lôi đài!`;

    const event = pushEventLog({
      type: 'ultimate',
      fighter: {
        id: fighter.id,
        user: fighter.user,
        uniqueId: fighter.uniqueId,
        sect: fighter.sect,
        weapon: fighter.weapon,
        weaponType: fighter.weaponType,
        score: fighter.score,
        kills: fighter.kills
      },
      giftName,
      coins,
      ultimateSkill,
      aoeDamage,
      killedCount,
      ttsText
    });

    this.checkChampion();
    saveState();
    broadcastNotification('wuxia.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // Kiểm tra và phong vị VÕ LÂM MINH CHỦ
  checkChampion() {
    const aliveFighters = Object.values(state.fighters).filter((f) => f.alive);
    if (aliveFighters.length === 0) return null;

    // Sắp xếp theo score -> kills -> streak
    aliveFighters.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.streak - a.streak;
    });

    const topCandidate = aliveFighters[0];
    if (!state.champion || state.champion.uniqueId !== topCandidate.uniqueId) {
      const oldChamp = state.champion;
      state.champion = {
        id: topCandidate.id,
        user: topCandidate.user,
        uniqueId: topCandidate.uniqueId,
        avatar: topCandidate.avatar,
        sect: topCandidate.sect,
        weapon: topCandidate.weapon,
        score: topCandidate.score,
        kills: topCandidate.kills,
        crownedAt: Date.now()
      };

      topCandidate.title = '👑 VÕ LÂM MINH CHỦ';

      state.championHistory.unshift({
        user: topCandidate.user,
        uniqueId: topCandidate.uniqueId,
        sect: topCandidate.sect,
        time: new Date().toLocaleTimeString('vi-VN'),
        kills: topCandidate.kills
      });

      const ttsText = `Vạn chúng quy phục! Chúc mừng hiệp khách ${topCandidate.user} phái ${SECTS[topCandidate.sect]?.name} chính thức đoạt ngôi VÕ LÂM MINH CHỦ!`;

      pushEventLog({
        type: 'coronation',
        champion: state.champion,
        oldChampion: oldChamp,
        ttsText
      });
    }

    return state.champion;
  },

  // Reset vòng đấu mới
  resetRound() {
    state.round += 1;
    // Hồi sinh toàn bộ đấu sĩ và reset HP
    Object.values(state.fighters).forEach((f) => {
      f.alive = true;
      f.hp = f.maxHp;
    });
    this.checkChampion();
    saveState();
    broadcastNotification('wuxia.state', getPublicState());
    return getPublicState();
  },

  // Cập nhật cấu hình & Thiết lập hình ảnh 3D
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
    saveState();
    broadcastNotification('wuxia.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. BỘ PHÂN TÍCH BÌNH LUẬN TIKTOK LIVE (TIKTOK CHAT PARSER)
// ============================================================================
const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || BAD_WORDS_RE.test(raw)) return null;

  // Chống spam: cooldown 1.5s/người
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 1500) return null;
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 800) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = raw.toLowerCase().trim();

  // 1. Kiểm tra gia nhập theo Môn Phái hoặc Binh Khí
  for (const sectKey of SECT_KEYS) {
    const sect = SECTS[sectKey];
    for (const kw of sect.keywords) {
      if (lower.includes(kw)) {
        return WuxiaGame.joinBattle({
          user: cleanUser,
          uniqueId,
          avatar,
          chosenSect: sectKey,
          chosenWeapon: sect.weapon
        });
      }
    }
  }

  // 2. Lệnh 'chiến' / 'pk' / 'đấu' / 'tham gia': Tự động vào lôi đài với môn phái ngẫu nhiên
  if (
    lower === 'chiến' ||
    lower === 'chien' ||
    lower === 'pk' ||
    lower === 'đấu' ||
    lower === 'dau' ||
    lower.startsWith('chiến') ||
    lower.startsWith('chien') ||
    lower.includes('tham gia') ||
    lower.includes('len dai') ||
    lower.includes('lên đài')
  ) {
    return WuxiaGame.joinBattle({
      user: cleanUser,
      uniqueId,
      avatar
    });
  }

  // 3. Lệnh đánh / chém / chưởng / xuất chiêu
  if (
    lower.includes('đánh') ||
    lower.includes('danh') ||
    lower.includes('chém') ||
    lower.includes('chem') ||
    lower.includes('chưởng') ||
    lower.includes('chuong') ||
    lower.includes('tấn công') ||
    lower.includes('tan cong') ||
    lower.includes('bạo kích') ||
    lower.includes('bao kich') ||
    lower.includes('xuat chieu') ||
    lower.includes('xuất chiêu')
  ) {
    const isCrit = lower.includes('bạo kích') || lower.includes('bao kich') || Math.random() < 0.25;
    return WuxiaGame.attack({
      user: cleanUser,
      uniqueId,
      avatar,
      isCrit
    });
  }

  // 4. Lệnh hồi máu / né đòn / hộ thể
  if (
    lower.includes('hồi máu') ||
    lower.includes('hoi mau') ||
    lower.includes('né') ||
    lower.includes('ne') ||
    lower.includes('hộ thể') ||
    lower.includes('buff')
  ) {
    return WuxiaGame.heal({
      user: cleanUser,
      uniqueId,
      avatar
    });
  }

  // 5. Bình luận cổ vũ bất kỳ: Tự động đánh thường
  return WuxiaGame.attack({
    user: cleanUser,
    uniqueId,
    avatar,
    isCrit: false
  });
}

// ============================================================================
// 6. KẾT NỐI TIKTOK LIVE CONNECTOR
// ============================================================================
let tiktokConn = null;

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Vui lòng nhập @username hoặc link TikTok Live');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Võ Lâm Hiệp';
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
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ');
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
  broadcastNotification('tiktok.status', state.tiktok);

  console.log(`[TikTok Live] Đang kết nối tới kênh @${cleanUser}...`);
  tiktokConn = new TikTokLiveConnection(cleanUser, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    clientParams: { app_language: 'vi-VN', device_platform: 'web' },
    requestHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8' }
  });

  tiktokConn.on(WebcastEvent.CONNECTED, (stateData) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = stateData?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Đã kết nối thành công phòng ${state.tiktok.roomId}`);
    broadcastNotification('tiktok.status', state.tiktok);
  });

  tiktokConn.on(WebcastEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log('[TikTok Live] Đã ngắt kết nối');
    broadcastNotification('tiktok.status', state.tiktok);
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    if (data?.viewerCount != null) {
      state.tiktok.viewerCount = Number(data.viewerCount);
      broadcastNotification('tiktok.status', state.tiktok);
    }
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(20, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    WuxiaGame.buffLike({ user, uniqueId, avatar, count: likeCount });
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftName = data?.giftName || data?.extendedGiftInfo?.name || 'Hoa Hồng Thần Khí';
    const diamondCount = Number(data?.diamondCount || data?.cost || 1);
    const repeatCount = Number(data?.repeatCount || 1);
    const totalCoins = Math.max(1, diamondCount * repeatCount);
    WuxiaGame.giftUltimate({ user, uniqueId, avatar, giftName, coins: totalCoins });
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    WuxiaGame.joinBattle({ user, uniqueId, avatar });
  };
  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);

  try {
    await tiktokConn.connect();
    return state.tiktok;
  } catch (err) {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err.message || 'Lỗi kết nối TikTok';
    console.error(`[TikTok Live] Lỗi kết nối: ${err.message}`);
    broadcastNotification('tiktok.status', state.tiktok);
    throw err;
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
  broadcastNotification('tiktok.status', state.tiktok);
  return state.tiktok;
}

// ============================================================================
// 7. GIẢ LẬP ĐẤU SĨ TỰ ĐỘNG (AUTO SIMULATION ENGINE)
// ============================================================================
let autoSimTimer = null;
const SIM_FIGHTERS = [
  { user: 'Lệnh Hồ Xung', uniqueId: 'lenhhoxung', sect: 'vodang', weapon: 'Độc Cô Cửu Kiếm' },
  { user: 'Kiều Phong', uniqueId: 'kieuphong', sect: 'caibang', weapon: 'Đả Cẩu Bổng' },
  { user: 'Trương Vô Kỵ', uniqueId: 'truongvoky', sect: 'minhgiao', weapon: 'Huyết Long Đao' },
  { user: 'Chu Chỉ Nhược', uniqueId: 'chuchinhuoc', sect: 'ngami', weapon: 'Ỷ Thiên Kiếm' },
  { user: 'Hư Trúc', uniqueId: 'hutruc', sect: 'thieulam', weapon: 'Hàng Ma Côn' },
  { user: 'Đường Tam', uniqueId: 'duongtam', sect: 'duongmon', weapon: 'Bão Vũ Lê Hoa Châm' },
  { user: 'Dương Quá', uniqueId: 'duongqua', sect: 'vodang', weapon: 'Huyền Thiết Trọng Kiếm' },
  { user: 'Tiểu Long Nữ', uniqueId: 'tieulongnu', sect: 'ngami', weapon: 'Ngọc Nữ Tố Tâm Kiếm' },
  { user: 'Hồng Thất Công', uniqueId: 'hongthatcong', sect: 'caibang', weapon: 'Đả Cẩu Bổng' },
  { user: 'Tạ Tốn', uniqueId: 'taton', sect: 'minhgiao', weapon: 'Đồ Long Đao' }
];

function runSingleSimulationStep() {
  const pick = SIM_FIGHTERS[Math.floor(Math.random() * SIM_FIGHTERS.length)];
  const roll = Math.random();

  if (roll < 0.25) {
    // Gia nhập / Xuất hiện
    WuxiaGame.joinBattle({
      user: pick.user,
      uniqueId: pick.uniqueId,
      chosenSect: pick.sect,
      chosenWeapon: pick.weapon
    });
  } else if (roll < 0.65) {
    // Tấn công
    WuxiaGame.attack({
      user: pick.user,
      uniqueId: pick.uniqueId,
      isCrit: Math.random() < 0.3
    });
  } else if (roll < 0.82) {
    // Thả tim buff nội lực
    WuxiaGame.buffLike({
      user: pick.user,
      uniqueId: pick.uniqueId,
      count: Math.floor(1 + Math.random() * 8)
    });
  } else if (roll < 0.94) {
    // Hồi máu
    WuxiaGame.heal({
      user: pick.user,
      uniqueId: pick.uniqueId
    });
  } else {
    // Kích hoạt Tuyệt Kỹ Thần Binh
    WuxiaGame.giftUltimate({
      user: pick.user,
      uniqueId: pick.uniqueId,
      giftName: 'Long Phụng Hoàng Kim Trượng',
      coins: 99
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
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 4500);
  }
}

// ============================================================================
// 8. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'wuxia.getState':
      return getPublicState();
    case 'wuxia.join':
      return WuxiaGame.joinBattle(params);
    case 'wuxia.attack':
      return WuxiaGame.attack(params);
    case 'wuxia.heal':
      return WuxiaGame.heal(params);
    case 'wuxia.buffLike':
      return WuxiaGame.buffLike(params);
    case 'wuxia.giftUltimate':
      return WuxiaGame.giftUltimate(params);
    case 'wuxia.resetRound':
      return WuxiaGame.resetRound();
    case 'wuxia.updateSettings':
      return WuxiaGame.updateSettings(params);
    case 'wuxia.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);
    case 'wuxia.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice || 'maichi');
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', {
          text: params.text,
          voice: res.voice,
          url: res.url
        });
      }
      return res;
    }
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      return getPublicState();
    default:
      throw new Error(`Không tìm thấy phương thức JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 9. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));

// Static Three.js routes from node_modules
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three/examples/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// HTTP JSON-RPC 2.0 Endpoint
app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC: missing method' }
    });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'wuxia.state',
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

// Khởi tạo một số đấu sĩ ban đầu nếu danh sách rỗng
if (Object.keys(state.fighters).length === 0) {
  SIM_FIGHTERS.slice(0, 6).forEach((f) => {
    WuxiaGame.joinBattle({
      user: f.user,
      uniqueId: f.uniqueId,
      chosenSect: f.sect,
      chosenWeapon: f.weapon
    });
  });
}

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`⚔️ HOA SƠN LUẬN KIẾM 3D — ĐẠI HỘI VÕ LÂM MINH CHỦ ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Lôi Đài 3D (OBS 9:16): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng Điều Khiển Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username;
  if (defaultChannel && defaultChannel !== 'wuxia_live') {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối:`, err.message);
    });
  }
});
