/**
 * Kỳ Đài Cờ Tướng TikTok Live — Client Controller
 * - 1:1 SVG Rosewood 9x10 Xiangqi Board with Dual Coordinates (A-I / 0-9 + VN Files 1-9)
 * - GPU-composited piece sliding animations & Host click-to-move interaction
 * - Gift-Gated Turn Spotlight, VIP Queue Strip, Live Eval Bar, Real Donor Leaderboard
 * - Synthesized wooden Xiangqi SFX + ZeroTTS AI Commentator with 60fps 5-viseme lip-sync
 */

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAD_X = 96;
  const PAD_Y = 88;
  const CELL = 96;
  const FILES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const DEFAULT_GIFT_IMG = '/assets/gifts/qua_mac_dinh.svg';

  const PIECE_INFO = {
    K: { han: '帥', vi: 'Tướng', side: 'r' },
    A: { han: '仕', vi: 'Sĩ', side: 'r' },
    B: { han: '相', vi: 'Tượng', side: 'r' },
    N: { han: '傌', vi: 'Mã', side: 'r' },
    R: { han: '俥', vi: 'Xe', side: 'r' },
    C: { han: '炮', vi: 'Pháo', side: 'r' },
    P: { han: '兵', vi: 'Tốt', side: 'r' },
    k: { han: '將', vi: 'Tướng', side: 'b' },
    a: { han: '士', vi: 'Sĩ', side: 'b' },
    b: { han: '象', vi: 'Tượng', side: 'b' },
    n: { han: '馬', vi: 'Mã', side: 'b' },
    r: { han: '車', vi: 'Xe', side: 'b' },
    c: { han: '砲', vi: 'Pháo', side: 'b' },
    p: { han: '卒', vi: 'Tốt', side: 'b' }
  };

  function svgEl(tag, attrs = {}, text = null) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    if (text !== null) el.textContent = text;
    return el;
  }

  function gridX(c) {
    return PAD_X + c * CELL;
  }

  function gridY(r) {
    return PAD_Y + r * CELL;
  }

  function coordLabel(r, c) {
    return `${FILES[c]}${9 - r}`;
  }

  // ==========================================================================
  // 1. SYNTHESIZED WOODEN XIANGQI SFX ENGINE (WEB AUDIO API)
  // ==========================================================================
  class XiangqiSoundEngine {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.volume = 0.85;
      this.localMuted = false;
    }

    ensureCtx() {
      if (!this.ctx) {
        const AudioContextCls = window.AudioContext || window.webkitAudioContext;
        if (AudioContextCls) this.ctx = new AudioContextCls();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    canPlay() {
      return this.enabled && !this.localMuted && this.volume > 0.01;
    }

    playWoodKnock(intensity = 1) {
      if (!this.canPlay()) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume * intensity;

      // Woody body thump
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360 * intensity, now);
      osc.frequency.exponentialRampToValueAtTime(115, now + 0.065);
      gain.gain.setValueAtTime(0.45 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);

      // Crisp wooden click noise burst
      const bufSize = Math.floor(ctx.sampleRate * 0.032);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.28));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, now);
      filter.Q.setValueAtTime(1.8, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.55 * vol, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(now);
    }

    playCapture() {
      this.playWoodKnock(1.35);
      setTimeout(() => this.playWoodKnock(0.85), 55);
    }

    playCheck() {
      if (!this.canPlay()) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const freqs = [220, 330, 587.33];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(0.18 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.68);
      });
    }

    playCheckmate() {
      if (!this.canPlay()) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      // Triumphant Vietnamese pentatonic fanfare
      const notes = [392, 440, 523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const t = now + i * 0.1;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.24 * this.volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.68);
      });
    }

    playGift(tier = 'standard') {
      if (!this.canPlay()) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = tier === 'legendary'
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
        : tier === 'epic' || tier === 'vip'
        ? [523.25, 659.25, 783.99, 1046.5]
        : [587.33, 783.99, 987.77];

      notes.forEach((freq, i) => {
        const t = now + i * 0.065;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.22 * this.volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.36);
      });
    }

    playReject() {
      if (!this.canPlay()) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.linearRampToValueAtTime(185, now + 0.18);
      gain.gain.setValueAtTime(0.16 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    }

    playTick() {
      if (!this.canPlay()) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.1 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  }

  // ==========================================================================
  // 2. LIP-SYNC ANIMATOR & ZEROTTS MC COMMENTATOR
  // ==========================================================================
  class McLipSyncAnimator {
    constructor(svgNode) {
      this.svgNode = svgNode;
      this.mode = 'idle';
      this.analyser = null;
      this.timeData = null;
      this.freqData = null;
      this.rafId = null;
      this.smoothedAmp = 0;
      this.lastViseme = 'closed';
      this.lastSwitchTs = 0;
    }

    attachAnalyser(analyser) {
      this.analyser = analyser;
      if (analyser) {
        this.timeData = new Uint8Array(analyser.fftSize);
        this.freqData = new Uint8Array(analyser.frequencyBinCount);
      }
    }

    setMode(mode) {
      this.mode = mode || 'idle';
      if (this.mode === 'idle') {
        this.stop();
        return;
      }
      if (!this.rafId) {
        this.rafId = requestAnimationFrame((ts) => this.tick(ts));
      }
    }

    stop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.smoothedAmp = 0;
      this.applyVisual('closed', 0, 0);
    }

    applyVisual(viseme, amp, nowMs) {
      if (!this.svgNode) return;
      if (viseme !== this.lastViseme) {
        this.svgNode.setAttribute('data-mouth', viseme);
        this.lastViseme = viseme;
      }
      const clamped = Math.max(0, Math.min(1, amp));
      const tilt = clamped > 0.08 ? Math.sin(nowMs * 0.0055) * (1.8 * clamped + 0.5) : 0;
      const brow = clamped > 0.45 ? -((clamped - 0.45) * 4.0) : 0;
      this.svgNode.style.setProperty('--talk-amp', clamped.toFixed(3));
      this.svgNode.style.setProperty('--talk-tilt', `${tilt.toFixed(2)}deg`);
      this.svgNode.style.setProperty('--brow-lift', `${brow.toFixed(2)}px`);
    }

    tick(nowMs) {
      if (this.mode === 'idle') {
        this.stop();
        return;
      }
      let rawAmp = 0;
      let isRound = false;
      if (this.mode === 'audio' && this.analyser && this.timeData && this.freqData) {
        this.analyser.getByteTimeDomainData(this.timeData);
        let sumSq = 0;
        for (let i = 0; i < this.timeData.length; i++) {
          const n = (this.timeData[i] - 128) / 128;
          sumSq += n * n;
        }
        const rms = Math.sqrt(sumSq / this.timeData.length);
        this.analyser.getByteFrequencyData(this.freqData);
        let low = 0;
        let high = 0;
        const split = Math.min(14, Math.floor(this.freqData.length * 0.16));
        for (let i = 1; i < split; i++) low += this.freqData[i];
        for (let i = split; i < Math.min(48, this.freqData.length); i++) high += this.freqData[i];
        rawAmp = Math.min(1, rms * 4.4);
        isRound = low > high * 1.45 && rms > 0.08;
      } else {
        const wave = Math.abs(Math.sin(nowMs * 0.022));
        const cadence = Math.sin(nowMs * 0.0067) * 0.5 + 0.5;
        const pause = Math.sin(nowMs * 0.0029) > -0.76 ? 1 : 0.05;
        rawAmp = wave * (0.35 + 0.65 * cadence) * pause;
        isRound = Math.sin(nowMs * 0.011) > 0.55;
      }

      this.smoothedAmp = this.smoothedAmp * 0.45 + rawAmp * 0.55;
      let viseme = this.lastViseme;
      if (nowMs - this.lastSwitchTs >= 45 || this.smoothedAmp < 0.07) {
        if (this.smoothedAmp < 0.07) viseme = 'closed';
        else if (this.smoothedAmp < 0.22) viseme = 'small';
        else if (isRound && this.smoothedAmp < 0.62) viseme = 'round';
        else if (this.smoothedAmp < 0.54) viseme = 'medium';
        else viseme = isRound ? 'round' : 'wide';
        if (viseme !== this.lastViseme) this.lastSwitchTs = nowMs;
      }
      this.applyVisual(viseme, this.smoothedAmp, nowMs);
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  class XiangqiMcSpeaker {
    constructor(callbacks = {}) {
      this.onSpeakingChange = callbacks.onSpeakingChange || (() => {});
      this.onLipSyncMode = callbacks.onLipSyncMode || (() => {});
      this.onAnalyserReady = callbacks.onAnalyserReady || (() => {});
      this.onAutoplayBlocked = callbacks.onAutoplayBlocked || (() => {});
      this.isObsMode = Boolean(callbacks.isObsMode);

      this.enabled = true;
      this.voice = 'quangminh';
      this.volume = 0.95;
      this.localMuted = this.isObsMode ? false : localStorage.getItem('xq_local_muted') === 'true';
      this.zeroTtsReady = false;
      this.sessionId = 0;
      this.audioEl = null;
      this.audioCtx = null;
      this.analyser = null;
      this.gainNode = null;
      this.mediaSource = null;
    }

    ensureAudioPipeline() {
      if (!this.audioEl) {
        this.audioEl = new Audio();
        this.audioEl.crossOrigin = 'anonymous';
        this.audioEl.preload = 'auto';
      }
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 256;
          this.gainNode = this.audioCtx.createGain();
          this.gainNode.gain.value = this.localMuted ? 0 : this.volume;
          this.mediaSource = this.audioCtx.createMediaElementSource(this.audioEl);
          this.mediaSource.connect(this.analyser);
          this.analyser.connect(this.gainNode);
          this.gainNode.connect(this.audioCtx.destination);
          this.onAnalyserReady(this.analyser);
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (this.gainNode) {
        this.gainNode.gain.value = this.localMuted ? 0 : this.volume;
      }
      this.audioEl.volume = this.localMuted ? 0 : this.volume;
    }

    unlockAudio() {
      this.ensureAudioPipeline();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    }

    setLocalMuted(muted) {
      this.localMuted = this.isObsMode ? false : Boolean(muted);
      localStorage.setItem('xq_local_muted', String(this.localMuted));
      if (this.gainNode) this.gainNode.gain.value = this.localMuted ? 0 : this.volume;
      if (this.audioEl) this.audioEl.volume = this.localMuted ? 0 : this.volume;
      if (this.localMuted) this.stop();
    }

    stop() {
      this.sessionId += 1;
      if (this.audioEl) {
        try {
          this.audioEl.pause();
          this.audioEl.currentTime = 0;
        } catch (_) {}
      }
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      this.onLipSyncMode('idle');
      this.onSpeakingChange(false, '');
    }

    async fetchTtsUrl(text, voice) {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
        signal: AbortSignal.timeout(15000)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (!data.ok || !data.url) throw new Error(data.error || 'ZeroTTS failed');
      return data.url;
    }

    playAudioUrl(url, sid) {
      return new Promise((resolve) => {
        if (sid !== this.sessionId) return resolve();
        this.ensureAudioPipeline();
        const el = this.audioEl;
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          el.onended = null;
          el.onerror = null;
          resolve();
        };
        el.onended = done;
        el.onerror = done;
        el.src = url;
        this.onLipSyncMode(this.analyser ? 'audio' : 'synthetic');
        const p = el.play();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            if (err && err.name === 'NotAllowedError') {
              this.onAutoplayBlocked();
            }
            done();
          });
        }
      });
    }

    speakWebSpeech(text, sid) {
      return new Promise((resolve) => {
        if (sid !== this.sessionId || !('speechSynthesis' in window)) return resolve();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'vi-VN';
        utter.rate = 1.06;
        utter.volume = this.localMuted ? 0 : this.volume;
        utter.onstart = () => this.onLipSyncMode('synthetic');
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      });
    }

    async speak(segments, voiceOverride) {
      if (!this.enabled || this.localMuted || !Array.isArray(segments) || segments.length === 0) {
        return;
      }
      this.stop();
      const sid = this.sessionId;
      const chosenVoice = voiceOverride || this.voice || 'quangminh';

      for (const seg of segments) {
        if (sid !== this.sessionId) break;
        const clean = String(seg || '').trim();
        if (!clean) continue;
        this.onSpeakingChange(true, clean);

        let played = false;
        if (this.zeroTtsReady) {
          try {
            const url = await this.fetchTtsUrl(clean, chosenVoice);
            if (sid !== this.sessionId) break;
            await this.playAudioUrl(url, sid);
            played = true;
          } catch (_) {
            played = false;
          }
        }
        if (!played && sid === this.sessionId) {
          await this.speakWebSpeech(clean, sid);
        }
      }

      if (sid === this.sessionId) {
        this.onLipSyncMode('idle');
        this.onSpeakingChange(false, '');
      }
    }
  }

  // ==========================================================================
  // 3. MAIN APPLICATION CONTROLLER
  // ==========================================================================
  const params = new URLSearchParams(window.location.search);
  const isObsMode = params.get('obs') === '1';
  if (isObsMode) {
    document.body.classList.add('obs-mode');
  }

  // DOM References
  const stageWrapper = document.getElementById('stageWrapper');
  const stage9x16 = document.getElementById('stage9x16');
  const srAnnouncer = document.getElementById('srAnnouncer');
  const btnUnlockAudio = document.getElementById('btnUnlockAudio');

  // Header & Top Player
  const liveBadgeLabel = document.getElementById('liveBadgeLabel');
  const modeBadgeText = document.getElementById('modeBadgeText');
  const matchCounterText = document.getElementById('matchCounterText');
  const scoreRedText = document.getElementById('scoreRedText');
  const scoreBlackText = document.getElementById('scoreBlackText');
  const topPlayerBar = document.getElementById('topPlayerBar');
  const topPlayerAvatarBox = document.getElementById('topPlayerAvatarBox');
  const topSideTag = document.getElementById('topSideTag');
  const topPlayerName = document.getElementById('topPlayerName');
  const topPlayerSub = document.getElementById('topPlayerSub');
  const capturedByBlackTray = document.getElementById('capturedByBlackTray');
  const capturedByRedTray = document.getElementById('capturedByRedTray');

  // Eval bar
  const evalBarWrap = document.getElementById('evalBarWrap');
  const evalBarRed = document.getElementById('evalBarRed');
  const evalBarLabel = document.getElementById('evalBarLabel');

  // Board
  const boardViewport = document.getElementById('boardViewport');
  const xiangqiGridSvg = document.getElementById('xiangqiGridSvg');
  const arrowsLayerGroup = document.getElementById('arrowsLayerGroup');
  const boardNodesLayer = document.getElementById('boardNodesLayer');
  const boardPiecesLayer = document.getElementById('boardPiecesLayer');
  const boardCallout = document.getElementById('boardCallout');
  const boardCalloutTitle = document.getElementById('boardCalloutTitle');
  const boardCalloutSub = document.getElementById('boardCalloutSub');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const gameOverTitle = document.getElementById('gameOverTitle');
  const gameOverReason = document.getElementById('gameOverReason');
  const gameOverCountdown = document.getElementById('gameOverCountdown');

  // Spotlight & Queue
  const turnSpotlightBox = document.getElementById('turnSpotlightBox');
  const bottomSideTag = document.getElementById('bottomSideTag');
  const bottomSideDesc = document.getElementById('bottomSideDesc');
  const queueCountPill = document.getElementById('queueCountPill');
  const stateWaitingGift = document.getElementById('stateWaitingGift');
  const waitingGiftTitle = document.getElementById('waitingGiftTitle');
  const waitingGiftSub = document.getElementById('waitingGiftSub');
  const stateActiveDonor = document.getElementById('stateActiveDonor');
  const activeDonorAvatar = document.getElementById('activeDonorAvatar');
  const activeDonorGiftImg = document.getElementById('activeDonorGiftImg');
  const activeDonorName = document.getElementById('activeDonorName');
  const activeDonorTier = document.getElementById('activeDonorTier');
  const activeDonorCmd = document.getElementById('activeDonorCmd');
  const activeDonorHints = document.getElementById('activeDonorHints');
  const turnTimerBox = document.getElementById('turnTimerBox');
  const turnTimerFg = document.getElementById('turnTimerFg');
  const turnTimerNum = document.getElementById('turnTimerNum');
  const stateAiThinking = document.getElementById('stateAiThinking');
  const aiThinkingTitle = document.getElementById('aiThinkingTitle');
  const aiThinkingSub = document.getElementById('aiThinkingSub');
  const stageQueueStrip = document.getElementById('stageQueueStrip');

  // Bottom HUD & Toast
  const moveFeedbackStrip = document.getElementById('moveFeedbackStrip');
  const viewerCountText = document.getElementById('viewerCountText');
  const stageLeaderboardRow = document.getElementById('stageLeaderboardRow');
  const stageLeaderboardEmpty = document.getElementById('stageLeaderboardEmpty');
  const mcSubtitleBar = document.getElementById('mcSubtitleBar');
  const mcSubtitleText = document.getElementById('mcSubtitleText');
  const mcHostFrame = document.getElementById('mcHostFrame');
  const mcAvatarSvg = document.getElementById('mcAvatarSvg');
  const mcSpeakingBadge = document.getElementById('mcSpeakingBadge');

  const giftToast = document.getElementById('giftToast');
  const giftToastAvatar = document.getElementById('giftToastAvatar');
  const giftToastTier = document.getElementById('giftToastTier');
  const giftToastUser = document.getElementById('giftToastUser');
  const giftToastSub = document.getElementById('giftToastSub');
  const giftToastImg = document.getElementById('giftToastImg');
  const giftToastCoins = document.getElementById('giftToastCoins');

  // Dock Controls
  const inputTikTokUser = document.getElementById('inputTikTokUser');
  const btnConnectTikTok = document.getElementById('btnConnectTikTok');
  const btnDisconnectTikTok = document.getElementById('btnDisconnectTikTok');
  const dockTikTokStatus = document.getElementById('dockTikTokStatus');
  const dockGameStatusBadge = document.getElementById('dockGameStatusBadge');
  const selectGameMode = document.getElementById('selectGameMode');
  const selectAiDifficulty = document.getElementById('selectAiDifficulty');
  const btnNewGame = document.getElementById('btnNewGame');
  const btnAiMoveNow = document.getElementById('btnAiMoveNow');
  const btnUndoMove = document.getElementById('btnUndoMove');
  const btnShowHints = document.getElementById('btnShowHints');
  const btnToggleHostAi = document.getElementById('btnToggleHostAi');
  const btnSwapSides = document.getElementById('btnSwapSides');
  const btnToggleViLabels = document.getElementById('btnToggleViLabels');
  const btnDrawGame = document.getElementById('btnDrawGame');
  const dockQueueBadge = document.getElementById('dockQueueBadge');
  const inputMinCoins = document.getElementById('inputMinCoins');
  const inputTurnTimeout = document.getElementById('inputTurnTimeout');
  const btnSaveRules = document.getElementById('btnSaveRules');
  const selectTimeoutAction = document.getElementById('selectTimeoutAction');
  const btnToggleVipPriority = document.getElementById('btnToggleVipPriority');
  const btnToggleAutoNewGame = document.getElementById('btnToggleAutoNewGame');
  const btnSkipTurn = document.getElementById('btnSkipTurn');
  const btnClearQueue = document.getElementById('btnClearQueue');
  const dockQueueList = document.getElementById('dockQueueList');
  const inputSimUser = document.getElementById('inputSimUser');
  const dockGiftGrid = document.getElementById('dockGiftGrid');
  const inputSimComment = document.getElementById('inputSimComment');
  const btnSendSimComment = document.getElementById('btnSendSimComment');
  const btnTestNonDonor = document.getElementById('btnTestNonDonor');
  const dockTtsStatus = document.getElementById('dockTtsStatus');
  const selectMcVoice = document.getElementById('selectMcVoice');
  const btnMcTestVoice = document.getElementById('btnMcTestVoice');
  const btnToggleMcAuto = document.getElementById('btnToggleMcAuto');
  const btnToggleSfx = document.getElementById('btnToggleSfx');
  const btnToggleLocalMute = document.getElementById('btnToggleLocalMute');
  const btnResetLeaderboard = document.getElementById('btnResetLeaderboard');
  const mcVolumeRange = document.getElementById('mcVolumeRange');
  const mcVolumeValue = document.getElementById('mcVolumeValue');
  const dockEventFeed = document.getElementById('dockEventFeed');

  // State
  let currentState = null;
  let selectedCell = null; // { r, c } for Host manual click-to-move
  let ws = null;
  let rpcId = 1;
  let giftToastTimer = null;
  let calloutTimer = null;
  let feedbackTimer = null;
  let lastRenderedPly = -1;
  let lastRenderedMatch = -1;
  const pieceNodesMap = new Map(); // "r,c" -> { el, piece }
  const nodeButtonsMap = new Map(); // "r,c" -> button

  const sfx = new XiangqiSoundEngine();
  const lipSync = new McLipSyncAnimator(mcAvatarSvg);
  const mcSpeaker = new XiangqiMcSpeaker({
    isObsMode,
    onSpeakingChange: (speaking, line) => {
      mcHostFrame.classList.toggle('is-speaking', speaking);
      mcSubtitleBar.classList.toggle('is-speaking', speaking);
      mcSpeakingBadge.hidden = !speaking;
      if (line) {
        mcSubtitleText.textContent = `🎙️ ${line}`;
      }
    },
    onLipSyncMode: (mode) => lipSync.setMode(mode),
    onAnalyserReady: (analyser) => lipSync.attachAnalyser(analyser),
    onAutoplayBlocked: () => {
      btnUnlockAudio.hidden = false;
    }
  });

  // ==========================================================================
  // 4. RESPONSIVE 9:16 STAGE SCALING
  // ==========================================================================
  function resizeStage() {
    if (!stageWrapper || !stage9x16) return;
    const w = stageWrapper.clientWidth;
    const h = stageWrapper.clientHeight;
    const scale = Math.min(w / 1080, h / 1920);
    stage9x16.style.transform = `scale(${scale.toFixed(4)})`;
  }
  window.addEventListener('resize', resizeStage);
  resizeStage();

  // ==========================================================================
  // 5. STATIC XIANGQI 9x10 SVG BOARD + CLICKABLE INTERSECTIONS
  // ==========================================================================
  function drawStarMarker(parent, r, c) {
    const cx = gridX(c);
    const cy = gridY(r);
    const gap = 8;
    const arm = 16;
    const dirs = [];
    if (c > 0) dirs.push([-1, -1], [-1, 1]);
    if (c < 8) dirs.push([1, -1], [1, 1]);
    for (const [sx, sy] of dirs) {
      const x1 = cx + sx * gap;
      const y1 = cy + sy * gap;
      const d = `M ${x1 + sx * arm} ${y1} L ${x1} ${y1} L ${x1} ${y1 + sy * arm}`;
      parent.appendChild(svgEl('path', {
        d,
        fill: 'none',
        stroke: '#5b2b10',
        'stroke-width': 2.8,
        'stroke-linecap': 'round'
      }));
    }
  }

  function buildXiangqiGridSvg() {
    const nodes = [];
    const ink = '#4a210a';
    const x0 = gridX(0);
    const x8 = gridX(8);
    const y0 = gridY(0);
    const y4 = gridY(4);
    const y5 = gridY(5);
    const y9 = gridY(9);

    // Outer double decorative border
    nodes.push(svgEl('rect', {
      x: x0 - 14, y: y0 - 14, width: (x8 - x0) + 28, height: (y9 - y0) + 28,
      fill: 'none', stroke: '#6c3111', 'stroke-width': 5, rx: 4
    }));
    nodes.push(svgEl('rect', {
      x: x0, y: y0, width: x8 - x0, height: y9 - y0,
      fill: 'none', stroke: ink, 'stroke-width': 3
    }));

    // 10 Horizontal rank lines
    for (let r = 1; r < 9; r++) {
      nodes.push(svgEl('line', {
        x1: x0, y1: gridY(r), x2: x8, y2: gridY(r),
        stroke: ink, 'stroke-width': 2.4
      }));
    }

    // Inner vertical lines split by Sở Hà - Hán Giới river
    for (let c = 1; c < 8; c++) {
      const x = gridX(c);
      nodes.push(svgEl('line', { x1: x, y1: y0, x2: x, y2: y4, stroke: ink, 'stroke-width': 2.4 }));
      nodes.push(svgEl('line', { x1: x, y1: y5, x2: x, y2: y9, stroke: ink, 'stroke-width': 2.4 }));
    }

    // Palace diagonal crosses (Top Black & Bottom Red)
    const palaceLines = [
      [3, 0, 5, 2], [5, 0, 3, 2],
      [3, 7, 5, 9], [5, 7, 3, 9]
    ];
    for (const [c1, r1, c2, r2] of palaceLines) {
      nodes.push(svgEl('line', {
        x1: gridX(c1), y1: gridY(r1), x2: gridX(c2), y2: gridY(r2),
        stroke: ink, 'stroke-width': 2.4
      }));
    }

    // River band wash & authentic calligraphy
    nodes.push(svgEl('rect', {
      x: x0 + 2, y: y4 + 2, width: (x8 - x0) - 4, height: (y5 - y4) - 4,
      fill: 'rgba(138, 76, 26, 0.11)'
    }));
    const riverY = (y4 + y5) / 2 + 16;
    nodes.push(svgEl('text', {
      x: 245, y: riverY, 'text-anchor': 'middle',
      fill: '#5b2b10', 'font-family': 'Noto Serif SC, Songti SC, serif',
      'font-size': 46, 'font-weight': 900, opacity: 0.78
    }, '楚 河'));
    nodes.push(svgEl('text', {
      x: 480, y: (y4 + y5) / 2 + 6, 'text-anchor': 'middle',
      fill: '#6b3312', 'font-family': 'Be Vietnam Pro, sans-serif',
      'font-size': 15, 'font-weight': 900, 'letter-spacing': 3, opacity: 0.65
    }, 'SỞ HÀ · HÁN GIỚI'));
    nodes.push(svgEl('text', {
      x: 715, y: riverY, 'text-anchor': 'middle',
      fill: '#5b2b10', 'font-family': 'Noto Serif SC, Songti SC, serif',
      'font-size': 46, 'font-weight': 900, opacity: 0.78
    }, '漢 界'));

    // Star markers for Cannons and Pawns
    const markerGroup = svgEl('g');
    const stars = [
      [2, 1], [2, 7], [7, 1], [7, 7],
      [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
      [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]
    ];
    for (const [r, c] of stars) drawStarMarker(markerGroup, r, c);
    nodes.push(markerGroup);

    // Crystal-Clear Dual Coordinates on ALL 4 Borders
    // Columns A..I (Top & Bottom) + Traditional Xiangqi Files (1..9 Black top, 9..1 Red bottom)
    for (let c = 0; c < 9; c++) {
      const x = gridX(c);
      nodes.push(svgEl('text', {
        x, y: 31, 'text-anchor': 'middle',
        fill: '#451a03', 'font-family': 'Montserrat, sans-serif',
        'font-size': 25, 'font-weight': 900
      }, FILES[c]));
      nodes.push(svgEl('text', {
        x, y: 58, 'text-anchor': 'middle',
        fill: '#334155', 'font-family': 'Be Vietnam Pro, sans-serif',
        'font-size': 15, 'font-weight': 800
      }, String(c + 1)));

      nodes.push(svgEl('text', {
        x, y: 995, 'text-anchor': 'middle',
        fill: '#991b1b', 'font-family': 'Be Vietnam Pro, sans-serif',
        'font-size': 15, 'font-weight': 800
      }, String(9 - c)));
      nodes.push(svgEl('text', {
        x, y: 1024, 'text-anchor': 'middle',
        fill: '#451a03', 'font-family': 'Montserrat, sans-serif',
        'font-size': 25, 'font-weight': 900
      }, FILES[c]));
    }

    // Ranks 9..0 (Left & Right edges)
    for (let r = 0; r < 10; r++) {
      const y = gridY(r) + 9;
      const rankStr = String(9 - r);
      nodes.push(svgEl('text', {
        x: 38, y, 'text-anchor': 'middle',
        fill: '#451a03', 'font-family': 'Montserrat, sans-serif',
        'font-size': 25, 'font-weight': 900
      }, rankStr));
      nodes.push(svgEl('text', {
        x: 922, y, 'text-anchor': 'middle',
        fill: '#451a03', 'font-family': 'Montserrat, sans-serif',
        'font-size': 25, 'font-weight': 900
      }, rankStr));
    }

    xiangqiGridSvg.replaceChildren(...nodes);
  }

  function buildBoardIntersectionButtons() {
    const frag = document.createDocumentFragment();
    nodeButtonsMap.clear();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'board-node-btn';
        btn.style.left = `${(gridX(c) / 960) * 100}%`;
        btn.style.top = `${(gridY(r) / 1040) * 100}%`;
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.setAttribute('aria-label', `Ô ${coordLabel(r, c)}`);
        btn.addEventListener('click', () => handleBoardCellClick(r, c));
        nodeButtonsMap.set(`${r},${c}`, btn);
        frag.appendChild(btn);
      }
    }
    boardNodesLayer.replaceChildren(frag);
  }

  // ==========================================================================
  // 6. INTERACTIVE BOARD RENDERING & HOST CLICK-TO-MOVE
  // ==========================================================================
  function handleBoardCellClick(r, c) {
    if (!currentState || currentState.isOver) return;
    sfx.ensureCtx();

    const piece = currentState.board?.[r]?.[c];
    const pieceSide = piece ? (piece === piece.toUpperCase() ? 'r' : 'b') : null;

    if (selectedCell) {
      if (selectedCell.r === r && selectedCell.c === c) {
        selectedCell = null;
        renderBoardDecorations();
        return;
      }
      // Check if clicking a legal target for the selected piece
      const legalTarget = (currentState.legalMoves || []).find(
        (m) => m.fromR === selectedCell.r && m.fromC === selectedCell.c && m.toR === r && m.toC === c
      );
      if (legalTarget) {
        const from = selectedCell;
        selectedCell = null;
        renderBoardDecorations();
        rpcCall('xiangqi.hostMove', { fromR: from.r, fromC: from.c, toR: r, toC: c });
        return;
      }
    }

    // Select a piece of the current side to move
    if (piece && pieceSide === currentState.turn) {
      selectedCell = { r, c };
      renderBoardDecorations();
    } else {
      selectedCell = null;
      renderBoardDecorations();
    }
  }

  function createPieceButton(r, c, piece) {
    const meta = PIECE_INFO[piece];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `xq-piece side-${meta.side}`;
    btn.style.setProperty('--px', `${gridX(c)}px`);
    btn.style.setProperty('--py', `${gridY(r)}px`);
    btn.dataset.r = String(r);
    btn.dataset.c = String(c);
    btn.dataset.piece = piece;
    btn.setAttribute('aria-label', `${meta.vi} ${meta.side === 'r' ? 'Đỏ' : 'Đen'} tại ${coordLabel(r, c)}`);

    const hanSpan = document.createElement('span');
    hanSpan.className = 'xq-piece-han';
    hanSpan.textContent = meta.han;
    const viSpan = document.createElement('span');
    viSpan.className = 'xq-piece-vi';
    viSpan.textContent = meta.vi;

    btn.append(hanSpan, viSpan);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const curR = Number(btn.dataset.r);
      const curC = Number(btn.dataset.c);
      handleBoardCellClick(curR, curC);
    });
    return btn;
  }

  function syncBoardPieces(state) {
    const board = state.board;
    if (!Array.isArray(board)) return;

    const canSlideAnimate =
      state.matchNumber === lastRenderedMatch &&
      state.plyCount === lastRenderedPly + 1 &&
      state.lastMove &&
      pieceNodesMap.size > 0;

    if (canSlideAnimate) {
      const m = state.lastMove;
      const fromKey = `${m.fromR},${m.fromC}`;
      const toKey = `${m.toR},${m.toC}`;
      const movingEntry = pieceNodesMap.get(fromKey);
      const capturedEntry = pieceNodesMap.get(toKey);

      if (movingEntry && movingEntry.piece === m.piece) {
        if (capturedEntry) {
          capturedEntry.el.remove();
          pieceNodesMap.delete(toKey);
        }
        pieceNodesMap.delete(fromKey);
        movingEntry.el.dataset.r = String(m.toR);
        movingEntry.el.dataset.c = String(m.toC);
        const meta = PIECE_INFO[m.piece];
        movingEntry.el.setAttribute(
          'aria-label',
          `${meta.vi} ${meta.side === 'r' ? 'Đỏ' : 'Đen'} tại ${coordLabel(m.toR, m.toC)}`
        );
        // Compositor-only transform update slides piece smoothly!
        movingEntry.el.style.setProperty('--px', `${gridX(m.toC)}px`);
        movingEntry.el.style.setProperty('--py', `${gridY(m.toR)}px`);
        pieceNodesMap.set(toKey, movingEntry);

        lastRenderedPly = state.plyCount;
        lastRenderedMatch = state.matchNumber;
        renderBoardDecorations();
        return;
      }
    }

    // Full clean rebuild via replaceChildren (new game, undo, initial sync)
    pieceNodesMap.clear();
    const frag = document.createDocumentFragment();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        const btn = createPieceButton(r, c, piece);
        pieceNodesMap.set(`${r},${c}`, { el: btn, piece });
        frag.appendChild(btn);
      }
    }
    boardPiecesLayer.replaceChildren(frag);
    lastRenderedPly = state.plyCount;
    lastRenderedMatch = state.matchNumber;
    renderBoardDecorations();
  }

  function drawArrow(parent, fromR, fromC, toR, toC, color, markerId, dashed = false, rankBadge = null) {
    const x1 = gridX(fromC);
    const y1 = gridY(fromR);
    const x2 = gridX(toC);
    const y2 = gridY(toR);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    // Trim start & end slightly so arrowheads point cleanly into the center of destination piece
    const startOffset = 22;
    const endOffset = 30;
    const sx = x1 + (dx / len) * startOffset;
    const sy = y1 + (dy / len) * startOffset;
    const ex = x2 - (dx / len) * endOffset;
    const ey = y2 - (dy / len) * endOffset;

    const lineAttrs = {
      x1: sx.toFixed(1),
      y1: sy.toFixed(1),
      x2: ex.toFixed(1),
      y2: ey.toFixed(1),
      stroke: color,
      'stroke-width': dashed ? 9 : 11,
      'stroke-linecap': 'round',
      'marker-end': `url(#${markerId})`
    };
    if (dashed) lineAttrs['stroke-dasharray'] = '14 10';
    parent.appendChild(svgEl('line', lineAttrs));

    if (rankBadge) {
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      parent.appendChild(svgEl('circle', {
        cx: mx.toFixed(1), cy: my.toFixed(1), r: 16,
        fill: '#065f46', stroke: '#6ee7b7', 'stroke-width': 2.5
      }));
      parent.appendChild(svgEl('text', {
        x: mx.toFixed(1), y: (my + 6).toFixed(1),
        'text-anchor': 'middle', fill: '#ecfdf5',
        'font-family': 'Montserrat, sans-serif', 'font-size': 16, 'font-weight': 900
      }, String(rankBadge)));
    }
  }

  function renderBoardDecorations() {
    if (!currentState) return;
    const state = currentState;

    // Reset node classes
    for (const btn of nodeButtonsMap.values()) {
      btn.classList.remove('is-last-from', 'is-last-to', 'is-legal-target', 'is-legal-capture');
    }

    // Highlight last move intersections
    if (state.lastMove) {
      const fromBtn = nodeButtonsMap.get(`${state.lastMove.fromR},${state.lastMove.fromC}`);
      const toBtn = nodeButtonsMap.get(`${state.lastMove.toR},${state.lastMove.toC}`);
      if (fromBtn) fromBtn.classList.add('is-last-from');
      if (toBtn) toBtn.classList.add('is-last-to');
    }

    // Highlight legal targets for selected piece
    if (selectedCell) {
      const legalForSel = (state.legalMoves || []).filter(
        (m) => m.fromR === selectedCell.r && m.fromC === selectedCell.c
      );
      for (const m of legalForSel) {
        const targetBtn = nodeButtonsMap.get(`${m.toR},${m.toC}`);
        if (!targetBtn) continue;
        const hasPiece = Boolean(state.board?.[m.toR]?.[m.toC]);
        targetBtn.classList.add(hasPiece ? 'is-legal-capture' : 'is-legal-target');
      }
    }

    // Piece visual states (selected, last moved, checked General)
    const checkedKingPiece = state.inCheck ? (state.turn === 'r' ? 'K' : 'k') : null;
    for (const [key, entry] of pieceNodesMap.entries()) {
      const isSel = selectedCell && `${selectedCell.r},${selectedCell.c}` === key;
      const isLast = state.lastMove && `${state.lastMove.toR},${state.lastMove.toC}` === key;
      const isCheckKing = checkedKingPiece && entry.piece === checkedKingPiece;
      entry.el.classList.toggle('is-selected', Boolean(isSel));
      entry.el.classList.toggle('is-last-moved', Boolean(isLast));
      entry.el.classList.toggle('is-in-check', Boolean(isCheckKing));
    }

    // Arrows SVG layer (Last move arrow + VIP/AI Hint arrows)
    const arrowNodes = [];
    if (state.lastMove) {
      const g = svgEl('g');
      drawArrow(
        g,
        state.lastMove.fromR,
        state.lastMove.fromC,
        state.lastMove.toR,
        state.lastMove.toC,
        'rgba(250, 204, 21, 0.72)',
        'arrowHeadGold',
        false
      );
      arrowNodes.push(g);
    }

    if (Array.isArray(state.hintMoves) && state.hintMoves.length > 0 && !state.isOver) {
      const g = svgEl('g');
      state.hintMoves.slice(0, 3).forEach((h, idx) => {
        const opacity = idx === 0 ? 0.92 : idx === 1 ? 0.65 : 0.45;
        drawArrow(
          g,
          h.fromR,
          h.fromC,
          h.toR,
          h.toC,
          `rgba(16, 185, 129, ${opacity})`,
          'arrowHeadHint',
          true,
          `#${idx + 1}`
        );
      });
      arrowNodes.push(g);
    }
    arrowsLayerGroup.replaceChildren(...arrowNodes);
  }

  // ==========================================================================
  // 7. STATE RENDERING (STAGE + HOST CONTROL DOCK)
  // ==========================================================================
  function renderCapturedTray(container, pieces) {
    if (!pieces || pieces.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'cap-empty';
      empty.textContent = 'Chưa ăn quân';
      container.replaceChildren(empty);
      return;
    }
    const chips = pieces.map((p) => {
      const meta = PIECE_INFO[p] || { han: p, side: 'r' };
      const span = document.createElement('span');
      span.className = `cap-chip is-${meta.side === 'r' ? 'red' : 'black'}`;
      span.textContent = meta.han;
      return span;
    });
    container.replaceChildren(...chips);
  }

  function renderEvalBar(state) {
    const cp = Number(state.evalRedCp) || 0;
    // Smooth sigmoid mapping centipawns -> Red percentage [6%..94%]
    let redPct = 50 + 44 * Math.tanh(cp / 480);
    if (state.isOver) {
      redPct = state.winner === 'r' ? 100 : state.winner === 'b' ? 0 : 50;
    }
    redPct = Math.max(4, Math.min(96, redPct));
    if (state.isOver && state.winner !== 'draw') {
      redPct = state.winner === 'r' ? 100 : 0;
    }
    evalBarRed.style.width = `${redPct.toFixed(1)}%`;
    evalBarWrap.setAttribute('aria-valuenow', String(Math.round(cp)));

    if (state.isOver) {
      evalBarLabel.textContent = state.winner === 'r'
        ? '👑 PHE ĐỎ CHIẾN THẮNG!'
        : state.winner === 'b'
        ? '👑 PHE ĐEN CHIẾN THẮNG!'
        : '🤝 HÒA CỜ!';
      return;
    }

    if (Math.abs(cp) >= 80000) {
      evalBarLabel.textContent = cp > 0 ? '⚔️ ĐỎ SẮP CHIẾU BÍ!' : '⚔️ ĐEN SẮP CHIẾU BÍ!';
    } else if (Math.abs(cp) < 35) {
      evalBarLabel.textContent = '⚖️ THẾ TRẬN CÂN BẰNG (0.0)';
    } else if (cp > 0) {
      evalBarLabel.textContent = `🔴 ĐỎ ƯU THẾ (+${(cp / 100).toFixed(1)})`;
    } else {
      evalBarLabel.textContent = `⚫ ĐEN ƯU THẾ (+${(Math.abs(cp) / 100).toFixed(1)})`;
    }
  }

  function updateCountdownRing(remainingSec, durationSec) {
    const dur = Math.max(1, Number(durationSec) || 30);
    const rem = Math.max(0, Number(remainingSec) || 0);
    const circ = 251.2;
    const offset = circ * (1 - rem / dur);
    turnTimerFg.style.strokeDashoffset = offset.toFixed(1);
    turnTimerNum.textContent = `${rem}s`;
    turnTimerBox.classList.toggle('is-urgent', rem <= 8);
  }

  function renderTurnSpotlight(state) {
    const turnIsRed = state.turn === 'r';
    const isPvP = state.settings.gameMode === 'viewers_vs_viewers';
    const hostIsBlack = state.settings.hostSide === 'b';

    // Top player bar (always Black / top half of board)
    topPlayerBar.classList.toggle('is-active-turn', state.turn === 'b' && !state.isOver);
    if (isPvP) {
      topSideTag.textContent = 'ĐEN • HẬU';
      if (state.turn === 'b' && state.activeTurn) {
        topPlayerName.textContent = state.activeTurn.user;
        topPlayerSub.textContent = `🎁 ${state.activeTurn.giftName} (${state.activeTurn.coins}🪙) • Đang cầm quân Đen`;
        const img = document.createElement('img');
        img.className = 'player-avatar-img';
        img.src = state.activeTurn.avatar;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        topPlayerAvatarBox.replaceChildren(img);
      } else {
        topPlayerName.textContent = 'Phe Người Xem Đen';
        topPlayerSub.textContent = state.turn === 'b' ? '🎁 Tặng quà để cầm quân Đen!' : 'Đang chờ Phe Đỏ đi nước...';
        topPlayerAvatarBox.replaceChildren('♟️');
      }
    } else if (hostIsBlack) {
      topSideTag.textContent = 'ĐEN • HẬU';
      topPlayerName.textContent = state.settings.hostAutoAi
        ? `AI ${state.aiDifficultyLabel.split(' (')[0]}`
        : 'Chủ Phòng (Host)';
      topPlayerSub.textContent = state.aiThinking
        ? '⚡ Đang tính toán thế trận...'
        : state.turn === 'b'
        ? (state.settings.hostAutoAi ? 'Chuẩn bị đáp trả...' : 'Đang chờ Host bấm đi quân Đen')
        : `Độ khó: ${state.aiDifficultyLabel}`;
      topPlayerAvatarBox.replaceChildren(state.settings.hostAutoAi ? '🤖' : '👑');
    } else {
      // Host plays Red (bottom), Viewers play Black (top)
      topSideTag.textContent = 'ĐEN • NGƯỜI XEM';
      topPlayerName.textContent = state.activeTurn ? state.activeTurn.user : 'Đội Người Xem (Đen)';
      topPlayerSub.textContent = state.turn === 'b' ? '🎁 Tặng quà để đi quân Đen!' : 'Đang chờ Host/AI đi quân Đỏ';
      topPlayerAvatarBox.replaceChildren('⚔️');
    }

    // Bottom spotlight header
    bottomSideTag.textContent = turnIsRed ? 'ĐỎ • TIÊN' : 'ĐEN • HẬU';
    bottomSideTag.className = `side-tag ${turnIsRed ? 'tag-red' : 'tag-black'}`;
    if (isPvP) {
      bottomSideDesc.textContent = turnIsRed
        ? 'Lượt Phe ĐỎ — Người Xem tặng quà cầm quân'
        : 'Lượt Phe ĐEN — Người Xem tặng quà cầm quân';
    } else {
      bottomSideDesc.textContent = state.isViewerTurn
        ? `Lượt NGƯỜI XEM cầm quân ${turnIsRed ? 'ĐỎ' : 'ĐEN'}`
        : `Lượt ${state.settings.hostAutoAi ? 'AI ĐẠI KIỆN TƯỚNG' : 'HOST'} cầm quân ${turnIsRed ? 'ĐỎ' : 'ĐEN'}`;
    }

    queueCountPill.textContent = `🎟️ Hàng đợi: ${state.queueTotalCount}`;
    renderCapturedTray(capturedByBlackTray, state.capturedByBlack);
    renderCapturedTray(capturedByRedTray, state.capturedByRed);

    // Toggle 3 Spotlight States
    const showActiveDonor = Boolean(!state.isOver && state.isViewerTurn && state.activeTurn);
    const showWaitingGift = Boolean(!state.isOver && state.isViewerTurn && !state.activeTurn);
    const showAiHost = Boolean(!state.isOver && !state.isViewerTurn);

    stateActiveDonor.hidden = !showActiveDonor;
    stateWaitingGift.hidden = !showWaitingGift;
    stateAiThinking.hidden = !showAiHost;

    turnSpotlightBox.classList.toggle('is-active-donor', showActiveDonor);
    turnSpotlightBox.classList.toggle('is-waiting-gift', showWaitingGift);

    if (showWaitingGift) {
      const sideText = turnIsRed ? 'QUÂN ĐỎ' : 'QUÂN ĐEN';
      waitingGiftTitle.textContent = `🎁 TẶNG QUÀ ĐỂ ĐI ${sideText} TIẾP THEO!`;
      waitingGiftSub.textContent =
        `Chỉ người tặng quà (từ ${state.settings.minGiftCoins}🪙) mới được bình luận tọa độ (VD: H2 E2 hoặc P2-5)`;
    }

    if (showActiveDonor) {
      const t = state.activeTurn;
      activeDonorAvatar.src = t.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(t.userKey)}`;
      activeDonorGiftImg.src = t.giftImage || DEFAULT_GIFT_IMG;
      activeDonorGiftImg.onerror = () => { activeDonorGiftImg.src = t.fallbackImage || DEFAULT_GIFT_IMG; };
      activeDonorName.textContent = t.user;
      activeDonorTier.textContent = `${t.tierLabel} • ${t.coins}🪙`;
      const extraCmds = t.canUndo
        ? ' • "gợi ý" • "đi lại" • "auto"'
        : t.canHint
        ? ' • "gợi ý" • "auto"'
        : ' • gõ "auto" AI đi hộ';
      activeDonorCmd.textContent = `💬 ${t.user} bình luận tọa độ (H2 E2 / P2-5)${extraCmds}`;
      updateCountdownRing(t.remainingSec, t.durationSec);

      if (state.hintMoves && state.hintMoves.length > 0) {
        const hintStr = state.hintMoves
          .slice(0, 3)
          .map((h) => `#${h.rank} ${h.notation.short} (${h.grid})`)
          .join('  •  ');
        activeDonorHints.textContent = `💡 Gợi ý AI: ${hintStr}`;
        activeDonorHints.hidden = false;
      } else {
        activeDonorHints.hidden = true;
      }
    }

    if (showAiHost) {
      aiThinkingTitle.textContent = state.settings.hostAutoAi
        ? `🤖 AI ${state.aiDifficultyLabel.split(' (')[0]} đang tính nước...`
        : `🖐️ Đang chờ Host bấm đi quân ${turnIsRed ? 'ĐỎ' : 'ĐEN'} trên bàn cờ`;
      aiThinkingSub.textContent = state.queueTotalCount > 0
        ? `Kỳ thủ tiếp theo sẵn sàng: ${state.moveQueue[0].user} (${state.moveQueue[0].coins}🪙)`
        : '🎁 Tặng quà ngay bây giờ để xếp hàng đi nước kế tiếp!';
    }

    // Render Up-Next Queue Strip (Stage)
    if (!state.moveQueue || state.moveQueue.length === 0) {
      const note = document.createElement('span');
      note.className = 'queue-empty-note';
      note.textContent = state.activeTurn
        ? 'Chưa có ai xếp sau — Tặng quà VIP (≥5🪙) để lên vị trí kế tiếp!'
        : 'Hàng đợi đang trống — Tặng quà để lên bàn cầm quân ngay!';
      stageQueueStrip.replaceChildren(note);
    } else {
      const chips = state.moveQueue.slice(0, 5).map((item) => {
        const chip = document.createElement('div');
        chip.className = `queue-chip${item.coins >= 5 ? ' is-vip' : ''}`;
        const img = document.createElement('img');
        img.src = item.avatar;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        const txt = document.createElement('span');
        const crown = item.coins >= 100 ? '👑 ' : item.coins >= 5 ? '⭐ ' : '';
        txt.textContent = `#${item.position} ${crown}${item.user} (${item.coins}🪙)`;
        chip.append(img, txt);
        return chip;
      });
      stageQueueStrip.replaceChildren(...chips);
    }
  }

  function renderLeaderboard(state) {
    const lb = state.leaderboard || [];
    if (lb.length === 0) {
      stageLeaderboardRow.hidden = true;
      stageLeaderboardEmpty.hidden = false;
      return;
    }
    stageLeaderboardEmpty.hidden = true;
    stageLeaderboardRow.hidden = false;

    const medals = ['🥇', '🥈', '🥉'];
    const cards = lb.slice(0, 3).map((p, idx) => {
      const card = document.createElement('div');
      card.className = `lb-card rank-${idx + 1}`;
      const avatar = document.createElement('img');
      avatar.className = 'lb-card-avatar';
      avatar.src = p.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(p.userKey)}`;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';

      const meta = document.createElement('div');
      meta.className = 'lb-card-meta';
      const name = document.createElement('div');
      name.className = 'lb-card-name';
      name.textContent = `${medals[idx]} ${p.user}`;
      const stats = document.createElement('div');
      stats.className = 'lb-card-stats';
      stats.textContent = `${p.score}đ • ${p.totalCoins}🪙 • ${p.movesMade} nước`;

      meta.append(name, stats);
      card.append(avatar, meta);
      return card;
    });
    stageLeaderboardRow.replaceChildren(...cards);
  }

  function renderDock(state) {
    if (isObsMode) return;

    // TikTok connection status
    const tk = state.tiktok || {};
    if (tk.connected) {
      dockTikTokStatus.textContent = `🟢 Đã kết nối @${tk.username} • 👁️ ${tk.viewerCount || 0} người xem`;
      dockTikTokStatus.style.color = '#6ee7b7';
    } else if (tk.connecting) {
      dockTikTokStatus.textContent = `🟡 Đang kết nối @${tk.username}...`;
      dockTikTokStatus.style.color = '#fde047';
    } else if (tk.lastError) {
      dockTikTokStatus.textContent = `🔴 Lỗi: ${tk.lastError}`;
      dockTikTokStatus.style.color = '#fca5a5';
    } else {
      dockTikTokStatus.textContent = '⚪ Chưa kết nối phòng TikTok Live (có thể dùng Giả lập bên dưới)';
      dockTikTokStatus.style.color = '#d6c2a8';
    }

    // Status badge
    dockGameStatusBadge.textContent = state.isOver
      ? 'KẾT THÚC'
      : state.inCheck
      ? 'CHIẾU TƯỚNG!'
      : `LƯỢT ${state.turn === 'r' ? 'ĐỎ' : 'ĐEN'}`;

    const s = state.settings;
    if (document.activeElement !== selectGameMode) selectGameMode.value = s.gameMode;
    if (document.activeElement !== selectAiDifficulty) selectAiDifficulty.value = s.aiDifficulty;
    if (document.activeElement !== inputMinCoins) inputMinCoins.value = String(s.minGiftCoins);
    if (document.activeElement !== inputTurnTimeout) inputTurnTimeout.value = String(s.turnTimeoutSeconds);
    if (document.activeElement !== selectTimeoutAction) selectTimeoutAction.value = s.timeoutAction;
    if (document.activeElement !== selectMcVoice) selectMcVoice.value = s.mcVoice;

    btnToggleHostAi.textContent = `🤖 AI Tự Đánh: ${s.hostAutoAi ? 'BẬT' : 'TẮT'}`;
    btnToggleHostAi.classList.toggle('is-active', s.hostAutoAi);

    btnToggleViLabels.textContent = `🔤 Chữ Việt: ${s.showViPieceLabels ? 'BẬT' : 'TẮT'}`;
    btnToggleViLabels.classList.toggle('is-active', s.showViPieceLabels);

    btnToggleVipPriority.textContent = `👑 Ưu Tiên VIP: ${s.vipPriority ? 'BẬT' : 'TẮT'}`;
    btnToggleVipPriority.classList.toggle('is-active', s.vipPriority);

    btnToggleAutoNewGame.textContent = `🔁 Tự Ván Mới: ${s.autoNewGame ? 'BẬT' : 'TẮT'}`;
    btnToggleAutoNewGame.classList.toggle('is-active', s.autoNewGame);

    btnToggleMcAuto.textContent = `🎙️ MC Tự Đọc: ${s.mcAutoRead ? 'BẬT' : 'TẮT'}`;
    btnToggleMcAuto.classList.toggle('is-active', s.mcAutoRead);

    btnToggleSfx.textContent = `🔊 Âm Cờ Gỗ: ${s.sfxEnabled ? 'BẬT' : 'TẮT'}`;
    btnToggleSfx.classList.toggle('is-active', s.sfxEnabled);

    btnToggleLocalMute.textContent = `🔈 Loa Tab Này: ${mcSpeaker.localMuted ? 'TẮT' : 'BẬT'}`;
    btnToggleLocalMute.classList.toggle('danger', mcSpeaker.localMuted);

    const volPct = Math.round((s.mcVolume ?? 0.95) * 100);
    if (document.activeElement !== mcVolumeRange) mcVolumeRange.value = String(volPct);
    mcVolumeValue.textContent = `${volPct}%`;

    // Queue badge & list in Dock
    const totalInLine = (state.activeTurn ? 1 : 0) + state.queueTotalCount;
    dockQueueBadge.textContent = `${totalInLine} vé`;

    const qRows = [];
    if (state.activeTurn) {
      const div = document.createElement('div');
      div.className = 'dock-feed-item';
      div.style.color = '#6ee7b7';
      div.textContent = `🎯 ĐANG ĐI (${state.activeTurn.remainingSec}s): ${state.activeTurn.user} — ${state.activeTurn.giftName} (${state.activeTurn.coins}🪙)`;
      qRows.push(div);
    }
    for (const q of state.moveQueue || []) {
      const div = document.createElement('div');
      div.className = 'dock-feed-item';
      div.textContent = `#${q.position} [${q.tierLabel}] ${q.user} — ${q.giftName} (${q.coins}🪙)`;
      qRows.push(div);
    }
    if (qRows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dock-feed-item';
      empty.style.color = '#9ca3af';
      empty.textContent = 'Hàng đợi đang trống — gửi quà giả lập bên dưới để test!';
      qRows.push(empty);
    }
    dockQueueList.replaceChildren(...qRows);

    // Event feed
    const feedRows = (state.recentEvents || []).slice(0, 14).map((ev) => {
      const div = document.createElement('div');
      div.className = 'dock-feed-item';
      const time = new Date(ev.timestamp).toLocaleTimeString('vi-VN', { hour12: false });
      div.textContent = `[${time}] ${ev.message}`;
      return div;
    });
    dockEventFeed.replaceChildren(...feedRows);
  }

  function renderFullState(state) {
    currentState = state;

    // Sync audio engine settings
    sfx.enabled = Boolean(state.settings.sfxEnabled);
    sfx.volume = Number(state.settings.sfxVolume ?? 0.85);
    sfx.localMuted = mcSpeaker.localMuted;
    mcSpeaker.enabled = Boolean(state.settings.mcAutoRead);
    mcSpeaker.voice = state.settings.mcVoice || 'quangminh';
    mcSpeaker.volume = Number(state.settings.mcVolume ?? 0.95);

    // Toggle Vietnamese labels on wooden pieces
    boardViewport.classList.toggle('hide-vi-labels', !state.settings.showViPieceLabels);

    // Header badges
    const tk = state.tiktok || {};
    liveBadgeLabel.textContent = tk.connected
      ? `LIVE @${tk.username} • KỲ ĐÀI CỜ TƯỚNG`
      : 'LIVE • KỲ ĐÀI CỜ TƯỚNG';
    modeBadgeText.textContent = state.settings.gameMode === 'viewers_vs_viewers'
      ? 'NGƯỜI XEM ĐỎ vs ĐEN'
      : (state.settings.hostAutoAi ? 'NGƯỜI XEM vs AI' : 'NGƯỜI XEM vs HOST');
    matchCounterText.textContent = `VÁN #${state.matchNumber} • NƯỚC ${state.plyCount}`;
    scoreRedText.textContent = `🔴 ${state.scoreboard.redWins}`;
    scoreBlackText.textContent = `${state.scoreboard.blackWins} ⚫`;
    viewerCountText.textContent = `👁️ ${tk.viewerCount || 0} người xem`;

    renderEvalBar(state);
    syncBoardPieces(state);
    renderTurnSpotlight(state);
    renderLeaderboard(state);

    // Game Over Overlay
    if (state.isOver) {
      gameOverOverlay.hidden = false;
      gameOverTitle.textContent = state.winner === 'draw' ? '🤝 HÒA CỜ!' : '👑 CHIẾU BÍ!';
      gameOverReason.textContent = state.endReason || 'Ván cờ đã kết thúc!';
      gameOverCountdown.textContent = state.settings.autoNewGame && state.autoNewGameRemainingSec > 0
        ? `⏳ Tự mở ván mới sau ${state.autoNewGameRemainingSec}s (Hàng đợi quà được giữ nguyên!)`
        : 'Bấm "Ván Mới" để bắt đầu trận tiếp theo';
    } else {
      gameOverOverlay.hidden = true;
    }

    // Default last-move feedback strip (when no temporary alert active)
    if (!feedbackTimer && state.lastMove) {
      const lm = state.lastMove;
      const sideIcon = lm.side === 'r' ? '🔴' : '⚫';
      const capText = lm.capturedVi ? ` • Ăn ${lm.capturedVi}!` : '';
      const chkText = lm.isCheckmate ? ' • 👑 CHIẾU BÍ!' : lm.isCheck ? ' • ⚔️ CHIẾU TƯỚNG!' : '';
      moveFeedbackStrip.className = 'move-feedback-strip';
      moveFeedbackStrip.textContent =
        `${sideIcon} Nước #${lm.ply}: ${lm.actor.user} đi ${lm.notation.full} (${lm.notation.grid})${capText}${chkText}`;
    } else if (!feedbackTimer && !state.lastMove) {
      moveFeedbackStrip.className = 'move-feedback-strip';
      moveFeedbackStrip.textContent =
        '♟️ Ván mới sẵn sàng! Bình luận tọa độ A–I, 0–9 (H2 E2) hoặc ký hiệu Việt (P2-5, M2.3).';
    }

    renderDock(state);
  }

  // ==========================================================================
  // 8. TRANSIENT TOASTS, CALLOUTS & FEEDBACK
  // ==========================================================================
  function showGiftToast(gift) {
    giftToastAvatar.src = gift.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(gift.userKey || 'vip')}`;
    giftToastTier.textContent = gift.tierLabel || 'KỲ THỦ';
    giftToastUser.textContent = `${gift.user} vừa tặng ${gift.repeatCount > 1 ? `${gift.repeatCount}x ` : ''}${gift.giftName}`;
    giftToastSub.textContent = gift.statusText || '⚡ Đã nhận lượt đi cờ!';
    giftToastImg.src = gift.giftImage || DEFAULT_GIFT_IMG;
    giftToastImg.onerror = () => { giftToastImg.src = gift.fallbackImage || DEFAULT_GIFT_IMG; };
    giftToastCoins.textContent = `${gift.coins}🪙`;

    giftToast.classList.toggle('tier-legendary', gift.tier === 'legendary');
    giftToast.classList.add('is-visible');
    clearTimeout(giftToastTimer);
    giftToastTimer = setTimeout(() => {
      giftToast.classList.remove('is-visible');
    }, gift.tier === 'legendary' ? 5200 : 3800);
  }

  function showBoardCallout(title, sub) {
    boardCalloutTitle.textContent = title;
    boardCalloutSub.textContent = sub || '';
    boardCallout.classList.add('is-visible');
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => {
      boardCallout.classList.remove('is-visible');
    }, 2200);
  }

  function showTemporaryFeedback(message, level = 'warning') {
    clearTimeout(feedbackTimer);
    moveFeedbackStrip.className = `move-feedback-strip is-${level}`;
    moveFeedbackStrip.textContent = message;
    srAnnouncer.textContent = message;
    feedbackTimer = setTimeout(() => {
      feedbackTimer = null;
      if (currentState) renderFullState(currentState);
    }, 4200);
  }

  // ==========================================================================
  // 9. WEBSOCKET JSON-RPC 2.0 CONNECTION
  // ==========================================================================
  function rpcCall(method, params = {}) {
    const id = rpcId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return Promise.resolve({ sent: true });
    }
    return fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((r) => r.json());
  }

  function connectWebSocket() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.addEventListener('open', () => {
      rpcCall('xiangqi.getState');
      rpcCall('tts.status');
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (msg.method === 'xiangqi.state') {
        renderFullState(msg.params);
      } else if (msg.method === 'xiangqi.tick') {
        const t = msg.params || {};
        if (currentState && currentState.activeTurn && t.activeTurnRemainingSec !== undefined) {
          currentState.activeTurn.remainingSec = t.activeTurnRemainingSec;
          updateCountdownRing(t.activeTurnRemainingSec, t.activeTurnDurationSec || currentState.activeTurn.durationSec);
          if (t.activeTurnRemainingSec > 0 && t.activeTurnRemainingSec <= 5) {
            sfx.playTick();
          }
        }
        if (currentState && currentState.isOver && t.autoNewGameRemainingSec > 0) {
          currentState.autoNewGameRemainingSec = t.autoNewGameRemainingSec;
          gameOverCountdown.textContent =
            `⏳ Tự mở ván mới sau ${t.autoNewGameRemainingSec}s (Hàng đợi quà được giữ nguyên!)`;
        }
      } else if (msg.method === 'xiangqi.move') {
        const d = msg.params || {};
        const move = d.move;
        selectedCell = null;
        if (d.isOver && d.winner !== 'draw') {
          sfx.playCheckmate();
          showBoardCallout('👑 CHIẾU BÍ!', `${move.actor.user}: ${move.notation.full}`);
        } else if (d.inCheck) {
          sfx.playCheck();
          showBoardCallout('⚔️ CHIẾU TƯỚNG!', `${move.actor.user}: ${move.notation.full}`);
        } else if (move?.captured) {
          sfx.playCapture();
        } else {
          sfx.playWoodKnock(1.0);
        }
        if (move) {
          srAnnouncer.textContent = `${move.actor.user} đi ${move.notation.full}`;
        }
      } else if (msg.method === 'xiangqi.gift') {
        const gift = msg.params;
        sfx.playGift(gift.tier);
        showGiftToast(gift);
        srAnnouncer.textContent = `${gift.user} tặng ${gift.giftName} (${gift.coins} xu)`;
      } else if (msg.method === 'xiangqi.moveRejected') {
        sfx.playReject();
        showTemporaryFeedback(msg.params?.message || '🎁 Tặng quà để nhận lượt đi nước tiếp theo!', 'warning');
      } else if (msg.method === 'xiangqi.feedback') {
        const lv = msg.params?.level === 'info' ? 'info' : 'warning';
        if (lv === 'warning') sfx.playReject();
        showTemporaryFeedback(msg.params?.message || '', lv);
      } else if (msg.method === 'xiangqi.mcSpeak') {
        const p = msg.params || {};
        mcSpeaker.speak(p.segments || [], p.voice);
      } else if (msg.method === 'xiangqi.mcCommand') {
        if (msg.params?.action === 'stop') mcSpeaker.stop();
      } else if (msg.method === 'tts.status') {
        const st = msg.params || {};
        mcSpeaker.zeroTtsReady = Boolean(st.ready);
        if (dockTtsStatus) {
          dockTtsStatus.textContent = st.ready ? '🟢 ZeroTTS Sẵn Sàng' : `🟡 ZeroTTS: ${st.status}`;
          dockTtsStatus.classList.toggle('is-ready', Boolean(st.ready));
        }
      } else if (msg.result && msg.result.status !== undefined && msg.result.ready !== undefined) {
        mcSpeaker.zeroTtsReady = Boolean(msg.result.ready);
        if (dockTtsStatus) {
          dockTtsStatus.textContent = msg.result.ready ? '🟢 ZeroTTS Sẵn Sàng' : `🟡 ZeroTTS: ${msg.result.status}`;
          dockTtsStatus.classList.toggle('is-ready', Boolean(msg.result.ready));
        }
      }
    });

    ws.addEventListener('close', () => {
      setTimeout(connectWebSocket, 1800);
    });
  }

  // ==========================================================================
  // 10. HOST CONTROL DOCK EVENT WIRING
  // ==========================================================================
  btnUnlockAudio.addEventListener('click', () => {
    sfx.ensureCtx();
    mcSpeaker.unlockAudio();
    btnUnlockAudio.hidden = true;
  });

  if (!isObsMode) {
    btnConnectTikTok.addEventListener('click', () => {
      const username = inputTikTokUser.value.trim();
      if (!username) return;
      dockTikTokStatus.textContent = `🟡 Đang kết nối ${username}...`;
      rpcCall('xiangqi.connectTikTok', { username });
    });

    btnDisconnectTikTok.addEventListener('click', () => {
      rpcCall('xiangqi.disconnectTikTok');
    });

    selectGameMode.addEventListener('change', () => {
      rpcCall('xiangqi.updateSettings', { gameMode: selectGameMode.value });
    });

    selectAiDifficulty.addEventListener('change', () => {
      rpcCall('xiangqi.updateSettings', { aiDifficulty: selectAiDifficulty.value });
    });

    btnNewGame.addEventListener('click', () => {
      selectedCell = null;
      rpcCall('xiangqi.newGame', { incrementMatch: true });
    });

    btnAiMoveNow.addEventListener('click', () => {
      rpcCall('xiangqi.aiMoveNow', { forActiveViewer: Boolean(currentState?.isViewerTurn && currentState?.activeTurn) });
    });

    btnUndoMove.addEventListener('click', () => {
      selectedCell = null;
      rpcCall('xiangqi.undo', { pair: false });
    });

    btnShowHints.addEventListener('click', () => {
      rpcCall('xiangqi.showHints');
    });

    btnToggleHostAi.addEventListener('click', () => {
      if (!currentState) return;
      rpcCall('xiangqi.updateSettings', { hostAutoAi: !currentState.settings.hostAutoAi });
    });

    btnSwapSides.addEventListener('click', () => {
      selectedCell = null;
      rpcCall('xiangqi.swapSides');
    });

    btnToggleViLabels.addEventListener('click', () => {
      if (!currentState) return;
      rpcCall('xiangqi.updateSettings', { showViPieceLabels: !currentState.settings.showViPieceLabels });
    });

    btnDrawGame.addEventListener('click', () => {
      rpcCall('xiangqi.draw');
    });

    btnSaveRules.addEventListener('click', () => {
      const minGiftCoins = Math.max(1, Number(inputMinCoins.value) || 1);
      const turnTimeoutSeconds = Math.max(10, Math.min(180, Number(inputTurnTimeout.value) || 30));
      rpcCall('xiangqi.updateSettings', { minGiftCoins, turnTimeoutSeconds });
    });

    selectTimeoutAction.addEventListener('change', () => {
      rpcCall('xiangqi.updateSettings', { timeoutAction: selectTimeoutAction.value });
    });

    btnToggleVipPriority.addEventListener('click', () => {
      if (!currentState) return;
      rpcCall('xiangqi.updateSettings', { vipPriority: !currentState.settings.vipPriority });
    });

    btnToggleAutoNewGame.addEventListener('click', () => {
      if (!currentState) return;
      rpcCall('xiangqi.updateSettings', { autoNewGame: !currentState.settings.autoNewGame });
    });

    btnSkipTurn.addEventListener('click', () => {
      rpcCall('xiangqi.skipTurn');
    });

    btnClearQueue.addEventListener('click', () => {
      rpcCall('xiangqi.clearQueue');
    });

    // Gift simulator buttons
    dockGiftGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.dock-gift-btn');
      if (!btn) return;
      sfx.ensureCtx();
      const giftId = btn.dataset.giftId;
      const user = inputSimUser.value.trim() || '@KyThu_Live';
      const uniqueId = user.replace(/^@/, '');
      rpcCall('xiangqi.sendGift', { user, uniqueId, giftId });
    });

    // Comment simulator
    const sendSimulatedComment = (commentText) => {
      sfx.ensureCtx();
      const user = inputSimUser.value.trim() || '@KyThu_Live';
      const uniqueId = user.replace(/^@/, '');
      rpcCall('xiangqi.simulateComment', { user, uniqueId, comment: commentText });
    };

    btnSendSimComment.addEventListener('click', () => {
      const text = inputSimComment.value.trim();
      if (text) sendSimulatedComment(text);
    });

    inputSimComment.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = inputSimComment.value.trim();
        if (text) sendSimulatedComment(text);
      }
    });

    document.querySelectorAll('[data-quick-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const moveText = btn.dataset.quickMove;
        inputSimComment.value = moveText;
        sendSimulatedComment(moveText);
      });
    });

    btnTestNonDonor.addEventListener('click', () => {
      sfx.ensureCtx();
      rpcCall('xiangqi.simulateComment', {
        user: '@KhachChuaTangQua',
        uniqueId: 'khach_chua_tang_qua',
        comment: 'P2-5'
      });
    });

    // MC Voice & Audio controls
    selectMcVoice.addEventListener('change', () => {
      rpcCall('xiangqi.updateSettings', { mcVoice: selectMcVoice.value });
    });

    btnMcTestVoice.addEventListener('click', () => {
      sfx.ensureCtx();
      mcSpeaker.unlockAudio();
      rpcCall('xiangqi.mcCommand', { action: 'testVoice' });
    });

    btnToggleMcAuto.addEventListener('click', () => {
      if (!currentState) return;
      const next = !currentState.settings.mcAutoRead;
      if (!next) mcSpeaker.stop();
      rpcCall('xiangqi.updateSettings', { mcAutoRead: next });
    });

    btnToggleSfx.addEventListener('click', () => {
      if (!currentState) return;
      rpcCall('xiangqi.updateSettings', { sfxEnabled: !currentState.settings.sfxEnabled });
    });

    btnToggleLocalMute.addEventListener('click', () => {
      mcSpeaker.setLocalMuted(!mcSpeaker.localMuted);
      sfx.localMuted = mcSpeaker.localMuted;
      if (currentState) renderDock(currentState);
    });

    btnResetLeaderboard.addEventListener('click', () => {
      rpcCall('xiangqi.resetLeaderboard');
    });

    mcVolumeRange.addEventListener('input', () => {
      const pct = Number(mcVolumeRange.value) || 0;
      mcVolumeValue.textContent = `${pct}%`;
      const vol = +(pct / 100).toFixed(2);
      mcSpeaker.volume = vol;
      sfx.volume = vol;
    });

    mcVolumeRange.addEventListener('change', () => {
      const vol = +((Number(mcVolumeRange.value) || 0) / 100).toFixed(2);
      rpcCall('xiangqi.updateSettings', { mcVolume: vol, sfxVolume: vol });
    });
  }

  // Boot
  buildXiangqiGridSvg();
  buildBoardIntersectionButtons();
  connectWebSocket();
})();
