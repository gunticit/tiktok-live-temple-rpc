'use strict';

/**
 * Xiangqi Live Match Engine — Kỳ Đài Cờ Tướng TikTok Live
 * Strict Gift-Gated Turn Queue + VIP Priority + AI Đại Kiện Tướng + ZeroTTS MC Commentary
 *
 * Core rule:
 * - On Viewer's turn, ONLY the viewer who earned the current Active Turn via a TikTok Gift
 *   may submit the next move via chat comment (Grid coords like "H2 E2" or VN notation "P2-5").
 * - Non-donors attempting to move are politely blocked and prompted to send a gift.
 * - Higher-coin gifts jump ahead in the waiting queue (VIP Priority) and unlock extra time / hints / undo.
 * - Paid tickets in the queue are preserved across games so viewers never lose gifts on checkmate.
 */

const fs = require('fs');
const path = require('path');
const {
  INITIAL_FEN,
  PIECE_META,
  getSide,
  oppositeSide,
  cloneBoard,
  parseFen,
  toFen,
  positionKey,
  coordToSquare,
  moveToUcci,
  moveToGridDisplay,
  isInCheck,
  generateLegalMoves,
  makeMoveInPlace,
  evaluateGameStatus,
  formatMoveVietnamese,
  describeIllegalMove,
  parseMoveFromComment
} = require('./lib/xiangqi-core.cjs');
const {
  DIFFICULTY_PRESETS,
  computeZobristHash,
  evaluateBoardRedPerspective,
  findBestMove,
  getTopMoves
} = require('./lib/xiangqi-ai.cjs');

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'xiangqi-settings.json');
const STATE_FILE = path.join(DATA_DIR, 'xiangqi-state.json');
const DEFAULT_GIFT_IMAGE = '/assets/gifts/qua_mac_dinh.svg';

const VALID_VOICES = ['quangminh', 'tiendat', 'maichi', 'baotrang', 'giahuy', 'huuduc', 'kimoanh', 'hamy'];

const DEFAULT_SETTINGS = {
  gameMode: 'host_vs_viewers', // 'host_vs_viewers' | 'viewers_vs_viewers'
  hostSide: 'b',               // 'b' (Black/Hậu at top) | 'r' (Red/Tiên at bottom)
  hostAutoAi: true,            // true = AI plays for hostSide automatically; false = Host plays manually
  aiDifficulty: 'club',        // 'amateur' | 'club' | 'master' | 'grandmaster'
  aiThinkDelayMs: 1600,
  minGiftCoins: 1,
  turnTimeoutSeconds: 30,
  timeoutAction: 'ai_move',    // 'ai_move' | 'skip_next'
  vipPriority: true,
  freeHintForAll: false,
  autoNewGame: true,
  autoNewGameDelaySec: 10,
  showViPieceLabels: true,
  mcAutoRead: true,
  mcVoice: 'quangminh',
  mcVolume: 0.95,
  sfxEnabled: true,
  sfxVolume: 0.85
};

function normalizeUserKey(uniqueId, user) {
  const raw = String(uniqueId || user || '').trim().toLowerCase().replace(/^@+/, '');
  return raw || `guest_${Date.now()}`;
}

function formatDisplayHandle(user, uniqueId) {
  const cleanUser = String(user || '').trim();
  if (cleanUser) return cleanUser;
  const cleanUid = String(uniqueId || '').trim().replace(/^@+/, '');
  return cleanUid ? `@${cleanUid}` : 'Kỳ Thủ';
}

function resolveGiftTier(coins, freeHintForAll = false) {
  const c = Math.max(1, Math.floor(Number(coins) || 1));
  if (c >= 100) {
    return {
      tier: 'legendary',
      tierLabel: 'ĐẠI TƯỚNG VIP',
      tickets: 3,
      bonusTimeSec: 15,
      canHint: true,
      canUndo: true,
      autoHint: true
    };
  }
  if (c >= 30) {
    return {
      tier: 'epic',
      tierLabel: 'SIÊU VIP',
      tickets: 2,
      bonusTimeSec: 10,
      canHint: true,
      canUndo: false,
      autoHint: true
    };
  }
  if (c >= 5) {
    return {
      tier: 'vip',
      tierLabel: 'VIP ƯU TIÊN',
      tickets: 1,
      bonusTimeSec: 5,
      canHint: true,
      canUndo: false,
      autoHint: false
    };
  }
  return {
    tier: 'standard',
    tierLabel: 'KỲ THỦ',
    tickets: 1,
    bonusTimeSec: 0,
    canHint: Boolean(freeHintForAll),
    canUndo: false,
    autoHint: false
  };
}

function sideNameVi(side) {
  return side === 'r' ? 'ĐỎ' : 'ĐEN';
}

function sortCapturedPieces(list) {
  const order = { R: 1, C: 2, N: 3, B: 4, A: 5, P: 6, K: 0 };
  return list.toSorted((a, b) => (order[a.toUpperCase()] || 9) - (order[b.toUpperCase()] || 9));
}

class XiangqiLiveEngine {
  constructor(broadcastCallback, options = {}) {
    this.broadcast = typeof broadcastCallback === 'function' ? broadcastCallback : (() => {});
    this.giftCatalog = Array.isArray(options.giftCatalog) ? options.giftCatalog : [];
    this.findGift = typeof options.findGift === 'function' ? options.findGift : null;
    this.persist = options.persist !== false;

    if (this.persist) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.settings = this.persist ? this.loadSettings() : { ...DEFAULT_SETTINGS };
    this.saveSettingsTimer = null;
    this.saveStateTimer = null;

    // Persistent cross-game statistics (real viewers only — zero mock entries)
    this.matchNumber = 1;
    this.scoreboard = {
      redWins: 0,
      blackWins: 0,
      draws: 0,
      viewerWins: 0,
      aiWins: 0
    };
    this.stats = {
      totalGiftsReceived: 0,
      totalCoinsReceived: 0,
      totalMovesAllTime: 0
    };
    this.players = new Map();
    if (this.persist) {
      this.loadPersistentState();
    }

    // TikTok live status synced from server.js
    this.tiktokStatus = {
      connected: false,
      connecting: false,
      username: '',
      roomId: null,
      viewerCount: 0,
      lastError: null
    };

    // Gift-Gated Turn Queue (persists across games so donors never lose paid turns!)
    this.ticketSeq = 1;
    this.moveQueue = [];
    this.activeTurn = null;
    this.recentGifts = [];
    this.recentEvents = [];

    // Timers & Speech counter
    this.aiTimer = null;
    this.aiThinking = false;
    this.autoNewGameTimer = null;
    this.autoNewGameRemainingSec = 0;
    this.speechCounter = 0;
    this.lastRejectByUser = new Map();

    // Initialize board state
    this.initNewBoard({ broadcast: false, incrementMatch: false });

    // Start 1-second authoritative tick loop
    this.ticker = setInterval(() => this.onTick(), 1000);
  }

  // ==========================================================================
  // PERSISTENCE (Settings & Real Leaderboard)
  // ==========================================================================
  loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        return this.sanitizeSettings({ ...DEFAULT_SETTINGS, ...(raw || {}) });
      }
    } catch (err) {
      console.warn('[XiangqiEngine] Không đọc được xiangqi-settings.json:', err.message);
    }
    return { ...DEFAULT_SETTINGS };
  }

  sanitizeSettings(raw = {}) {
    const cur = this.settings || DEFAULT_SETTINGS;
    const gameMode = raw.gameMode === 'viewers_vs_viewers' ? 'viewers_vs_viewers' : 'host_vs_viewers';
    const hostSide = raw.hostSide === 'r' ? 'r' : 'b';
    const aiDifficulty = DIFFICULTY_PRESETS[raw.aiDifficulty] ? raw.aiDifficulty : (cur.aiDifficulty || 'club');
    const aiThinkDelayRaw = Number(raw.aiThinkDelayMs ?? cur.aiThinkDelayMs ?? 1600);
    const aiThinkDelayMs = Number.isFinite(aiThinkDelayRaw) ? Math.max(400, Math.min(6000, Math.round(aiThinkDelayRaw))) : 1600;

    const minGiftRaw = Number(raw.minGiftCoins ?? cur.minGiftCoins ?? 1);
    const minGiftCoins = Number.isFinite(minGiftRaw) ? Math.max(1, Math.min(10000, Math.round(minGiftRaw))) : 1;

    const timeoutRaw = Number(raw.turnTimeoutSeconds ?? cur.turnTimeoutSeconds ?? 30);
    const turnTimeoutSeconds = Number.isFinite(timeoutRaw) ? Math.max(10, Math.min(180, Math.round(timeoutRaw))) : 30;

    const timeoutAction = raw.timeoutAction === 'skip_next' ? 'skip_next' : 'ai_move';

    const autoNewDelayRaw = Number(raw.autoNewGameDelaySec ?? cur.autoNewGameDelaySec ?? 10);
    const autoNewGameDelaySec = Number.isFinite(autoNewDelayRaw) ? Math.max(3, Math.min(60, Math.round(autoNewDelayRaw))) : 10;

    const voiceRaw = String(raw.mcVoice ?? cur.mcVoice ?? 'quangminh').toLowerCase().trim();
    const mcVoice = VALID_VOICES.includes(voiceRaw) ? voiceRaw : 'quangminh';

    const mcVolRaw = Number(raw.mcVolume ?? cur.mcVolume ?? 0.95);
    const mcVolume = Number.isFinite(mcVolRaw) ? Math.max(0, Math.min(1, +mcVolRaw.toFixed(2))) : 0.95;

    const sfxVolRaw = Number(raw.sfxVolume ?? cur.sfxVolume ?? 0.85);
    const sfxVolume = Number.isFinite(sfxVolRaw) ? Math.max(0, Math.min(1, +sfxVolRaw.toFixed(2))) : 0.85;

    return {
      gameMode,
      hostSide,
      hostAutoAi: raw.hostAutoAi !== undefined ? Boolean(raw.hostAutoAi) : Boolean(cur.hostAutoAi),
      aiDifficulty,
      aiThinkDelayMs,
      minGiftCoins,
      turnTimeoutSeconds,
      timeoutAction,
      vipPriority: raw.vipPriority !== undefined ? Boolean(raw.vipPriority) : Boolean(cur.vipPriority),
      freeHintForAll: raw.freeHintForAll !== undefined ? Boolean(raw.freeHintForAll) : Boolean(cur.freeHintForAll),
      autoNewGame: raw.autoNewGame !== undefined ? Boolean(raw.autoNewGame) : Boolean(cur.autoNewGame),
      autoNewGameDelaySec,
      showViPieceLabels: raw.showViPieceLabels !== undefined ? Boolean(raw.showViPieceLabels) : Boolean(cur.showViPieceLabels),
      mcAutoRead: raw.mcAutoRead !== undefined ? Boolean(raw.mcAutoRead) : Boolean(cur.mcAutoRead),
      mcVoice,
      mcVolume,
      sfxEnabled: raw.sfxEnabled !== undefined ? Boolean(raw.sfxEnabled) : Boolean(cur.sfxEnabled),
      sfxVolume
    };
  }

  saveSettings() {
    if (!this.persist) return;
    clearTimeout(this.saveSettingsTimer);
    this.saveSettingsTimer = setTimeout(() => {
      fs.promises
        .writeFile(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf8')
        .catch((err) => console.warn('[XiangqiEngine] Lỗi lưu settings:', err.message));
    }, 300);
  }

  loadPersistentState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (saved && typeof saved === 'object') {
          this.matchNumber = Math.max(1, Number(saved.matchNumber) || 1);
          if (saved.scoreboard) {
            this.scoreboard = { ...this.scoreboard, ...saved.scoreboard };
          }
          if (saved.stats) {
            this.stats = { ...this.stats, ...saved.stats };
          }
          if (Array.isArray(saved.players)) {
            for (const p of saved.players) {
              if (p && p.userKey) {
                this.players.set(p.userKey, p);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[XiangqiEngine] Không đọc được xiangqi-state.json:', err.message);
    }
  }

  savePersistentState() {
    if (!this.persist) return;
    clearTimeout(this.saveStateTimer);
    this.saveStateTimer = setTimeout(() => {
      const payload = {
        matchNumber: this.matchNumber,
        scoreboard: this.scoreboard,
        stats: this.stats,
        players: Array.from(this.players.values())
      };
      fs.promises
        .writeFile(STATE_FILE, JSON.stringify(payload, null, 2), 'utf8')
        .catch((err) => console.warn('[XiangqiEngine] Lỗi lưu state:', err.message));
    }, 600);
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(patch = {}) {
    const prev = { ...this.settings };
    this.settings = this.sanitizeSettings({ ...this.settings, ...(patch || {}) });
    this.saveSettings();

    // If vipPriority toggled on, re-sort waiting queue
    if (this.settings.vipPriority && !prev.vipPriority && this.moveQueue.length > 1) {
      this.sortMoveQueue();
    }

    // If mode or hostSide changed while a viewer was active on the wrong side, re-sync safely
    if (this.activeTurn && (!this.isViewerTurn() || this.activeTurn.side !== this.turn)) {
      this.returnActiveTurnToQueueFront();
    }

    // If hostAutoAi toggled off, cancel pending AI timer
    if (!this.settings.hostAutoAi) {
      this.clearAiTimer();
    }

    // If autoNewGame toggled off while counting down, cancel restart timer
    if (!this.settings.autoNewGame) {
      this.clearAutoNewGameTimer();
    }

    this.ensureTurnFlow();
    this.broadcast('xiangqi.settingsUpdated', this.getSettings());
    this.broadcastState();
    return { ok: true, settings: this.getSettings() };
  }

  updateTikTokStatus(patch = {}) {
    this.tiktokStatus = { ...this.tiktokStatus, ...(patch || {}) };
    this.broadcast('xiangqi.tiktokStatus', { ...this.tiktokStatus });
    this.broadcastState();
  }

  // ==========================================================================
  // BOARD INITIALIZATION & TURN LOGIC
  // ==========================================================================
  initNewBoard(options = {}) {
    this.clearAiTimer();
    this.clearAutoNewGameTimer();

    // Preserve activeTurn back into front of queue if a game restarts mid-turn!
    if (options.preserveActiveTurn !== false && this.activeTurn) {
      this.returnActiveTurnToQueueFront();
    }

    if (options.incrementMatch) {
      this.matchNumber += 1;
    }

    const fen = options.fen || INITIAL_FEN;
    const parsed = parseFen(fen);
    this.board = parsed.board;
    this.turn = parsed.turn;
    this.halfMoveClock = parsed.halfMoveClock;
    this.fullMoveNumber = parsed.fullMoveNumber;

    this.positionCounts = new Map();
    const startKey = positionKey(this.board, this.turn);
    this.positionCounts.set(startKey, 1);

    this.seenHashes = new Set([computeZobristHash(this.board, this.turn)]);
    this.history = [];
    this.capturedByRed = [];
    this.capturedByBlack = [];
    this.lastMove = null;
    this.hintMoves = [];
    this.evalRedCp = evaluateBoardRedPerspective(this.board);

    const statusInfo = evaluateGameStatus(this.board, this.turn, this.halfMoveClock, this.positionCounts);
    this.status = statusInfo.status;
    this.isOver = statusInfo.isOver;
    this.winner = statusInfo.winner;
    this.inCheck = statusInfo.inCheck;
    this.endReason = statusInfo.reason;
    this.legalMoves = generateLegalMoves(this.board, this.turn);

    this.logEvent('system', `🆕 Bắt đầu ván Cờ Tướng #${this.matchNumber} — Phe ĐỎ đi tiên!`);
    this.savePersistentState();

    if (options.announceMc) {
      this.emitMcSpeech([
        `Ván cờ tướng số ${this.matchNumber} chính thức khai cuộc! Tặng quà ngay để giành quyền cầm quân đi nước tiếp theo!`
      ], 'new_game');
    }

    this.ensureTurnFlow();
    if (options.broadcast !== false) {
      this.broadcast('xiangqi.newGame', { matchNumber: this.matchNumber });
      this.broadcastState();
    }
    return this.getState();
  }

  isViewerTurn() {
    if (this.isOver) return false;
    if (this.settings.gameMode === 'viewers_vs_viewers') return true;
    return this.turn !== this.settings.hostSide;
  }

  getViewerSide() {
    if (this.settings.gameMode === 'viewers_vs_viewers') return this.turn;
    return oppositeSide(this.settings.hostSide);
  }

  clearAiTimer() {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.aiThinking = false;
  }

  clearAutoNewGameTimer() {
    if (this.autoNewGameTimer) {
      clearTimeout(this.autoNewGameTimer);
      this.autoNewGameTimer = null;
    }
    this.autoNewGameRemainingSec = 0;
  }

  sortMoveQueue() {
    if (!this.settings.vipPriority) {
      this.moveQueue = this.moveQueue.toSorted((a, b) => a.createdAt - b.createdAt);
      return;
    }
    this.moveQueue = this.moveQueue.toSorted(
      (a, b) => (b.coins - a.coins) || (a.createdAt - b.createdAt)
    );
  }

  returnActiveTurnToQueueFront() {
    if (!this.activeTurn) return;
    const restored = {
      id: this.activeTurn.id,
      userKey: this.activeTurn.userKey,
      user: this.activeTurn.user,
      uniqueId: this.activeTurn.uniqueId,
      avatar: this.activeTurn.avatar,
      giftId: this.activeTurn.giftId,
      giftName: this.activeTurn.giftName,
      giftImage: this.activeTurn.giftImage,
      fallbackImage: this.activeTurn.fallbackImage,
      coins: this.activeTurn.coins,
      tier: this.activeTurn.tier,
      tierLabel: this.activeTurn.tierLabel,
      bonusTimeSec: this.activeTurn.bonusTimeSec,
      canHint: this.activeTurn.canHint,
      canUndo: this.activeTurn.canUndo,
      autoHint: this.activeTurn.autoHint,
      createdAt: this.activeTurn.createdAt
    };
    this.activeTurn = null;
    this.moveQueue.unshift(restored);
  }

  /**
   * Core orchestrator: assigns next viewer from queue or triggers Host/AI response.
   */
  ensureTurnFlow() {
    if (this.isOver) {
      this.clearAiTimer();
      this.activeTurn = null;
      if (this.settings.autoNewGame && this.autoNewGameRemainingSec <= 0) {
        this.autoNewGameRemainingSec = this.settings.autoNewGameDelaySec;
      }
      return;
    }

    if (this.isViewerTurn()) {
      this.clearAiTimer();
      if (this.activeTurn && this.activeTurn.side === this.turn) {
        return;
      }
      if (this.activeTurn && this.activeTurn.side !== this.turn) {
        this.returnActiveTurnToQueueFront();
      }
      if (this.moveQueue.length > 0) {
        this.assignNextViewerTurn();
      }
    } else {
      // Host / AI turn
      if (this.activeTurn) {
        this.returnActiveTurnToQueueFront();
      }
      if (this.settings.hostAutoAi && !this.aiTimer) {
        this.scheduleAiMove();
      }
    }
  }

  assignNextViewerTurn() {
    if (this.moveQueue.length === 0 || !this.isViewerTurn() || this.isOver) {
      this.activeTurn = null;
      return null;
    }
    const ticket = this.moveQueue.shift();
    const durationSec = this.settings.turnTimeoutSeconds + (ticket.bonusTimeSec || 0);
    const now = Date.now();
    this.activeTurn = {
      ...ticket,
      side: this.turn,
      assignedAt: now,
      expiresAt: now + durationSec * 1000,
      durationSec,
      remainingSec: durationSec,
      hintUsed: false
    };

    // Automatic AI Hint arrows as a perk for Epic / Legendary donors (>= 30 coins)
    if (ticket.autoHint) {
      this.computeAndShowHints(3);
    }

    this.logEvent(
      'turn',
      `🎯 Mời ${ticket.user} (${ticket.tierLabel} • ${ticket.giftName}) cầm quân ${sideNameVi(this.turn)} (${durationSec}s)`
    );

    this.broadcast('xiangqi.turnAssigned', {
      activeTurn: { ...this.activeTurn },
      queueLength: this.moveQueue.length
    });

    const sideText = this.turn === 'r' ? 'quân Đỏ' : 'quân Đen';
    this.emitMcSpeech([
      `Xin mời kỳ thủ ${ticket.user} vừa tặng ${ticket.giftName} lên cầm ${sideText}! Bạn có ${durationSec} giây bình luận tọa độ nước đi!`
    ], 'turn_assigned');

    return this.activeTurn;
  }

  scheduleAiMove(delayOverrideMs = null) {
    this.clearAiTimer();
    if (this.isOver || this.isViewerTurn()) return;
    this.aiThinking = true;
    const delay = delayOverrideMs !== null ? delayOverrideMs : this.settings.aiThinkDelayMs;

    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      this.aiThinking = false;
      if (this.isOver || this.isViewerTurn()) return;
      this.executeAiMove(null);
    }, delay);
  }

  // ==========================================================================
  // TICK LOOP (1s Countdown for Active Donor & Auto New Game)
  // ==========================================================================
  onTick() {
    if (this.isOver) {
      if (this.settings.autoNewGame && this.autoNewGameRemainingSec > 0) {
        this.autoNewGameRemainingSec -= 1;
        this.broadcast('xiangqi.tick', {
          autoNewGameRemainingSec: this.autoNewGameRemainingSec,
          activeTurnRemainingSec: 0
        });
        if (this.autoNewGameRemainingSec <= 0) {
          this.initNewBoard({ broadcast: true, incrementMatch: true, announceMc: true });
        }
      }
      return;
    }

    if (this.activeTurn && this.isViewerTurn()) {
      const remaining = Math.max(0, Math.ceil((this.activeTurn.expiresAt - Date.now()) / 1000));
      this.activeTurn.remainingSec = remaining;
      this.broadcast('xiangqi.tick', {
        activeTurnRemainingSec: remaining,
        activeTurnDurationSec: this.activeTurn.durationSec,
        activeTurnUser: this.activeTurn.user,
        autoNewGameRemainingSec: 0
      });

      if (remaining <= 0) {
        this.handleActiveTurnTimeout();
      }
    }
  }

  handleActiveTurnTimeout() {
    if (!this.activeTurn || this.isOver) return;
    const expired = this.activeTurn;

    if (this.settings.timeoutAction === 'ai_move') {
      this.logEvent('timeout', `⏱️ Hết giờ của ${expired.user} — AI Kỳ Sư tự động đi hộ nước mạnh nhất!`);
      this.executeAiMove({
        type: 'viewer_ai_assist',
        userKey: expired.userKey,
        user: expired.user,
        uniqueId: expired.uniqueId,
        avatar: expired.avatar,
        giftName: expired.giftName,
        giftImage: expired.giftImage,
        coins: expired.coins,
        tier: expired.tier
      });
    } else {
      this.activeTurn = null;
      this.logEvent('timeout', `⏱️ Hết giờ của ${expired.user} — chuyển lượt sang kỳ thủ kế tiếp!`);
      this.broadcast('xiangqi.feedback', {
        level: 'warning',
        message: `⏱️ Hết giờ! Lượt của ${expired.user} đã kết thúc.`
      });
      this.ensureTurnFlow();
      this.broadcastState();
    }
  }

  // ==========================================================================
  // GIFT INGESTION (ONLY WAY FOR VIEWERS TO UNLOCK MOVES!)
  // ==========================================================================
  handleGift(params = {}) {
    const uniqueId = String(params.uniqueId || params.user || '').trim();
    const user = formatDisplayHandle(params.user, uniqueId);
    const userKey = normalizeUserKey(uniqueId, user);
    const avatar = String(params.avatar || '').trim() ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userKey)}`;

    const rawCoins = Number(params.coins);
    let matched = null;
    if (this.findGift) {
      matched = this.findGift(params.giftName || params.giftId || '', Number.isFinite(rawCoins) ? rawCoins : 1);
    }
    const repeatCount = Math.max(1, Math.floor(Number(params.repeatCount) || 1));
    const unitCoins = Number.isFinite(rawCoins) && rawCoins > 0
      ? rawCoins
      : ((matched?.coins || 1) * repeatCount);
    const coins = Math.max(1, Math.floor(unitCoins));

    const giftName = String(params.giftName || matched?.name || 'Quà TikTok').trim();
    const giftId = String(params.giftId || matched?.id || 'custom_gift').trim();
    const giftImage = String(params.giftImage || matched?.image || DEFAULT_GIFT_IMAGE).trim();
    const fallbackImage = String(params.fallbackImage || matched?.image || DEFAULT_GIFT_IMAGE).trim();

    this.stats.totalGiftsReceived += repeatCount;
    this.stats.totalCoinsReceived += coins;

    // Record real donor in leaderboard immediately
    this.recordPlayerActivity({
      userKey,
      user,
      uniqueId,
      avatar,
      coinsAdded: coins,
      giftsAdded: repeatCount,
      scoreAdded: coins * 5,
      giftName,
      giftImage
    });

    const qualified = coins >= this.settings.minGiftCoins;
    const tierInfo = resolveGiftTier(coins, this.settings.freeHintForAll);

    let queueStatusText = '';
    let assignedImmediately = false;
    let queuePosition = 0;

    if (!qualified) {
      queueStatusText = `Cần tối thiểu ${this.settings.minGiftCoins}🪙 để nhận lượt đi!`;
      this.logEvent('gift', `🎁 ${user} tặng ${giftName} (${coins}🪙) — chưa đủ mức tối thiểu ${this.settings.minGiftCoins}🪙`);
    } else {
      const now = Date.now();
      const createdTickets = [];
      for (let i = 0; i < tierInfo.tickets; i++) {
        createdTickets.push({
          id: `tkt_${this.ticketSeq++}`,
          userKey,
          user,
          uniqueId,
          avatar,
          giftId,
          giftName,
          giftImage,
          fallbackImage,
          coins,
          tier: tierInfo.tier,
          tierLabel: tierInfo.tierLabel,
          bonusTimeSec: tierInfo.bonusTimeSec,
          canHint: tierInfo.canHint,
          canUndo: tierInfo.canUndo,
          autoHint: tierInfo.autoHint,
          createdAt: now + i
        });
      }

      // Add tickets to queue & apply VIP priority sorting
      for (const t of createdTickets) {
        this.moveQueue.push(t);
      }
      this.sortMoveQueue();

      // If it's currently Viewer's turn and nobody is holding the active turn -> assign immediately!
      if (!this.isOver && this.isViewerTurn() && !this.activeTurn) {
        this.assignNextViewerTurn();
        assignedImmediately = true;
        queueStatusText = tierInfo.tickets > 1
          ? `⚡ LÊN BÀN NGAY! (+${tierInfo.tickets} lượt ${tierInfo.tierLabel})`
          : `⚡ LÊN BÀN CẦM QUÂN NGAY!`;
      } else {
        const firstIdx = this.moveQueue.findIndex((t) => t.id === createdTickets[0].id);
        queuePosition = firstIdx >= 0 ? firstIdx + 1 : this.moveQueue.length;
        if (queuePosition === 1 && coins >= 5) {
          queueStatusText = `👑 NHẢY LÊN VIP #1 HÀNG ĐỢI! (+${tierInfo.tickets} lượt)`;
        } else {
          queueStatusText = `🎟️ ĐÃ NHẬN +${tierInfo.tickets} LƯỢT (Hàng đợi #${queuePosition})`;
        }

        // Shoutout for high-value VIP gifts entering the queue
        if (coins >= 10) {
          this.emitMcSpeech([
            `Cảm ơn đại gia ${user} vừa tặng ${giftName}! Đã nhận ${tierInfo.tickets} lượt đi ${tierInfo.tierLabel}, ưu tiên vị trí số ${queuePosition}!`
          ], 'vip_gift');
        }
      }

      this.logEvent(
        'gift',
        `🎁 ${user} tặng ${repeatCount > 1 ? `${repeatCount}x ` : ''}${giftName} (${coins}🪙) → ${queueStatusText}`
      );
    }

    const giftAlert = {
      id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userKey,
      user,
      uniqueId,
      avatar,
      giftId,
      giftName,
      giftImage,
      fallbackImage,
      coins,
      repeatCount,
      tier: tierInfo.tier,
      tierLabel: tierInfo.tierLabel,
      ticketsGranted: qualified ? tierInfo.tickets : 0,
      assignedImmediately,
      queuePosition,
      statusText: queueStatusText,
      timestamp: Date.now()
    };

    this.recentGifts.unshift(giftAlert);
    if (this.recentGifts.length > 20) this.recentGifts.pop();

    this.broadcast('xiangqi.gift', giftAlert);
    this.broadcastState();
    this.savePersistentState();
    return { ok: true, giftAlert };
  }

  // ==========================================================================
  // VIEWER COMMENT HANDLING (STRICT GIFT-GATING ENFORCEMENT)
  // ==========================================================================
  handleComment(params = {}) {
    const uniqueId = String(params.uniqueId || params.user || '').trim();
    const user = formatDisplayHandle(params.user, uniqueId);
    const userKey = normalizeUserKey(uniqueId, user);
    const avatar = String(params.avatar || '').trim() ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userKey)}`;
    const comment = String(params.comment || '').trim();
    if (!comment) return { ok: false, ignored: true };

    const isActiveMover = Boolean(this.activeTurn && this.activeTurn.userKey === userKey && this.isViewerTurn());
    const queueIndex = this.moveQueue.findIndex((t) => t.userKey === userKey);

    this.broadcast('xiangqi.chat', {
      user,
      uniqueId,
      avatar,
      comment,
      isActiveMover,
      inQueue: queueIndex >= 0,
      queuePosition: queueIndex >= 0 ? queueIndex + 1 : 0,
      timestamp: Date.now()
    });

    if (this.isOver) {
      return { ok: false, reason: 'game_over' };
    }

    // Parse comment against current board & side
    const parsed = parseMoveFromComment(comment, this.board, this.turn, this.legalMoves);

    // 1. Authorized Active Donor!
    if (isActiveMover) {
      if (!parsed) {
        return { ok: false, ignored: true, reason: 'normal_chat' };
      }

      if (parsed.type === 'command') {
        if (parsed.command === 'auto') {
          this.logEvent('move', `🤖 ${user} yêu cầu AI đi hộ nước tiếp theo!`);
          return this.executeAiMove({
            type: 'viewer_ai_assist',
            userKey: this.activeTurn.userKey,
            user: this.activeTurn.user,
            uniqueId: this.activeTurn.uniqueId,
            avatar: this.activeTurn.avatar,
            giftName: this.activeTurn.giftName,
            giftImage: this.activeTurn.giftImage,
            coins: this.activeTurn.coins,
            tier: this.activeTurn.tier
          });
        }
        if (parsed.command === 'hint') {
          if (this.activeTurn.canHint || this.settings.freeHintForAll) {
            const hints = this.computeAndShowHints(3);
            this.activeTurn.hintUsed = true;
            const topText = hints[0] ? `${hints[0].notation.full} (${hints[0].grid})` : 'không có';
            this.broadcast('xiangqi.feedback', {
              level: 'info',
              message: `💡 Gợi ý AI cho ${user}: ${topText}`
            });
            this.broadcastState();
            return { ok: true, command: 'hint', hints };
          }
          this.broadcast('xiangqi.feedback', {
            level: 'warning',
            message: `💡 ${user}: Tính năng Gợi ý AI dành cho quà VIP từ 5🪙 trở lên!`
          });
          return { ok: false, reason: 'hint_requires_vip' };
        }
        if (parsed.command === 'undo') {
          if (this.activeTurn.canUndo && this.history.length >= 2) {
            this.undoMovePair({ requestedBy: user });
            return { ok: true, command: 'undo' };
          }
          this.broadcast('xiangqi.feedback', {
            level: 'warning',
            message: `↩️ ${user}: Quyền Đi Lại (Undo) dành cho ĐẠI TƯỚNG VIP (quà ≥ 100🪙)!`
          });
          return { ok: false, reason: 'undo_requires_legendary' };
        }
      }

      if (parsed.type === 'move') {
        const actor = {
          type: 'viewer',
          userKey: this.activeTurn.userKey,
          user: this.activeTurn.user,
          uniqueId: this.activeTurn.uniqueId,
          avatar: this.activeTurn.avatar,
          giftName: this.activeTurn.giftName,
          giftImage: this.activeTurn.giftImage,
          coins: this.activeTurn.coins,
          tier: this.activeTurn.tier,
          tierLabel: this.activeTurn.tierLabel
        };
        return this.applyMove(parsed.move, actor);
      }

      if (parsed.type === 'illegal') {
        this.broadcast('xiangqi.feedback', {
          level: 'error',
          user,
          message: `⚠️ ${user}: ${parsed.reason}`
        });
        this.logEvent('reject', `⚠️ ${user} đi lỗi "${comment}": ${parsed.reason}`);
        return { ok: false, reason: 'illegal_move', detail: parsed.reason };
      }
      return { ok: false, ignored: true };
    }

    // 2. Non-Active Viewer attempting to submit a move -> STRICT GIFT GATE!
    if (parsed && (parsed.type === 'move' || parsed.type === 'illegal')) {
      const now = Date.now();
      const lastTs = this.lastRejectByUser.get(userKey) || 0;
      const shouldNotify = now - lastTs > 3500;
      if (shouldNotify) {
        this.lastRejectByUser.set(userKey, now);
        if (this.lastRejectByUser.size > 300) {
          const oldest = this.lastRejectByUser.keys().next().value;
          this.lastRejectByUser.delete(oldest);
        }
      }

      let rejectReason = 'gift_required';
      let message = '';

      if (!this.isViewerTurn()) {
        rejectReason = 'not_viewer_turn';
        message = `⏳ Đang là lượt ${this.settings.hostAutoAi ? 'AI Đại Kiện Tướng' : 'Host'}! Tặng quà để xếp hàng đi nước tiếp theo!`;
      } else if (queueIndex >= 0) {
        rejectReason = 'waiting_in_queue';
        message = `⏳ ${user}: Bạn đang ở vị trí #${queueIndex + 1} trong hàng đợi, chờ tới lượt nhé!`;
      } else if (this.activeTurn) {
        rejectReason = 'gift_required';
        message = `🔒 ${user}: Đang là lượt của ${this.activeTurn.user}! Tặng quà (từ ${this.settings.minGiftCoins}🪙) để nhận lượt đi tiếp theo!`;
      } else {
        rejectReason = 'gift_required';
        message = `🎁 ${user}: Chỉ người TẶNG QUÀ (từ ${this.settings.minGiftCoins}🪙) mới được đi nước tiếp theo!`;
      }

      if (shouldNotify) {
        this.broadcast('xiangqi.moveRejected', {
          user,
          uniqueId,
          avatar,
          comment,
          reason: rejectReason,
          message,
          timestamp: now
        });
        this.logEvent('gate', message);
      }
      return { ok: false, reason: rejectReason, message };
    }

    return { ok: false, ignored: true };
  }

  // ==========================================================================
  // MOVE EXECUTION (Viewer, Host Manual, AI Đại Kiện Tướng)
  // ==========================================================================
  hostMove(params = {}) {
    if (this.isOver) {
      return { ok: false, error: 'Ván cờ đã kết thúc. Hãy bấm Ván Mới!' };
    }
    const fromR = Number(params.fromR);
    const fromC = Number(params.fromC);
    const toR = Number(params.toR);
    const toC = Number(params.toC);

    const found = this.legalMoves.find(
      (m) => m.fromR === fromR && m.fromC === fromC && m.toR === toR && m.toC === toC
    );
    if (!found) {
      const reason = describeIllegalMove(this.board, this.turn, fromR, fromC, toR, toC);
      return { ok: false, error: reason };
    }

    // If Host manually makes a move on Viewer's turn when an activeTurn exists, keep or consume cleanly
    const isHostOwnSide = !this.isViewerTurn();
    const actor = isHostOwnSide
      ? {
          type: 'host',
          userKey: 'host',
          user: 'Chủ Phòng (Host)',
          uniqueId: 'host',
          avatar: '',
          coins: 0,
          tier: 'host'
        }
      : {
          type: 'host_assist',
          userKey: this.activeTurn?.userKey || 'host',
          user: this.activeTurn ? `${this.activeTurn.user} (Host hỗ trợ)` : 'Host đi thử',
          uniqueId: this.activeTurn?.uniqueId || 'host',
          avatar: this.activeTurn?.avatar || '',
          giftName: this.activeTurn?.giftName || '',
          giftImage: this.activeTurn?.giftImage || '',
          coins: this.activeTurn?.coins || 0,
          tier: this.activeTurn?.tier || 'host'
        };

    return this.applyMove(found, actor);
  }

  executeAiMove(actorOverride = null) {
    if (this.isOver) return { ok: false, error: 'Ván cờ đã kết thúc' };
    this.clearAiTimer();

    const preset = DIFFICULTY_PRESETS[this.settings.aiDifficulty] || DIFFICULTY_PRESETS.club;
    const res = findBestMove(this.board, this.turn, {
      difficulty: this.settings.aiDifficulty,
      seenHashes: this.seenHashes
    });

    if (!res.move) {
      return { ok: false, error: 'Không còn nước đi hợp lệ' };
    }

    const defaultAiActor = {
      type: 'ai',
      userKey: 'ai_grandmaster',
      user: `AI ${preset.label.split(' (')[0]}`,
      uniqueId: 'ai_grandmaster',
      avatar: '',
      coins: 0,
      tier: 'ai',
      bookName: res.bookName || null,
      aiDepth: res.depth,
      aiElapsedMs: res.elapsedMs
    };
    const actor = actorOverride ? { ...defaultAiActor, ...actorOverride } : defaultAiActor;

    return this.applyMove(res.move, actor, res.evalRedCp);
  }

  applyMove(move, actor, precomputedEvalRedCp = null) {
    if (this.isOver) return { ok: false, error: 'Ván cờ đã kết thúc' };

    const movingSide = this.turn;
    const prevFen = toFen(this.board, this.turn, this.halfMoveClock, this.fullMoveNumber);
    const prevHalfMoveClock = this.halfMoveClock;
    const prevFullMoveNumber = this.fullMoveNumber;

    // Format notation BEFORE modifying board
    const notation = formatMoveVietnamese(this.board, move);
    const captured = makeMoveInPlace(this.board, move);

    if (captured) {
      if (movingSide === 'r') {
        this.capturedByRed = sortCapturedPieces([...this.capturedByRed, captured]);
      } else {
        this.capturedByBlack = sortCapturedPieces([...this.capturedByBlack, captured]);
      }
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock += 1;
    }

    if (movingSide === 'b') {
      this.fullMoveNumber += 1;
    }

    this.turn = oppositeSide(movingSide);
    this.hintMoves = [];
    this.activeTurn = null;
    this.clearAiTimer();

    // Repetition tracking
    const posKey = positionKey(this.board, this.turn);
    this.positionCounts.set(posKey, (this.positionCounts.get(posKey) || 0) + 1);
    this.seenHashes.add(computeZobristHash(this.board, this.turn));

    // Evaluate updated game status
    const statusInfo = evaluateGameStatus(this.board, this.turn, this.halfMoveClock, this.positionCounts);
    this.status = statusInfo.status;
    this.isOver = statusInfo.isOver;
    this.winner = statusInfo.winner;
    this.inCheck = statusInfo.inCheck;
    this.endReason = statusInfo.reason;
    this.legalMoves = this.isOver ? [] : generateLegalMoves(this.board, this.turn);

    // Update position eval bar
    this.evalRedCp = Number.isFinite(precomputedEvalRedCp)
      ? precomputedEvalRedCp
      : evaluateBoardRedPerspective(this.board);
    if (this.isOver) {
      if (this.winner === 'r') this.evalRedCp = 9999;
      else if (this.winner === 'b') this.evalRedCp = -9999;
      else this.evalRedCp = 0;
    }

    const moveRecord = {
      ply: this.history.length + 1,
      side: movingSide,
      fromR: move.fromR,
      fromC: move.fromC,
      toR: move.toR,
      toC: move.toC,
      fromSq: coordToSquare(move.fromR, move.fromC),
      toSq: coordToSquare(move.toR, move.toC),
      piece: move.piece,
      pieceVi: PIECE_META[move.piece]?.vi || '',
      captured: captured || null,
      capturedVi: captured ? (PIECE_META[captured]?.vi || '') : null,
      notation,
      prevFen,
      prevHalfMoveClock,
      prevFullMoveNumber,
      afterPosKey: posKey,
      isCheck: this.inCheck,
      isCheckmate: this.status === 'checkmate' || this.status === 'stalemate',
      actor,
      evalRedCp: this.evalRedCp,
      timestamp: Date.now()
    };

    this.history.push(moveRecord);
    this.lastMove = moveRecord;
    this.stats.totalMovesAllTime += 1;

    // Update Donor Leaderboard stats if this move belonged to a viewer
    if (actor && (actor.type === 'viewer' || actor.type === 'viewer_ai_assist') && actor.userKey) {
      let points = 15;
      if (captured) {
        const capType = captured.toUpperCase();
        points += capType === 'R' ? 45 : (capType === 'C' || capType === 'N') ? 30 : 15;
      }
      if (this.inCheck) points += 25;
      if (moveRecord.isCheckmate) points += 200;

      this.recordPlayerActivity({
        userKey: actor.userKey,
        user: actor.user,
        uniqueId: actor.uniqueId,
        avatar: actor.avatar,
        movesAdded: 1,
        capturesAdded: captured ? 1 : 0,
        checksAdded: this.inCheck ? 1 : 0,
        checkmatesAdded: moveRecord.isCheckmate ? 1 : 0,
        scoreAdded: points
      });
    }

    // Update overall scoreboard on game end
    if (this.isOver) {
      if (this.winner === 'r') this.scoreboard.redWins += 1;
      else if (this.winner === 'b') this.scoreboard.blackWins += 1;
      else this.scoreboard.draws += 1;

      if (this.settings.gameMode === 'host_vs_viewers' && this.winner !== 'draw') {
        if (this.winner === this.settings.hostSide) this.scoreboard.aiWins += 1;
        else this.scoreboard.viewerWins += 1;
      }
    }

    // Build move log + MC commentary
    const captureTag = captured ? ` (ăn ${PIECE_META[captured].vi}!)` : '';
    const checkTag = moveRecord.isCheckmate ? ' — 👑 CHIẾU BÍ!' : (this.inCheck ? ' — ⚔️ CHIẾU TƯỚNG!' : '');
    this.logEvent(
      'move',
      `${movingSide === 'r' ? '🔴' : '⚫'} ${actor.user}: ${notation.full} (${notation.grid})${captureTag}${checkTag}`
    );

    this.announceMoveByMc(moveRecord);

    this.broadcast('xiangqi.move', {
      move: moveRecord,
      status: this.status,
      isOver: this.isOver,
      winner: this.winner,
      endReason: this.endReason,
      inCheck: this.inCheck
    });

    this.savePersistentState();
    this.ensureTurnFlow();
    this.broadcastState();
    return { ok: true, move: moveRecord };
  }

  announceMoveByMc(moveRecord) {
    if (!this.settings.mcAutoRead) return;
    const { actor, notation, capturedVi, isCheck, isCheckmate } = moveRecord;
    const segments = [];

    if (isCheckmate) {
      const winnerText = this.winner === 'r' ? 'Phe Đỏ' : 'Phe Đen';
      segments.push(
        `Chiếu bí! ${actor.user} đi ${notation.full} kết liễu ván cờ! Chúc mừng ${winnerText} giành chiến thắng thuyết phục!`
      );
      this.emitMcSpeech(segments, 'checkmate');
      return;
    }

    if (this.isOver && this.winner === 'draw') {
      segments.push(`${actor.user} đi ${notation.full}. ${this.endReason}`);
      this.emitMcSpeech(segments, 'draw');
      return;
    }

    const prefix = actor.type === 'ai'
      ? `Đại Kiện Tướng đáp trả ${notation.full}`
      : actor.type === 'viewer_ai_assist'
      ? `Hết giờ, Kỳ Sư A I đi hộ ${actor.user} nước ${notation.full}`
      : `${actor.user} đi ${notation.full}`;

    let suffix = '';
    if (isCheck && capturedVi) {
      suffix = `, ăn ${capturedVi} và chiếu tướng cực gắt!`;
    } else if (isCheck) {
      suffix = `, chiếu tướng!`;
    } else if (capturedVi) {
      suffix = `, ăn gọn quân ${capturedVi}!`;
    } else if (actor.bookName) {
      suffix = `, chuẩn sách ${actor.bookName.split(' (')[0]}!`;
    } else {
      suffix = `!`;
    }

    segments.push(`${prefix}${suffix}`);
    this.emitMcSpeech(segments, isCheck ? 'check' : 'move');
  }

  // ==========================================================================
  // UNDO, HINTS, QUEUE MANAGEMENT & ADMIN ACTIONS
  // ==========================================================================
  computeAndShowHints(count = 3) {
    if (this.isOver) return [];
    const top = getTopMoves(this.board, this.turn, count, {
      difficulty: 'club',
      timeBudgetMs: 320,
      maxDepth: 3
    });
    this.hintMoves = top.map((t, idx) => ({
      rank: idx + 1,
      fromR: t.move.fromR,
      fromC: t.move.fromC,
      toR: t.move.toR,
      toC: t.move.toC,
      fromSq: coordToSquare(t.move.fromR, t.move.fromC),
      toSq: coordToSquare(t.move.toR, t.move.toC),
      ucci: moveToUcci(t.move),
      grid: t.grid,
      notation: t.notation,
      scoreCp: t.scoreCp
    }));
    return this.hintMoves;
  }

  showHintsNow() {
    const hints = this.computeAndShowHints(3);
    this.broadcastState();
    return { ok: true, hints };
  }

  undoLastMove() {
    if (this.history.length === 0) {
      return { ok: false, error: 'Chưa có nước đi nào để hoàn tác.' };
    }
    this.clearAiTimer();
    this.clearAutoNewGameTimer();

    const last = this.history.pop();
    const parsed = parseFen(last.prevFen);
    this.board = parsed.board;
    this.turn = parsed.turn;
    this.halfMoveClock = last.prevHalfMoveClock;
    this.fullMoveNumber = last.prevFullMoveNumber;

    // Rebuild captured lists, positionCounts & seenHashes cleanly
    this.capturedByRed = [];
    this.capturedByBlack = [];
    this.positionCounts = new Map();
    const startState = parseFen(INITIAL_FEN);
    const initKey = positionKey(startState.board, startState.turn);
    this.positionCounts.set(initKey, 1);
    this.seenHashes = new Set([computeZobristHash(startState.board, startState.turn)]);

    for (const h of this.history) {
      if (h.captured) {
        if (h.side === 'r') this.capturedByRed.push(h.captured);
        else this.capturedByBlack.push(h.captured);
      }
      if (h.afterPosKey) {
        this.positionCounts.set(h.afterPosKey, (this.positionCounts.get(h.afterPosKey) || 0) + 1);
      }
    }
    this.seenHashes.add(computeZobristHash(this.board, this.turn));
    this.capturedByRed = sortCapturedPieces(this.capturedByRed);
    this.capturedByBlack = sortCapturedPieces(this.capturedByBlack);
    this.lastMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
    this.hintMoves = [];

    const statusInfo = evaluateGameStatus(this.board, this.turn, this.halfMoveClock, null);
    this.status = statusInfo.status;
    this.isOver = statusInfo.isOver;
    this.winner = statusInfo.winner;
    this.inCheck = statusInfo.inCheck;
    this.endReason = statusInfo.reason;
    this.legalMoves = generateLegalMoves(this.board, this.turn);
    this.evalRedCp = evaluateBoardRedPerspective(this.board);

    this.logEvent('system', `↩️ Đã hoàn tác nước ${last.notation.full} (${last.notation.grid})`);
    this.ensureTurnFlow();
    this.broadcastState();
    return { ok: true, undone: last };
  }

  undoMovePair(options = {}) {
    if (this.history.length === 0) return { ok: false, error: 'Không thể hoàn tác' };
    this.undoLastMove();
    if (this.history.length > 0 && !this.isViewerTurn()) {
      this.undoLastMove();
    }
    if (options.requestedBy) {
      this.broadcast('xiangqi.feedback', {
        level: 'info',
        message: `↩️ Đại Tướng VIP ${options.requestedBy} đã kích hoạt Đi Lại!`
      });
    }
    return { ok: true };
  }

  skipActiveTurn() {
    if (!this.activeTurn) {
      this.ensureTurnFlow();
      this.broadcastState();
      return { ok: true, skipped: null };
    }
    const skipped = this.activeTurn;
    this.activeTurn = null;
    this.hintMoves = [];
    this.logEvent('system', `⏭️ Host đã chuyển lượt khỏi ${skipped.user}`);
    this.ensureTurnFlow();
    this.broadcastState();
    return { ok: true, skipped };
  }

  clearQueue() {
    const count = this.moveQueue.length + (this.activeTurn ? 1 : 0);
    this.moveQueue = [];
    this.activeTurn = null;
    this.hintMoves = [];
    this.logEvent('system', `🧹 Đã xóa sạch hàng đợi (${count} vé)`);
    this.broadcastState();
    return { ok: true, cleared: count };
  }

  resignOrDraw(kind = 'draw') {
    if (this.isOver) return { ok: false, error: 'Ván cờ đã kết thúc' };
    this.clearAiTimer();
    this.activeTurn = null;
    this.isOver = true;

    if (kind === 'draw') {
      this.status = 'draw_agreed';
      this.winner = 'draw';
      this.endReason = 'Hai bên đồng ý HÒA CỜ!';
      this.scoreboard.draws += 1;
    } else {
      const winnerSide = oppositeSide(this.turn);
      this.status = 'resigned';
      this.winner = winnerSide;
      this.endReason = `Phe ${sideNameVi(this.turn)} xin thua — Phe ${sideNameVi(winnerSide)} chiến thắng!`;
      if (winnerSide === 'r') this.scoreboard.redWins += 1;
      else this.scoreboard.blackWins += 1;
      if (this.settings.gameMode === 'host_vs_viewers') {
        if (winnerSide === this.settings.hostSide) this.scoreboard.aiWins += 1;
        else this.scoreboard.viewerWins += 1;
      }
    }

    this.logEvent('system', `🏁 ${this.endReason}`);
    this.emitMcSpeech([this.endReason], 'game_over');
    this.savePersistentState();
    this.ensureTurnFlow();
    this.broadcastState();
    return { ok: true };
  }

  swapSides() {
    const nextHostSide = oppositeSide(this.settings.hostSide);
    return this.updateSettings({ hostSide: nextHostSide });
  }

  resetLeaderboard() {
    this.players.clear();
    this.scoreboard = { redWins: 0, blackWins: 0, draws: 0, viewerWins: 0, aiWins: 0 };
    this.stats = { totalGiftsReceived: 0, totalCoinsReceived: 0, totalMovesAllTime: 0 };
    this.savePersistentState();
    this.logEvent('system', '🗑️ Đã đặt lại Bảng Vàng Kỳ Thủ & tỷ số');
    this.broadcastState();
    return { ok: true };
  }

  // ==========================================================================
  // PLAYER LEADERBOARD & MC SPEECH HELPERS
  // ==========================================================================
  recordPlayerActivity(delta) {
    const key = delta.userKey;
    if (!key) return;
    const existing = this.players.get(key) || {
      userKey: key,
      user: delta.user || 'Kỳ Thủ',
      uniqueId: delta.uniqueId || key,
      avatar: delta.avatar || '',
      totalCoins: 0,
      giftCount: 0,
      movesMade: 0,
      captures: 0,
      checks: 0,
      checkmates: 0,
      score: 0,
      lastGiftName: '',
      lastGiftImage: '',
      lastActiveAt: Date.now()
    };

    if (delta.user) existing.user = delta.user;
    if (delta.avatar) existing.avatar = delta.avatar;
    existing.totalCoins += delta.coinsAdded || 0;
    existing.giftCount += delta.giftsAdded || 0;
    existing.movesMade += delta.movesAdded || 0;
    existing.captures += delta.capturesAdded || 0;
    existing.checks += delta.checksAdded || 0;
    existing.checkmates += delta.checkmatesAdded || 0;
    existing.score += delta.scoreAdded || 0;
    if (delta.giftName) existing.lastGiftName = delta.giftName;
    if (delta.giftImage) existing.lastGiftImage = delta.giftImage;
    existing.lastActiveAt = Date.now();

    this.players.set(key, existing);
  }

  getLeaderboard(limit = 10) {
    return Array.from(this.players.values())
      .toSorted((a, b) => (b.score - a.score) || (b.totalCoins - a.totalCoins) || (b.movesMade - a.movesMade))
      .slice(0, limit)
      .map((p, idx) => ({
        rank: idx + 1,
        ...p
      }));
  }

  emitMcSpeech(segments = [], reason = 'info') {
    const cleanSegments = segments.map((s) => String(s || '').trim()).filter(Boolean);
    if (cleanSegments.length === 0) return;
    this.speechCounter += 1;
    this.broadcast('xiangqi.mcSpeak', {
      id: this.speechCounter,
      reason,
      voice: this.settings.mcVoice,
      segments: cleanSegments,
      text: cleanSegments.join(' '),
      timestamp: Date.now()
    });
  }

  sendMcCommand(action = 'testVoice') {
    if (action === 'stop') {
      this.broadcast('xiangqi.mcCommand', { action: 'stop' });
      return { ok: true };
    }
    if (action === 'readStatus') {
      const turnText = this.turn === 'r' ? 'quân Đỏ' : 'quân Đen';
      const msg = this.activeTurn
        ? `Ván số ${this.matchNumber}, đang tới lượt ${this.activeTurn.user} cầm ${turnText}, còn ${this.activeTurn.remainingSec} giây!`
        : `Ván số ${this.matchNumber}, đang chờ kỳ thủ tặng quà để đi nước tiếp theo cho ${turnText}!`;
      this.emitMcSpeech([msg], 'manual_status');
      return { ok: true };
    }
    this.emitMcSpeech([
      'Xin chào quý kỳ thủ! Chào mừng đến với Kỳ Đài Cờ Tướng TikTok Live! Tặng quà ngay để giành quyền đi nước tiếp theo!'
    ], 'test_voice');
    return { ok: true };
  }

  logEvent(kind, message) {
    const entry = {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind,
      message,
      timestamp: Date.now()
    };
    this.recentEvents.unshift(entry);
    if (this.recentEvents.length > 40) this.recentEvents.pop();
    this.broadcast('xiangqi.event', entry);
  }

  // ==========================================================================
  // PUBLIC STATE SNAPSHOT FOR CLIENTS
  // ==========================================================================
  getState() {
    const preset = DIFFICULTY_PRESETS[this.settings.aiDifficulty] || DIFFICULTY_PRESETS.club;
    return {
      matchNumber: this.matchNumber,
      fen: toFen(this.board, this.turn, this.halfMoveClock, this.fullMoveNumber),
      board: cloneBoard(this.board),
      turn: this.turn,
      isViewerTurn: this.isViewerTurn(),
      viewerSide: this.getViewerSide(),
      status: this.status,
      isOver: this.isOver,
      winner: this.winner,
      inCheck: this.inCheck,
      endReason: this.endReason,
      halfMoveClock: this.halfMoveClock,
      fullMoveNumber: this.fullMoveNumber,
      plyCount: this.history.length,
      evalRedCp: this.evalRedCp,
      aiThinking: this.aiThinking,
      aiDifficultyLabel: preset.label,
      capturedByRed: [...this.capturedByRed],
      capturedByBlack: [...this.capturedByBlack],
      lastMove: this.lastMove,
      hintMoves: [...this.hintMoves],
      legalMoves: this.legalMoves.map((m) => ({
        fromR: m.fromR,
        fromC: m.fromC,
        toR: m.toR,
        toC: m.toC,
        ucci: moveToUcci(m),
        grid: moveToGridDisplay(m)
      })),
      activeTurn: this.activeTurn ? { ...this.activeTurn } : null,
      moveQueue: this.moveQueue.slice(0, 15).map((t, idx) => ({
        position: idx + 1,
        ...t
      })),
      queueTotalCount: this.moveQueue.length,
      autoNewGameRemainingSec: this.autoNewGameRemainingSec,
      history: this.history.slice(-24),
      leaderboard: this.getLeaderboard(10),
      scoreboard: { ...this.scoreboard },
      stats: { ...this.stats },
      recentGifts: this.recentGifts.slice(0, 10),
      recentEvents: this.recentEvents.slice(0, 20),
      settings: this.getSettings(),
      tiktok: { ...this.tiktokStatus },
      giftCatalog: this.giftCatalog,
      difficulties: Object.values(DIFFICULTY_PRESETS).map((d) => ({ id: d.id, label: d.label }))
    };
  }

  broadcastState() {
    this.broadcast('xiangqi.state', this.getState());
  }

  destroy() {
    clearInterval(this.ticker);
    this.clearAiTimer();
    this.clearAutoNewGameTimer();
  }
}

module.exports = XiangqiLiveEngine;
