'use strict';

/**
 * KỲ ĐÀI CỜ TƯỚNG TIKTOK LIVE — JSON-RPC 2.0 & WebSocket Server
 * - Chỉ người xem tặng quà TikTok Live mới nhận lượt đi nước tiếp theo (Gift-Gated Turn Queue + VIP Priority)
 * - Luật Cờ Tướng 9x10 chuẩn 100% + AI Đại Kiện Tướng + ZeroTTS giọng đọc bình luận viên tiếng Việt
 * - Khung dọc 9:16 chuẩn OBS Studio / TikTok Live Studio (?obs=1) + Bảng điều khiển Host + Trang /admin
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { normalizeGiftPayload, getGiftComboDelta } = require('./lib/tiktok-gift-payload.cjs');
const XiangqiLiveEngine = require('./xiangqi_engine');

// Bắt lỗi toàn cục tránh crash server khi TikTok Live hoặc WebSocket bị ngắt đột ngột
process.on('uncaughtException', (err) => {
  console.warn('[Process UncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Process UnhandledRejection]', reason?.message || reason);
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. DANH MỤC QUÀ TẶNG TIKTOK LIVE CHUẨN (KÈM BẬC QUYỀN ĐI CỜ)
// ============================================================================
const TIKTOK_GIFTS = [
  {
    id: 'hoa_hong',
    name: 'Hoa hồng',
    aliases: ['hoa hong', 'rose', 'hoa hồng'],
    coins: 1,
    icon: '🌹',
    image: '/assets/gifts/hoa_hong.svg',
    badge: '1 🪙',
    perk: '1 Lượt Đi'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    aliases: ['tiktok', 'tik tok', 'tiktok logo'],
    coins: 1,
    icon: '🎵',
    image: '/assets/gifts/tiktok.svg',
    badge: '1 🪙',
    perk: '1 Lượt Đi'
  },
  {
    id: 'gg',
    name: 'GG',
    aliases: ['gg', 'good game'],
    coins: 1,
    icon: '🎮',
    image: '/assets/gifts/gg.svg',
    badge: '1 🪙',
    perk: '1 Lượt Đi'
  },
  {
    id: 'dinh',
    name: 'Đỉnh',
    aliases: ['dinh', 'đỉnh', 'top', 'thumbs up'],
    coins: 1,
    icon: '🐱👍',
    image: '/assets/gifts/dinh.svg',
    badge: '1 🪙',
    perk: '1 Lượt Đi'
  },
  {
    id: 'yeu_ban',
    name: 'Yêu bạn',
    aliases: ['yeu ban', 'yêu bạn', 'love you', 'hug heart', 'heart me'],
    coins: 1,
    icon: '🥰',
    image: '/assets/gifts/yeu_ban.svg',
    badge: '1 🪙',
    perk: '1 Lượt Đi'
  },
  {
    id: 'hieu_y',
    name: 'Hiểu ý tôi chứ',
    aliases: ['hieu y toi chu', 'hieu y', 'hiểu ý tôi chứ', 'hiểu ý', 'wink'],
    coins: 1,
    icon: '😉💖',
    image: '/assets/gifts/hieu_y.svg',
    badge: '1 🪙',
    perk: '1 Lượt Đi'
  },
  {
    id: 'ban_tim',
    name: 'Bắn tim',
    aliases: ['ban tim', 'bắn tim', 'finger heart', 'heart'],
    coins: 5,
    icon: '🫰❤️',
    image: '/assets/gifts/ban_tim.svg',
    badge: '5 🪙',
    perk: 'VIP Ưu Tiên + Gợi Ý'
  },
  {
    id: 'chu_heo',
    name: 'Chú heo may mắn',
    aliases: ['chu heo may man', 'chu heo', 'chú heo may mắn', 'chú heo', 'lucky pig', 'pig', 'chú heo may ...', 'chú heo may'],
    coins: 10,
    icon: '🐷🎃',
    image: '/assets/gifts/chu_heo.svg',
    badge: '10 🪙',
    perk: 'VIP Ưu Tiên + Gợi Ý'
  },
  {
    id: 'banh_donut',
    name: 'Bánh Donut',
    aliases: ['banh donut', 'bánh donut', 'doughnut', 'donut'],
    coins: 30,
    icon: '🍩',
    image: '/assets/gifts/banh_donut.svg',
    badge: '30 🪙',
    perk: '2 Lượt Siêu VIP + TOP 3 AI'
  },
  {
    id: 'tay_cam',
    name: 'Tay cầm chơi game',
    aliases: ['tay cam choi game', 'tay cam', 'gamepad', 'controller', 'tay cầm', 'tay cầm chơi ...', 'tay cầm chơi'],
    coins: 100,
    icon: '🕹️',
    image: '/assets/gifts/tay_cam.svg',
    badge: '100 🪙',
    perk: '3 Lượt Đại Tướng #1 + Undo'
  }
];

function findMatchingGift(rawName, defaultCoins = 1) {
  if (!rawName) return TIKTOK_GIFTS[0];
  const lower = String(rawName).toLowerCase().trim();
  for (const g of TIKTOK_GIFTS) {
    if (g.name.toLowerCase() === lower || g.id === lower) return g;
    for (const alias of g.aliases) {
      if (lower.includes(alias) || alias.includes(lower)) return g;
    }
  }
  const byCoin = TIKTOK_GIFTS.find((g) => g.coins === defaultCoins);
  if (byCoin) {
    return { ...byCoin, name: rawName || byCoin.name };
  }
  return {
    id: 'custom_gift',
    name: rawName || 'Quà TikTok',
    aliases: [],
    coins: Math.max(1, Number(defaultCoins) || 1),
    icon: defaultCoins >= 100 ? '👑' : defaultCoins >= 30 ? '🔥' : defaultCoins >= 5 ? '⭐' : '🎁',
    image: '/assets/gifts/qua_mac_dinh.svg',
    badge: `${defaultCoins} 🪙`,
    perk: defaultCoins >= 100 ? '3 Lượt Đại Tướng' : defaultCoins >= 30 ? '2 Lượt Siêu VIP' : defaultCoins >= 5 ? 'VIP Ưu Tiên' : '1 Lượt Đi'
  };
}

// ============================================================================
// 2. QUẢN LÝ TIẾN TRÌNH ZEROTTS (GIỌNG ĐỌC BÌNH LUẬN VIÊN TIẾNG VIỆT AI)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'quangminh';
    this.voices = ['quangminh', 'tiendat', 'maichi', 'baotrang', 'giahuy', 'huuduc', 'kimoanh', 'hamy'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    if (process.env.DISABLE_ZEROTTS !== '1') {
      this.startWorker();
    } else {
      this.status = 'disabled';
    }
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
        const lines = this.buffer.split('\n');
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
        this.status = 'error';
      });
    } catch (err) {
      console.warn('[ZeroTTS] Không khởi chạy được:', err.message);
      this.status = 'error';
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
        this.voice = msg.voice || 'quangminh';
        this.voices = msg.voices || this.voices;
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] Sẵn sàng! Giọng mặc định: ${this.voice}`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          const filename = msg.file || msg.filename;
          if (msg.ok === false || !filename) {
            pending.resolve({ ok: false, error: msg.error || 'ZeroTTS synthesis failed' });
          } else {
            pending.resolve({
              ok: true,
              url: `/data/tts-cache/${filename}`,
              file: filename,
              duration: msg.durationSec ?? msg.duration ?? null,
              synthSec: msg.synthSec ?? msg.elapsed ?? 0,
              cached: !!msg.cached,
              voice: msg.voice || this.voice
            });
          }
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

  synthesize(text, voice = 'quangminh') {
    const clean = String(text || '').trim();
    if (!clean) return Promise.resolve({ ok: false, error: 'Nội dung rỗng' });
    if (!this.ready || !this.proc || this.proc.killed) {
      return Promise.resolve({ ok: false, error: `ZeroTTS chưa sẵn sàng (${this.status})` });
    }

    const chosenVoice = (voice || this.voice || 'quangminh').toLowerCase().trim();
    const inflightKey = `${chosenVoice}::${clean}`;
    if (this.inflight.has(inflightKey)) {
      return this.inflight.get(inflightKey);
    }

    const id = ++this.reqCounter;
    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS timeout (25s)' });
      }, 25000);

      this.pending.set(id, { resolve, timer });
      try {
        this.proc.stdin.write(
          JSON.stringify({ cmd: 'synth', id, text: clean, voice: chosenVoice }) + '\n'
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: err.message });
      }
    }).finally(() => {
      this.inflight.delete(inflightKey);
    });

    this.inflight.set(inflightKey, promise);
    return promise;
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
// 3. TIKTOK LIVE CONNECTOR (REAL-TIME GIFTS & COMMENTS)
// ============================================================================
let tiktokConn = null;
const giftComboTracker = new Map();
const tiktokState = {
  connected: false,
  connecting: false,
  username: process.env.TIKTOK_USER || 'zenfacts_vn',
  roomId: null,
  viewerCount: 0,
  lastError: null
};

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Kỳ Thủ';
  const avatar =
    u.profilePictureUrl ||
    u.profilePicture?.url?.[0] ||
    u.profilePicture?.urls?.[0] ||
    u.profilePicture?.urlList?.[0] ||
    u.profilePictureLarge?.url?.[0] ||
    u.profilePictureLarge?.urlList?.[0] ||
    u.profilePictureMedium?.url?.[0] ||
    u.profilePictureMedium?.urlList?.[0] ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarLarge?.url?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarThumb?.url?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    u.avatarMedium?.url?.[0] ||
    u.profilePictureUrls?.[0] ||
    data?.profilePictureUrl ||
    data?.userDetails?.profilePictureUrls?.[0] ||
    data?.profilePictureUrls?.[0] ||
    '';
  return { user, uniqueId, avatar };
}

async function resolveTikTokUsername(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Vui lòng nhập @username hoặc link TikTok Live cần kết nối');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) return directMatch[1];
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
      const finalUrl = resp.url || '';
      const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) return resolvedMatch[1];
    } catch (err) {
      console.warn('[TikTok URL Resolve Warning]', err.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
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
  giftComboTracker.clear();

  Object.assign(tiktokState, {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  });
  xiangqiEngine.updateTikTokStatus(tiktokState);

  const connection = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });
  tiktokConn = connection;
  const isCurrent = () => tiktokConn === connection;

  connection.on(ControlEvent.CONNECTED, (roomState) => {
    if (!isCurrent()) return;
    tiktokState.connected = true;
    tiktokState.connecting = false;
    tiktokState.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    tiktokState.lastError = null;
    console.log(`[TikTok Live] Đã kết nối phòng @${cleanUser} (roomId: ${tiktokState.roomId})`);
    xiangqiEngine.updateTikTokStatus(tiktokState);
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    if (!isCurrent()) return;
    giftComboTracker.clear();
    tiktokState.connected = false;
    tiktokState.connecting = false;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    xiangqiEngine.updateTikTokStatus(tiktokState);
  });

  connection.on(ControlEvent.ERROR, (err) => {
    if (!isCurrent()) return;
    tiktokState.lastError = err?.exception?.message || err?.info || err?.message || String(err);
    console.warn('[TikTok Live Warning]', tiktokState.lastError);
    xiangqiEngine.updateTikTokStatus(tiktokState);
  });

  connection.on(WebcastEvent.ROOM_USER, (data) => {
    if (!isCurrent()) return;
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      tiktokState.viewerCount = viewerCount;
      xiangqiEngine.updateTikTokStatus({ viewerCount });
    }
  });

  // Bình luận người xem -> CHỈ chấp nhận nước đi từ người đang giữ Active Turn (đã tặng quà)
  connection.on(WebcastEvent.CHAT, (data) => {
    if (!isCurrent()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    xiangqiEngine.handleComment({ user, uniqueId, avatar, comment: commentText });
  });

  // Quà tặng TikTok Live -> Mở khóa lượt đi nước tiếp theo (kèm VIP Priority)
  connection.on(WebcastEvent.GIFT, (data) => {
    if (!isCurrent()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftPayload = normalizeGiftPayload(data, uniqueId);
    const {
      giftId,
      giftName: rawGiftName,
      giftImage: liveGiftImage,
      diamondCount
    } = giftPayload;

    const deltaCount = getGiftComboDelta(giftComboTracker, giftPayload);
    if (deltaCount <= 0) return;

    const totalCoins = diamondCount * deltaCount;
    const matchedGift = findMatchingGift(rawGiftName || giftId, diamondCount);
    const finalGiftName = rawGiftName || matchedGift.name || 'Quà TikTok';
    const finalGiftImage = liveGiftImage || matchedGift.image || '/assets/gifts/qua_mac_dinh.svg';

    console.log(`[TikTok Gift] ${user} gửi ${deltaCount > 1 ? `${deltaCount}x ` : ''}${finalGiftName} (${totalCoins} xu)`);

    xiangqiEngine.handleGift({
      user,
      uniqueId,
      avatar,
      giftId: matchedGift.id || giftId,
      giftName: finalGiftName,
      giftImage: finalGiftImage,
      fallbackImage: matchedGift.image || '/assets/gifts/qua_mac_dinh.svg',
      coins: totalCoins,
      repeatCount: deltaCount
    });
  });

  try {
    const roomState = await connection.connect();
    if (!isCurrent()) return { ...tiktokState };
    tiktokState.connected = true;
    tiktokState.connecting = false;
    tiktokState.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    tiktokState.lastError = null;
    xiangqiEngine.updateTikTokStatus(tiktokState);
    return { ...tiktokState };
  } catch (err) {
    const message = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    if (isCurrent()) {
      giftComboTracker.clear();
      tiktokState.connected = false;
      tiktokState.connecting = false;
      tiktokState.lastError = message;
      xiangqiEngine.updateTikTokStatus(tiktokState);
    }
    throw new Error(message, { cause: err });
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  giftComboTracker.clear();
  tiktokState.connected = false;
  tiktokState.connecting = false;
  tiktokState.viewerCount = 0;
  tiktokState.lastError = null;
  xiangqiEngine.updateTikTokStatus(tiktokState);
  return { ...tiktokState };
}

// ============================================================================
// 4. EXPRESS APP, WEBSOCKET & JSON-RPC 2.0 DISPATCHER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/tts-cache', express.static(TTS_CACHE_DIR));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/state', (_req, res) => {
  res.json(xiangqiEngine.getState());
});

app.get('/api/gifts', (_req, res) => {
  res.json({ ok: true, gifts: TIKTOK_GIFTS });
});

app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || xiangqiEngine.getSettings().mcVoice || 'quangminh').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('error', (err) => {
  console.warn('[WebSocket Server Error]', err?.message || err);
});

function broadcastNotification(method, params) {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
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

const xiangqiEngine = new XiangqiLiveEngine(broadcastNotification, {
  giftCatalog: TIKTOK_GIFTS,
  findGift: findMatchingGift
});
const zeroTts = new ZeroTTSManager();

async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'xiangqi.getState':
      return xiangqiEngine.getState();

    case 'xiangqi.newGame':
      return xiangqiEngine.initNewBoard({
        broadcast: true,
        incrementMatch: params.incrementMatch !== false,
        fen: params.fen || undefined,
        announceMc: params.announceMc !== false
      });

    case 'xiangqi.hostMove':
      return xiangqiEngine.hostMove(params);

    case 'xiangqi.aiMoveNow':
      return xiangqiEngine.executeAiMove(params.forActiveViewer && xiangqiEngine.activeTurn ? {
        type: 'viewer_ai_assist',
        userKey: xiangqiEngine.activeTurn.userKey,
        user: xiangqiEngine.activeTurn.user,
        uniqueId: xiangqiEngine.activeTurn.uniqueId,
        avatar: xiangqiEngine.activeTurn.avatar,
        giftName: xiangqiEngine.activeTurn.giftName,
        giftImage: xiangqiEngine.activeTurn.giftImage,
        coins: xiangqiEngine.activeTurn.coins,
        tier: xiangqiEngine.activeTurn.tier
      } : null);

    case 'xiangqi.showHints':
      return xiangqiEngine.showHintsNow();

    case 'xiangqi.undo':
      return params.pair ? xiangqiEngine.undoMovePair() : xiangqiEngine.undoLastMove();

    case 'xiangqi.swapSides':
      return xiangqiEngine.swapSides();

    case 'xiangqi.resign':
      return xiangqiEngine.resignOrDraw('resign');

    case 'xiangqi.draw':
      return xiangqiEngine.resignOrDraw('draw');

    case 'xiangqi.sendGift':
      return xiangqiEngine.handleGift(params);

    case 'xiangqi.simulateComment':
    case 'xiangqi.submitComment':
      return xiangqiEngine.handleComment(params);

    case 'xiangqi.skipTurn':
      return xiangqiEngine.skipActiveTurn();

    case 'xiangqi.clearQueue':
      return xiangqiEngine.clearQueue();

    case 'xiangqi.resetLeaderboard':
      return xiangqiEngine.resetLeaderboard();

    case 'xiangqi.getSettings':
      return xiangqiEngine.getSettings();

    case 'xiangqi.updateSettings':
    case 'xiangqi.setSettings':
      return xiangqiEngine.updateSettings(params);

    case 'xiangqi.mcCommand':
      return xiangqiEngine.sendMcCommand(params.action);

    case 'xiangqi.getGifts':
      return TIKTOK_GIFTS;

    case 'live.connect':
    case 'tiktok.connect':
    case 'xiangqi.connectTikTok':
      return await connectTikTokLive(params.username);

    case 'live.disconnect':
    case 'tiktok.disconnect':
    case 'xiangqi.disconnectTikTok':
      return disconnectTikTokLive();

    case 'tts.synthesize':
      return await zeroTts.synthesize(params.text, params.voice);

    case 'tts.status':
      return zeroTts.getStatus();

    default:
      throw new Error(`RPC method không tồn tại: ${method}`);
  }
}

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
    return res.json({ jsonrpc: '2.0', id: body.id ?? null, result });
  } catch (err) {
    return res.status(200).json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32000, message: err.message || 'Internal RPC Error' }
    });
  }
});

wss.on('connection', (ws) => {
  ws.on('error', (err) => {
    console.warn('[WS Client Error]', err?.message || err);
  });

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    method: 'xiangqi.state',
    params: xiangqiEngine.getState()
  }));

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    method: 'tts.status',
    params: zeroTts.getStatus()
  }));

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
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32000, message: err.message || 'RPC Error' }
        }));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`♟️  KỲ ĐÀI CỜ TƯỚNG TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎥 OBS Browser Source sạch : http://localhost:${PORT}/?obs=1`);
  console.log(`🎛️ Bảng điều khiển Admin   : http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  if (process.env.DISABLE_TIKTOK_AUTOCONNECT !== '1') {
    const defaultChannel = process.env.TIKTOK_USER || tiktokState.username || 'zenfacts_vn';
    if (defaultChannel) {
      connectTikTokLive(defaultChannel).catch((err) => {
        console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
      });
    }
  }
});
