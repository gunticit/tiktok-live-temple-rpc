/**
 * GPLX Engine - Đấu Trường GPLX: Hạng B - C1 - C
 * Interactive Trivia Game Engine for TikTok Live RPC
 * - 15-second countdown timer per question (starts after MC finishes reading)
 * - Automatic MC speech scripts for questions & answers (ZeroTTS / Web Speech)
 * - Per-user TikTok Gift x2 score boost (pre-armed, retroactive, or carry-over)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_GIFT_IMAGE = '/assets/gifts/qua_mac_dinh.svg';
const GPLX_SETTINGS_FILE = path.join(__dirname, 'data', 'gplx-settings.json');

const DEFAULT_GPLX_SETTINGS = {
  timerSeconds: 15,
  mcAutoRead: true,
  waitMcBeforeTimer: true,
  autoNextQuestion: true,
  mcVoice: 'quangminh',
  mcVolume: 0.95,
  sfxEnabled: true,
  sfxVolume: 0.8
};

/**
 * Split Vietnamese text into natural TTS chunks (<= maxLen chars)
 * so ZeroTTS synthesizes rapidly with smooth pipelined playback and zero truncation.
 */
function splitVietnameseSpeechChunks(rawText, maxLen = 155) {
  const cleaned = String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const chunks = [];
  // First split by sentence punctuation while keeping delimiters
  const sentences = cleaned.split(/(?<=[.!?])\s+/);

  let current = '';
  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };

  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((current ? `${current} ${sentence}` : sentence).length <= maxLen) {
      current = current ? `${current} ${sentence}` : sentence;
      continue;
    }

    pushCurrent();
    if (sentence.length <= maxLen) {
      current = sentence;
      continue;
    }

    // Sentence itself is longer than maxLen -> split on commas / semicolons / colons
    const clauses = sentence.split(/(?<=[,;:])\s+/);
    for (const clause of clauses) {
      if ((current ? `${current} ${clause}` : clause).length <= maxLen) {
        current = current ? `${current} ${clause}` : clause;
        continue;
      }
      pushCurrent();
      if (clause.length <= maxLen) {
        current = clause;
        continue;
      }
      // Hard word-boundary split for ultra-long clauses
      const words = clause.split(/\s+/);
      for (const word of words) {
        if ((current ? `${current} ${word}` : word).length <= maxLen) {
          current = current ? `${current} ${word}` : word;
        } else {
          pushCurrent();
          current = word;
        }
      }
    }
  }
  pushCurrent();
  return chunks;
}

function normalizeUserKey(uniqueId, user) {
  const raw = String(uniqueId || user || '').trim().toLowerCase().replace(/^@+/, '');
  return raw || `guest_${Date.now()}`;
}

function formatDisplayHandle(user, uniqueId) {
  const cleanUser = String(user || '').trim();
  if (cleanUser) return cleanUser;
  const cleanUid = String(uniqueId || '').trim().replace(/^@+/, '');
  return cleanUid ? `@${cleanUid}` : 'Học viên';
}

function parseGplxAnswerFromComment(commentText) {
  const raw = String(commentText || '').trim();
  if (!raw) return null;

  // Map 1-4 -> A-D (Vietnamese 600-question GPLX tests often number answers 1, 2, 3, 4)
  const digitMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };

  // 1. Direct single letter or digit, optionally wrapped with punctuation/emojis/short polite particle
  // Examples: "A", "b.", "C!", "d ạ", "B nha", "2", "3 đi thầy"
  const directMatch = raw.match(/^\s*([a-dA-D1-4])(?:\s*[.,!?)}\]:;]*\s*(?:ạ|nhé|nha|nhỉ|luôn|chắc chắn|đúng|thầy|ơi|đi|nhaa|ne|nè)?\s*[.,!?]*)\s*$/iu);
  if (directMatch) {
    const token = directMatch[1].toUpperCase();
    return digitMap[token] || token;
  }

  // 2. Explicit answer phrasing: "đáp án B", "chọn C", "câu A", "ý 2", "dap an d"
  const explicitMatch = raw.match(/(?:đáp\s*án|dap\s*an|chọn|chon|ý|y\s*số|cau\s*trả\s*lời|trả\s*lời)\s*[:=\-]?\s*([a-dA-D1-4])(?:\b|$)/iu);
  if (explicitMatch) {
    const token = explicitMatch[1].toUpperCase();
    return digitMap[token] || token;
  }

  return null;
}

class GplxEngine {
  constructor(broadcastCallback, options = {}) {
    this.broadcast = broadcastCallback || (() => {});
    this.giftCatalog = Array.isArray(options.giftCatalog) ? options.giftCatalog : [];
    this.findGift = typeof options.findGift === 'function' ? options.findGift : null;
    this.getClientCount = typeof options.getClientCount === 'function' ? options.getClientCount : (() => 0);

    this.questions = this.loadQuestions();
    this.settings = this.loadSettings();
    this.saveSettingsTimer = null;
    this.currentQIndex = 0;

    // Tìm câu sa hình đầu tiên nếu có (thường từ câu 486)
    const saHinhIdx = this.questions.findIndex(q => q.id >= 486);
    if (saHinhIdx !== -1) {
      this.currentQIndex = saHinhIdx;
    }

    // Thời gian trả lời mỗi câu (đọc từ settings, mặc định 15 giây)
    this.timerMax = this.settings.timerSeconds;
    this.timerRemaining = this.timerMax;
    this.phase = this.shouldWaitForMc() ? 'reading' : 'countdown'; // 'reading' | 'countdown' | 'revealed'
    this.isRevealed = false;
    this.multiplier = 1; // Global host x2 toggle (stacks or supplements per-user gift x2)
    this.onlineLearnersCount = 0;
    this.questionRoundId = 1;
    this.revealTimeout = null;
    this.readingFallbackTimeout = null;
    this.tiktokStatus = {
      connected: false,
      connecting: false,
      username: '',
      viewerCount: 0,
      lastError: null
    };

    // Per-round tracking for answers & TikTok Gift x2 boosts
    this.questionAnswers = new Map();       // userKey -> answerRecord
    this.activeGiftBoosts = new Map();      // userKey -> giftBoostRecord (for current question)
    this.nextQuestionGiftBoosts = new Map();// userKey -> giftBoostRecord (carry-over to next question)
    this.recentGifts = [];                  // Recent gift alerts for UI/debug
    this.roundWinner = null;

    // Bảng xếp hạng hoàn toàn theo dữ liệu học viên thực tế (không tạo dữ liệu giả/mock)
    this.players = new Map();
    this.leaderboard = [];

    this.syncQuestionState();
    this.startTimerTicker();
  }

  loadSettings() {
    try {
      if (fs.existsSync(GPLX_SETTINGS_FILE)) {
        const saved = JSON.parse(fs.readFileSync(GPLX_SETTINGS_FILE, 'utf8'));
        return this.sanitizeSettings({ ...DEFAULT_GPLX_SETTINGS, ...(saved || {}) });
      }
    } catch (err) {
      console.warn('[GplxEngine] Không đọc được gplx-settings.json, dùng mặc định:', err.message);
    }
    return { ...DEFAULT_GPLX_SETTINGS };
  }

  sanitizeSettings(raw = {}) {
    const validVoices = ['quangminh', 'tiendat', 'maichi', 'baotrang', 'giahuy', 'huuduc', 'kimoanh', 'hamy'];
    const cur = this.settings || DEFAULT_GPLX_SETTINGS;
    const timerRaw = Number(raw.timerSeconds ?? cur.timerSeconds ?? 15);
    const timerSeconds = Number.isFinite(timerRaw) ? Math.max(5, Math.min(120, Math.round(timerRaw))) : 15;

    const voiceRaw = String(raw.mcVoice ?? cur.mcVoice ?? 'quangminh').toLowerCase().trim();
    const mcVoice = validVoices.includes(voiceRaw) ? voiceRaw : 'quangminh';

    const mcVolRaw = Number(raw.mcVolume ?? cur.mcVolume ?? 0.95);
    const mcVolume = Number.isFinite(mcVolRaw) ? Math.max(0, Math.min(1, +mcVolRaw.toFixed(2))) : 0.95;

    const sfxVolRaw = Number(raw.sfxVolume ?? cur.sfxVolume ?? 0.8);
    const sfxVolume = Number.isFinite(sfxVolRaw) ? Math.max(0, Math.min(1, +sfxVolRaw.toFixed(2))) : 0.8;

    return {
      timerSeconds,
      mcAutoRead: raw.mcAutoRead !== undefined ? Boolean(raw.mcAutoRead) : Boolean(cur.mcAutoRead),
      waitMcBeforeTimer: raw.waitMcBeforeTimer !== undefined ? Boolean(raw.waitMcBeforeTimer) : Boolean(cur.waitMcBeforeTimer),
      autoNextQuestion: raw.autoNextQuestion !== undefined ? Boolean(raw.autoNextQuestion) : Boolean(cur.autoNextQuestion),
      mcVoice,
      mcVolume,
      sfxEnabled: raw.sfxEnabled !== undefined ? Boolean(raw.sfxEnabled) : Boolean(cur.sfxEnabled),
      sfxVolume
    };
  }

  saveSettings() {
    clearTimeout(this.saveSettingsTimer);
    this.saveSettingsTimer = setTimeout(() => {
      fs.promises
        .writeFile(GPLX_SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf8')
        .catch((err) => console.warn('[GplxEngine] Lỗi lưu gplx-settings.json:', err.message));
    }, 300);
  }

  shouldWaitForMc() {
    return Boolean(this.settings.mcAutoRead && this.settings.waitMcBeforeTimer);
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(patch = {}) {
    const prev = { ...this.settings };
    this.settings = this.sanitizeSettings({ ...this.settings, ...(patch || {}) });
    this.saveSettings();

    // Cập nhật ngay thời gian đồng hồ nếu đổi timerSeconds
    if (this.settings.timerSeconds !== prev.timerSeconds) {
      this.timerMax = this.settings.timerSeconds;
      if (this.phase === 'reading' || this.timerRemaining > this.timerMax) {
        this.timerRemaining = this.timerMax;
      }
    }

    // Nếu tắt MC tự đọc hoặc tắt "chờ MC đọc xong" trong khi đang đứng ở pha reading -> đếm ngược ngay!
    if (!this.shouldWaitForMc() && this.phase === 'reading') {
      this.startCountdown('settings_updated');
    }

    // Nếu tắt autoNextQuestion trong khi đang chờ chuyển câu -> hủy hẹn giờ tự chuyển
    if (!this.settings.autoNextQuestion && this.phase === 'revealed') {
      this.clearRevealTimeout();
    } else if (this.settings.autoNextQuestion && !prev.autoNextQuestion && this.phase === 'revealed' && !this.revealTimeout) {
      const targetRound = this.questionRoundId;
      this.revealTimeout = setTimeout(() => {
        this.revealTimeout = null;
        if (this.phase === 'revealed' && this.questionRoundId === targetRound && this.settings.autoNextQuestion) {
          this.nextQuestion();
        }
      }, 3000);
    }

    this.broadcast('gplx.settingsUpdated', this.getSettings());
    this.broadcastState();
    return { ok: true, settings: this.getSettings() };
  }

  sendMcCommand(action = 'readQuestion') {
    const valid = ['readQuestion', 'readAnswer', 'stop', 'testVoice'];
    const cleanAction = valid.includes(action) ? action : 'readQuestion';

    if (cleanAction === 'stop' && this.phase === 'reading') {
      this.startCountdown('stopped');
    }

    const q = this.getCurrentQuestion();
    const payload = {
      action: cleanAction,
      roundId: this.questionRoundId,
      questionNumber: q?.questionNumber || q?.id,
      voice: this.settings.mcVoice,
      segments:
        cleanAction === 'readAnswer'
          ? this.buildAnswerSpeechSegments(q, this.roundWinner)
          : cleanAction === 'testVoice'
          ? [`Xin chào quý học viên! Tôi là MC Đấu Trường Giấy Phép Lái Xe, giọng đọc đã sẵn sàng!`]
          : this.buildQuestionSpeechSegments(q)
    };
    this.broadcast('gplx.mcCommand', payload);
    return { ok: true, ...payload };
  }

  loadQuestions() {
    try {
      const qPath = path.join(__dirname, 'data', 'gplx-questions.json');
      if (fs.existsSync(qPath)) {
        const raw = JSON.parse(fs.readFileSync(qPath, 'utf8'));
        if (Array.isArray(raw) && raw.length > 0) {
          console.log(`[GplxEngine] Đã tải ${raw.length} câu hỏi sát hạch thực tế thành công!`);
          return raw;
        }
      }
    } catch (err) {
      console.warn('[GplxEngine] Error loading questions:', err);
    }
    return [
      {
        id: 486,
        category: 'HẠNG B - C1 - C',
        questionNumber: 486,
        totalQuestions: 600,
        isFatal: false,
        fatalLabel: 'Câu hỏi sa hình',
        question: 'Theo hướng mũi tên, xe nào chấp hành đúng quy tắc giao thông?',
        options: [
          { key: 'A', text: 'Xe khách, xe tải, xe mô tô' },
          { key: 'B', text: 'Xe tải, xe mô tô' },
          { key: 'C', text: 'Chỉ xe con' }
        ],
        correctKey: 'C',
        image: '/assets/sa_hinh_12.svg'
      }
    ];
  }

  computeLeaderboard() {
    return Array.from(this.players.values())
      .sort((a, b) => b.points - a.points)
      .slice(0, 5)
      .map(p => ({
        user: p.user,
        uniqueId: p.uniqueId,
        points: p.points,
        delta: p.delta,
        avatar: p.avatar,
        lastBoosted: !!p.lastBoosted,
        lastGiftImage: p.lastGiftImage || '',
        lastGiftName: p.lastGiftName || ''
      }));
  }

  updateTikTokStatus(tiktokInfo = {}) {
    this.tiktokStatus = {
      ...this.tiktokStatus,
      ...tiktokInfo
    };
    if (tiktokInfo.viewerCount && tiktokInfo.viewerCount > 0) {
      this.onlineLearnersCount = tiktokInfo.viewerCount;
    }
    this.broadcast('gplx.tiktokStatus', this.tiktokStatus);
    this.broadcastState();
  }

  buildQuestionSpeechSegments(q) {
    if (!q) return [];
    const qNum = q.questionNumber || q.id;
    const fatalIntro = q.isFatal ? ', lưu ý đây là câu điểm liệt' : '';
    const segments = [];

    // 1. Đọc đề câu hỏi
    const intro = `Câu số ${qNum}${fatalIntro}. ${q.question}`;
    segments.push(...splitVietnameseSpeechChunks(intro, 155));

    // 2. Đọc từng đáp án A, B, C, D
    const options = Array.isArray(q.options) ? q.options : [];
    const optLetters = [];
    for (const opt of options) {
      const key = String(opt.key || '').toUpperCase();
      optLetters.push(key);
      const optSpeech = `Đáp án ${key}: ${opt.text}`;
      segments.push(...splitVietnameseSpeechChunks(optSpeech, 155));
    }

    // 3. Kêu gọi bình luận + thông báo bắt đầu đếm ngược 15 giây ngay sau khi MC đọc xong
    if (segments.length <= 7 && optLetters.length >= 2) {
      const joined =
        optLetters.length === 2
          ? `${optLetters[0]} hoặc ${optLetters[1]}`
          : `${optLetters.slice(0, -1).join(', ')} hoặc ${optLetters[optLetters.length - 1]}`;
      segments.push(
        `${this.timerMax} giây suy nghĩ bắt đầu! Mời các bạn bình luận ${joined} ngay, tặng quà để được nhân đôi điểm!`
      );
    } else {
      segments.push(`${this.timerMax} giây suy nghĩ bắt đầu!`);
    }

    return segments;
  }

  buildAnswerSpeechSegments(q, roundWinner = null) {
    if (!q) return [];
    const qNum = q.questionNumber || q.id;
    const options = Array.isArray(q.options) ? q.options : [];
    const correctOpt = options.find(
      o => String(o.key).toUpperCase() === String(q.correctKey).toUpperCase()
    );
    const correctText = correctOpt ? correctOpt.text : '';
    const segments = [];

    const announce = `Hết giờ! Đáp án chính xác của câu ${qNum} là đáp án ${q.correctKey}: ${correctText}`;
    segments.push(...splitVietnameseSpeechChunks(announce, 155));

    // Chúc mừng học viên nhanh nhất (hoặc học viên nhận x2 quà tặng)
    if (roundWinner) {
      const cleanName = String(roundWinner.user || 'bạn').replace(/^@+/, '');
      if (roundWinner.boosted) {
        segments.push(
          `Xin chúc mừng ${cleanName} vừa tặng quà và trả lời chính xác, nhận nhân đôi ${roundWinner.earnedPoints} điểm!`
        );
      } else {
        segments.push(
          `Xin chúc mừng ${cleanName} trả lời đúng nhanh nhất, cộng ${roundWinner.earnedPoints} điểm!`
        );
      }
    } else if (
      q.explanation &&
      !q.explanation.startsWith('Đáp án chuẩn theo Bộ 600 câu hỏi')
    ) {
      segments.push(...splitVietnameseSpeechChunks(q.explanation, 155));
    }

    return segments;
  }

  syncQuestionState() {
    const q = this.getCurrentQuestion();
    // Không tiết lộ đáp án đúng trong khi đang đếm ngược 15 giây!
    this.highlightedKey = this.isRevealed ? q.correctKey : null;
    this.roundWinner = null;

    // Khởi tạo phiếu bầu theo đúng các đáp án có trong câu hỏi hiện tại
    const validKeys = Array.isArray(q.options) && q.options.length
      ? q.options.map(o => String(o.key).toUpperCase())
      : ['A', 'B', 'C', 'D'];
    this.votes = {};
    for (const k of validKeys) {
      this.votes[k] = q.mockVotes && q.mockVotes[k] !== undefined ? q.mockVotes[k] : 0;
    }

    this.stats = {
      accuracyRate: q.accuracyRate || 72,
      avgSpeed: q.avgSpeed || '1.2 giây'
    };

    // Chuyển lượt câu hỏi mới: xóa lượt trả lời cũ, kích hoạt các lượt x2 quà tặng chuyển tiếp từ vòng trước
    this.questionAnswers.clear();
    this.activeGiftBoosts = new Map(this.nextQuestionGiftBoosts);
    this.nextQuestionGiftBoosts.clear();
  }

  clearRevealTimeout() {
    if (this.revealTimeout) {
      clearTimeout(this.revealTimeout);
      this.revealTimeout = null;
    }
  }

  clearReadingFallbackTimeout() {
    if (this.readingFallbackTimeout) {
      clearTimeout(this.readingFallbackTimeout);
      this.readingFallbackTimeout = null;
    }
  }

  armReadingFallback(extraMs = 0) {
    this.clearReadingFallbackTimeout();
    if (this.phase !== 'reading') return;
    if (this.getClientCount() <= 0) return;

    const q = this.getCurrentQuestion();
    const segs = this.buildQuestionSpeechSegments(q);
    const totalChars = segs.reduce((sum, s) => sum + s.length, 0);
    // Dự phòng an toàn: cho phép đủ thời gian tổng hợp ZeroTTS + đọc trọn vẹn câu hỏi và đáp án
    const fallbackMs = Math.min(65000, Math.max(22000, totalChars * 165 + 12000)) + extraMs;
    const targetRound = this.questionRoundId;

    this.readingFallbackTimeout = setTimeout(() => {
      this.readingFallbackTimeout = null;
      if (this.phase === 'reading' && this.questionRoundId === targetRound) {
        this.startCountdown('fallback_timeout');
      }
    }, fallbackMs);
  }

  onClientConnected() {
    if (this.phase === 'reading' && !this.readingFallbackTimeout) {
      this.armReadingFallback(4000);
    }
  }

  mcReadingStarted({ roundId } = {}) {
    if (roundId !== undefined && Number(roundId) !== this.questionRoundId) {
      return { ok: false, stale: true, phase: this.phase };
    }
    if (this.phase === 'reading') {
      // Gia hạn bộ đếm an toàn vì MC đang thực sự đọc trên trình duyệt
      this.armReadingFallback(8000);
    }
    return { ok: true, roundId: this.questionRoundId, phase: this.phase };
  }

  mcFinishedReading({ roundId, kind = 'question', reason = 'completed' } = {}) {
    if (roundId !== undefined && Number(roundId) !== this.questionRoundId) {
      return { ok: false, stale: true, phase: this.phase };
    }

    if (kind === 'question') {
      if (this.phase === 'reading') {
        return this.startCountdown(reason);
      }
      return this.getState();
    }

    if (kind === 'answer' && this.phase === 'revealed') {
      // Sau khi MC đọc xong đáp án, dừng ngắn 2.5 giây rồi chuyển câu mới mượt mà (nếu đang bật tự chuyển câu)
      this.clearRevealTimeout();
      if (!this.settings.autoNextQuestion) {
        return { ok: true, advancingSoon: false, roundId: this.questionRoundId };
      }
      const targetRound = this.questionRoundId;
      this.revealTimeout = setTimeout(() => {
        this.revealTimeout = null;
        if (this.phase === 'revealed' && this.questionRoundId === targetRound && this.settings.autoNextQuestion) {
          this.nextQuestion();
        }
      }, 2500);
      return { ok: true, advancingSoon: true, roundId: this.questionRoundId };
    }

    return this.getState();
  }

  startCountdown(reason = 'mc_finished') {
    if (this.phase !== 'reading') {
      return this.getState();
    }
    this.clearReadingFallbackTimeout();
    this.phase = 'countdown';
    this.timerRemaining = this.timerMax;
    this.broadcast('gplx.countdownStarted', {
      roundId: this.questionRoundId,
      timerMax: this.timerMax,
      reason
    });
    this.broadcastState();
    return this.getState();
  }

  startTimerTicker() {
    setInterval(() => {
      if (this.phase !== 'countdown') return;
      if (this.timerRemaining > 0) {
        this.timerRemaining--;
        this.broadcastState();
      } else if (!this.isRevealed) {
        this.revealAnswer();
      }
    }, 1000);
  }

  getCurrentQuestion() {
    return this.questions[this.currentQIndex] || this.questions[0];
  }

  getActiveBoostersList() {
    const list = [];
    for (const boost of this.activeGiftBoosts.values()) {
      list.push({
        user: boost.user,
        uniqueId: boost.uniqueId,
        avatar: boost.avatar,
        giftId: boost.giftId,
        giftName: boost.giftName,
        giftImage: boost.giftImage,
        fallbackImage: boost.fallbackImage || DEFAULT_GIFT_IMAGE,
        coins: boost.coins,
        repeatCount: boost.repeatCount || 1,
        applied: !!boost.applied
      });
    }
    return list.slice(-8).reverse();
  }

  getState() {
    const q = this.getCurrentQuestion();
    return {
      roundId: this.questionRoundId,
      phase: this.phase,
      waitingForMc: this.phase === 'reading',
      question: q,
      questionIndex: this.currentQIndex,
      totalQuestionsCount: this.questions.length,
      timerRemaining: this.timerRemaining,
      timerMax: this.timerMax,
      isRevealed: this.isRevealed,
      highlightedKey: this.highlightedKey,
      multiplier: this.multiplier,
      votes: this.votes,
      stats: this.stats,
      onlineLearnersCount: this.onlineLearnersCount,
      totalRankedPlayers: this.players.size,
      leaderboard: this.leaderboard,
      activeBoosters: this.getActiveBoostersList(),
      giftCatalog: this.giftCatalog,
      tiktok: this.tiktokStatus,
      settings: this.getSettings(),
      roundWinner: this.roundWinner,
      speechScripts: {
        question: this.buildQuestionSpeechSegments(q),
        answer: this.buildAnswerSpeechSegments(q, this.roundWinner)
      }
    };
  }

  broadcastState() {
    this.broadcast('gplx.state', this.getState());
  }

  emitQuestionStarted() {
    const q = this.getCurrentQuestion();
    const segments = this.buildQuestionSpeechSegments(q);
    this.broadcast('gplx.questionStarted', {
      roundId: this.questionRoundId,
      questionId: q.id,
      questionNumber: q.questionNumber || q.id,
      timerMax: this.timerMax,
      segments
    });
  }

  /**
   * Kết nối sự kiện tặng quà TikTok -> x2 điểm cho câu trả lời của người dùng đó!
   * Hỗ trợ đầy đủ cả 3 tình huống thực tế trên TikTok Live:
   * 1. Người dùng tặng quà TRƯỚC khi bình luận A/B/C/D -> khóa sẵn buff x2 cho câu hiện tại.
   * 2. Người dùng bình luận ĐÚNG TRƯỚC rồi tặng quà ngay trong cùng câu -> lập tức nhân đôi (+100%) điểm câu vừa trả lời!
   * 3. Người dùng tặng quà khi câu đã hết giờ (hoặc sau khi chọn sai) -> bảo lưu buff x2 sang câu tiếp theo để không lãng phí quà!
   */
  handleGift(params = {}) {
    const displayUser = formatDisplayHandle(params.user, params.uniqueId);
    const userKey = normalizeUserKey(params.uniqueId, params.user);
    const existingPlayer = this.players.get(userKey);
    const avatar = String(params.avatar || existingPlayer?.avatar || '').trim();

    const rawGiftName = params.giftName || params.gift?.name || params.giftId || 'Hoa hồng';
    const matched = this.findGift
      ? this.findGift(params.giftId || rawGiftName, Number(params.coins) || 1)
      : null;

    const giftId = params.giftId || matched?.id || 'hoa_hong';
    const giftName = params.giftName || matched?.name || 'Quà TikTok';
    const fallbackImage = params.fallbackImage || matched?.image || DEFAULT_GIFT_IMAGE;
    const giftImage = params.giftImage || fallbackImage;
    const coins = Math.max(1, Number(params.coins) || matched?.coins || 1);
    const repeatCount = Math.max(1, Number(params.repeatCount) || 1);

    const boostEntry = {
      user: displayUser,
      uniqueId: params.uniqueId || userKey,
      userKey,
      avatar,
      giftId,
      giftName,
      giftImage,
      fallbackImage,
      coins,
      repeatCount,
      applied: false,
      timestamp: Date.now()
    };

    const existingAns = this.questionAnswers.get(userKey);
    let mode = 'armed';
    let bonusPoints = 0;
    let totalPoints = 0;
    let answerKey = existingAns?.answer || '';
    let alertMessage = `Đã kích hoạt x2 điểm cho câu trả lời hiện tại!`;

    if (existingAns && existingAns.isCorrect && !existingAns.boosted) {
      // Tình huống 2: Người dùng đã trả lời ĐÚNG câu hiện tại trước đó -> cộng bù ngay phần nhân đôi x2!
      mode = 'retroactive';
      bonusPoints = existingAns.basePoints * this.multiplier;
      existingAns.boosted = true;
      existingAns.earnedPoints += bonusPoints;
      existingAns.giftInfo = boostEntry;
      totalPoints = existingAns.earnedPoints;
      boostEntry.applied = true;

      this.activeGiftBoosts.set(userKey, boostEntry);

      const player = this.players.get(userKey);
      if (player) {
        player.points += bonusPoints;
        player.lastBoosted = true;
        player.lastGiftImage = giftImage;
        player.lastGiftName = giftName;
      }
      this.leaderboard = this.computeLeaderboard();

      if (this.roundWinner && this.roundWinner.userKey === userKey) {
        this.roundWinner.boosted = true;
        this.roundWinner.earnedPoints = totalPoints;
      }

      alertMessage = `Đáp án ${answerKey} được x2 điểm (+${bonusPoints}đ → ${totalPoints}đ)!`;
    } else if (!this.isRevealed && !existingAns) {
      // Tình huống 1: Tặng quà trước khi trả lời câu hiện tại -> sẵn sàng x2 khi bình luận
      mode = 'armed';
      this.activeGiftBoosts.set(userKey, boostEntry);
      alertMessage = `Kích hoạt x2 điểm! Bình luận đáp án ngay để nhân đôi điểm!`;
    } else {
      // Tình huống 3: Đã hết giờ hoặc đã dùng lượt x2 câu này -> bảo lưu x2 cho câu tiếp theo
      mode = 'next_question';
      this.nextQuestionGiftBoosts.set(userKey, boostEntry);
      alertMessage = `Bảo lưu buff x2 điểm cho câu hỏi tiếp theo!`;
    }

    const alertPayload = {
      ...boostEntry,
      mode,
      answer: answerKey,
      bonusPoints,
      totalPoints,
      message: alertMessage
    };

    this.recentGifts.unshift(alertPayload);
    if (this.recentGifts.length > 20) this.recentGifts.pop();

    this.broadcast('gplx.giftAlert', alertPayload);
    this.broadcastState();
    return alertPayload;
  }

  submitAnswer({ user, uniqueId, avatar, answer }) {
    const rawAnswer = String(answer || '').trim().toUpperCase();
    const q = this.getCurrentQuestion();
    const validKeys = Array.isArray(q.options) && q.options.length
      ? q.options.map(o => String(o.key).toUpperCase())
      : ['A', 'B', 'C', 'D'];
    if (!validKeys.includes(rawAnswer)) return null;

    if (this.isRevealed) {
      return { closed: true, answer: rawAnswer };
    }

    const displayUser = formatDisplayHandle(user, uniqueId);
    const userKey = normalizeUserKey(uniqueId, user);
    const existingPlayer = this.players.get(userKey);
    const safeAvatar = String(avatar || existingPlayer?.avatar || '').trim();

    // Mỗi học viên chỉ tính điểm 1 lần trên mỗi câu hỏi để tránh spam bình luận farm điểm
    if (this.questionAnswers.has(userKey)) {
      const prev = this.questionAnswers.get(userKey);
      return {
        duplicate: true,
        user: displayUser,
        answer: prev.answer,
        isCorrect: prev.isCorrect,
        earnedPoints: prev.earnedPoints,
        boosted: prev.boosted
      };
    }

    this.votes[rawAnswer] = (this.votes[rawAnswer] || 0) + 1;

    const isCorrect = rawAnswer === String(q.correctKey || '').toUpperCase();
    const elapsedSec = Math.max(0.2, (this.timerMax - this.timerRemaining) + Math.random() * 0.4);
    const speedSec = Number(elapsedSec.toFixed(1));
    const speedText = `+${speedSec.toFixed(1)}s`;

    // Kiểm tra người dùng này có đang sở hữu buff x2 từ quà tặng TikTok không
    const giftBoost = this.activeGiftBoosts.get(userKey);
    const hasGiftX2 = !!(giftBoost && !giftBoost.applied);

    const basePoints = 100 + Math.max(0, Math.round(this.timerRemaining * 10));
    const effectiveMultiplier = (hasGiftX2 ? 2 : 1) * this.multiplier;
    const earnedPoints = isCorrect ? basePoints * effectiveMultiplier : 0;

    if (hasGiftX2) {
      giftBoost.applied = true;
    }

    const answerRecord = {
      user: displayUser,
      uniqueId: uniqueId || userKey,
      userKey,
      avatar: safeAvatar,
      answer: rawAnswer,
      isCorrect,
      basePoints,
      earnedPoints,
      multiplier: effectiveMultiplier,
      boosted: hasGiftX2,
      giftInfo: hasGiftX2 ? giftBoost : null,
      speedSec,
      speed: speedText,
      timestamp: Date.now()
    };

    this.questionAnswers.set(userKey, answerRecord);

    if (isCorrect) {
      let player = this.players.get(userKey);
      if (player) {
        player.user = displayUser;
        if (safeAvatar) player.avatar = safeAvatar;
        player.points += earnedPoints;
        player.delta = speedText;
        player.correctCount = (player.correctCount || 0) + 1;
        player.lastBoosted = hasGiftX2;
        if (hasGiftX2) {
          player.lastGiftImage = giftBoost.giftImage;
          player.lastGiftName = giftBoost.giftName;
        }
      } else {
        player = {
          user: displayUser,
          uniqueId: uniqueId || userKey,
          userKey,
          points: earnedPoints,
          delta: speedText,
          avatar: safeAvatar,
          correctCount: 1,
          lastBoosted: hasGiftX2,
          lastGiftImage: hasGiftX2 ? giftBoost.giftImage : '',
          lastGiftName: hasGiftX2 ? giftBoost.giftName : ''
        };
        this.players.set(userKey, player);
      }

      this.leaderboard = this.computeLeaderboard();

      // Lưu người trả lời đúng nhanh nhất / điểm cao nhất câu này để MC vinh danh khi hết giờ
      if (
        !this.roundWinner ||
        (hasGiftX2 && !this.roundWinner.boosted) ||
        earnedPoints > this.roundWinner.earnedPoints
      ) {
        this.roundWinner = {
          user: displayUser,
          userKey,
          earnedPoints,
          boosted: hasGiftX2,
          speed: speedText
        };
      }
    }

    // Cập nhật thống kê tỷ lệ đúng & tốc độ trung bình theo câu hỏi
    const totalVotes = Object.values(this.votes).reduce((s, n) => s + Number(n || 0), 0);
    const correctVotes = Number(this.votes[String(q.correctKey || '').toUpperCase()] || 0);
    if (totalVotes > 0) {
      this.stats.accuracyRate = Math.round((correctVotes / totalVotes) * 100);
    }

    const payload = {
      user: displayUser,
      uniqueId: uniqueId || userKey,
      avatar: safeAvatar,
      answer: rawAnswer,
      isCorrect,
      speed: speedText,
      basePoints,
      earnedPoints,
      multiplier: effectiveMultiplier,
      boosted: hasGiftX2,
      giftName: hasGiftX2 ? giftBoost.giftName : '',
      giftImage: hasGiftX2 ? giftBoost.giftImage : ''
    };

    this.broadcast('gplx.answerResult', payload);
    this.broadcastState();
    return payload;
  }

  simulateComment(params = {}) {
    const q = this.getCurrentQuestion();
    const validKeys = q.options.map(o => String(o.key).toUpperCase());
    const ans =
      params.answer && validKeys.includes(String(params.answer).toUpperCase())
        ? String(params.answer).toUpperCase()
        : validKeys[Math.floor(Math.random() * validKeys.length)];

    let chosenUser = params.user ? formatDisplayHandle(params.user) : '';

    // Ưu tiên người dùng đang có buff x2 chưa trả lời để host test thấy ngay hiệu ứng x2!
    if (!chosenUser) {
      for (const boost of this.activeGiftBoosts.values()) {
        if (!boost.applied && !this.questionAnswers.has(boost.userKey)) {
          chosenUser = boost.user;
          break;
        }
      }
    }

    if (!chosenUser) {
      const mockUsers = [
        '@Minh_B2', '@Thanh_TaiXe_C', '@Phuong_C1', '@Tuan_LaiMoi',
        '@Hoa_SaHinh', '@Bao_Ngoc', '@Huy_Tuan', '@Linh_GPLX',
        '@Khanh_XeTai', '@Nam_LaiXeAnToan', '@Dung_B2_Pro', '@Thao_SatHach'
      ];
      const unanswered = mockUsers.filter(
        u => !this.questionAnswers.has(normalizeUserKey('', u))
      );
      const pool = unanswered.length ? unanswered : mockUsers;
      chosenUser = pool[Math.floor(Math.random() * pool.length)];
    }

    const uid = chosenUser.replace(/^@+/, '');
    return this.submitAnswer({
      user: chosenUser,
      uniqueId: uid,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uid)}`,
      answer: ans
    });
  }

  revealAnswer() {
    if (this.isRevealed) return this.getState();
    this.clearReadingFallbackTimeout();
    this.clearRevealTimeout();

    this.phase = 'revealed';
    this.isRevealed = true;
    this.timerRemaining = 0;
    const q = this.getCurrentQuestion();
    this.highlightedKey = q.correctKey;

    const correctOpt = (q.options || []).find(
      o => String(o.key).toUpperCase() === String(q.correctKey).toUpperCase()
    );
    const correctText = correctOpt ? correctOpt.text : '';
    const segments = this.buildAnswerSpeechSegments(q, this.roundWinner);

    this.broadcast('gplx.answerRevealed', {
      roundId: this.questionRoundId,
      questionId: q.id,
      questionNumber: q.questionNumber || q.id,
      correctKey: q.correctKey,
      correctText,
      roundWinner: this.roundWinner,
      segments
    });
    this.broadcastState();

    // Thời gian dự phòng tự chuyển câu (nếu bật autoNextQuestion và MC báo đọc xong sớm hơn sẽ tự chuyển sau 2.5s)
    if (this.settings.autoNextQuestion) {
      const revealFallbackMs = Math.min(22000, Math.max(10000, 7000 + correctText.length * 60));
      const targetRound = this.questionRoundId;
      this.revealTimeout = setTimeout(() => {
        this.revealTimeout = null;
        if (this.phase === 'revealed' && this.questionRoundId === targetRound && this.settings.autoNextQuestion) {
          this.nextQuestion();
        }
      }, revealFallbackMs);
    }

    return this.getState();
  }

  beginQuestionRound() {
    this.clearRevealTimeout();
    this.clearReadingFallbackTimeout();
    this.questionRoundId++;
    this.timerMax = this.settings.timerSeconds;
    this.timerRemaining = this.timerMax;
    this.isRevealed = false;
    this.phase = this.shouldWaitForMc() ? 'reading' : 'countdown';
    this.syncQuestionState();
    this.broadcastState();
    this.emitQuestionStarted();
    if (this.phase === 'reading') {
      this.armReadingFallback();
    } else {
      this.broadcast('gplx.countdownStarted', {
        roundId: this.questionRoundId,
        timerMax: this.timerMax,
        reason: 'instant_start'
      });
    }
    return this.getState();
  }

  nextQuestion() {
    this.currentQIndex = (this.currentQIndex + 1) % this.questions.length;
    return this.beginQuestionRound();
  }

  prevQuestion() {
    this.currentQIndex = (this.currentQIndex - 1 + this.questions.length) % this.questions.length;
    return this.beginQuestionRound();
  }

  jumpToQuestion(targetId) {
    const num = parseInt(targetId, 10);
    if (!Number.isFinite(num)) {
      return { ok: false, error: 'Số câu hỏi không hợp lệ' };
    }
    const idx = this.questions.findIndex(q => q.id === num || q.questionNumber === num);
    if (idx !== -1) {
      this.currentQIndex = idx;
      return this.beginQuestionRound();
    }
    const firstId = this.questions[0]?.id ?? 1;
    const lastId = this.questions[this.questions.length - 1]?.id ?? 600;
    return {
      ok: false,
      error: `Không tìm thấy câu ${num} trong bộ ${this.questions.length} câu (từ câu ${firstId} đến ${lastId})`
    };
  }

  restartTimer() {
    return this.beginQuestionRound();
  }

  resetLeaderboard() {
    this.players.clear();
    this.leaderboard = [];
    this.questionAnswers.clear();
    this.roundWinner = null;
    this.broadcastState();
    return { ok: true, leaderboard: [] };
  }

  toggleMultiplier() {
    this.multiplier = this.multiplier === 1 ? 2 : 1;
    this.broadcast('gplx.giftAlert', {
      user: 'Hệ thống Đấu Trường',
      giftId: 'tay_cam',
      giftName: this.multiplier === 2 ? 'Giờ Vàng x2 Toàn Phòng' : 'Trở về x1 Điểm',
      giftImage: '/assets/gifts/tay_cam.svg',
      fallbackImage: DEFAULT_GIFT_IMAGE,
      coins: 0,
      repeatCount: 1,
      mode: 'global',
      message:
        this.multiplier === 2
          ? 'Toàn bộ câu trả lời đúng được x2 điểm!'
          : 'Đã tắt Giờ Vàng x2 toàn phòng (quà tặng cá nhân vẫn x2).'
    });
    this.broadcastState();
    return { multiplier: this.multiplier };
  }
}

GplxEngine.parseGplxAnswerFromComment = parseGplxAnswerFromComment;
GplxEngine.splitVietnameseSpeechChunks = splitVietnameseSpeechChunks;

module.exports = GplxEngine;
