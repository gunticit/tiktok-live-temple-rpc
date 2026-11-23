/**
 * GPLX Client - Đấu Trường GPLX: Hạng B - C1 - C
 * TikTok Live Interactive Game Stream Engine (JSON-RPC 2.0 / WebSocket)
 * - MC AI đọc câu hỏi & đáp án tự động (ZeroTTS pipeline + Web Speech fallback)
 * - Đồng hồ 15 giây đếm ngược chuẩn xác sau khi MC đọc xong + hiệu ứng âm thanh
 * - Hình ảnh quà tặng TikTok (thật từ phòng Live + SVG fallback sắc nét) & buff x2 điểm theo người dùng
 */

(function () {
  'use strict';

  const DEFAULT_GIFT_IMAGE = '/assets/gifts/qua_mac_dinh.svg';

  /**
   * Bộ điều khiển nhép miệng thời gian thực cho avatar Thầy Giáo Live (#teacherAvatarSvg)
   * - Khi ZeroTTS phát file WAV: đọc trực tiếp biên độ & phổ âm thanh qua Web Audio AnalyserNode (60fps)
   *   để đóng/mở 5 khẩu hình miệng (closed / small / medium / wide / round) khớp với từng âm tiết thật.
   * - Khi dùng Web Speech API dự phòng: mô phỏng nhịp âm tiết tiếng Việt tự nhiên.
   */
  class TeacherLipSyncAnimator {
    constructor(svgEl) {
      this.svgEl = svgEl;
      this.mode = 'idle'; // 'idle' | 'audio' | 'synthetic'
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
      if (!this.svgEl) return;
      if (viseme !== this.lastViseme) {
        this.svgEl.setAttribute('data-mouth', viseme);
        this.lastViseme = viseme;
      }
      const clampedAmp = Math.max(0, Math.min(1, amp));
      const tiltDeg = clampedAmp > 0.08 ? Math.sin(nowMs * 0.0055) * (1.8 * clampedAmp + 0.6) : 0;
      const browPx = clampedAmp > 0.45 ? -((clampedAmp - 0.45) * 4.5) : 0;

      this.svgEl.style.setProperty('--talk-amp', clampedAmp.toFixed(3));
      this.svgEl.style.setProperty('--talk-tilt', `${tiltDeg.toFixed(2)}deg`);
      this.svgEl.style.setProperty('--brow-lift', `${browPx.toFixed(2)}px`);
    }

    computeAudioLevel() {
      if (!this.analyser || !this.timeData || !this.freqData) return null;
      this.analyser.getByteTimeDomainData(this.timeData);
      let sumSq = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const norm = (this.timeData[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / this.timeData.length);

      // Phân biệt năng lượng trầm (môi tròn O/U) với năng lượng sáng (mở rộng A/E)
      this.analyser.getByteFrequencyData(this.freqData);
      let lowEnergy = 0;
      let highEnergy = 0;
      const splitBin = Math.min(14, Math.floor(this.freqData.length * 0.16));
      for (let i = 1; i < splitBin; i++) lowEnergy += this.freqData[i];
      for (let i = splitBin; i < Math.min(48, this.freqData.length); i++) highEnergy += this.freqData[i];
      const isRoundVowel = lowEnergy > highEnergy * 1.45 && rms > 0.08;

      return { rms, isRoundVowel };
    }

    tick(nowMs) {
      if (this.mode === 'idle') {
        this.stop();
        return;
      }

      let rawAmp = 0;
      let isRound = false;

      if (this.mode === 'audio' && this.analyser) {
        const res = this.computeAudioLevel();
        if (res) {
          rawAmp = Math.min(1, res.rms * 4.4);
          isRound = res.isRoundVowel;
        }
      } else {
        // Nhịp âm tiết tự nhiên cho Web Speech API dự phòng
        const syllableWave = Math.abs(Math.sin(nowMs * 0.022));
        const cadence = Math.sin(nowMs * 0.0067) * 0.5 + 0.5;
        const microPause = Math.sin(nowMs * 0.0029) > -0.76 ? 1 : 0.05;
        rawAmp = syllableWave * (0.35 + 0.65 * cadence) * microPause;
        isRound = Math.sin(nowMs * 0.011) > 0.55;
      }

      this.smoothedAmp = this.smoothedAmp * 0.45 + rawAmp * 0.55;

      // Chống nháy quá nhanh (< 45ms) giúp chuyển khẩu hình mượt mà
      let targetViseme = this.lastViseme;
      if (nowMs - this.lastSwitchTs >= 45 || this.smoothedAmp < 0.07) {
        if (this.smoothedAmp < 0.07) {
          targetViseme = 'closed';
        } else if (this.smoothedAmp < 0.22) {
          targetViseme = 'small';
        } else if (isRound && this.smoothedAmp < 0.62) {
          targetViseme = 'round';
        } else if (this.smoothedAmp < 0.54) {
          targetViseme = 'medium';
        } else {
          targetViseme = isRound ? 'round' : 'wide';
        }
        if (targetViseme !== this.lastViseme) {
          this.lastSwitchTs = nowMs;
        }
      }

      this.applyVisual(targetViseme, this.smoothedAmp, nowMs);
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  /**
   * Trình đọc MC AI theo đường ống (Pipelined ZeroTTS + Web Speech API fallback)
   * - Đọc tuần tự từng đoạn câu hỏi / đáp án A-B-C-D
   * - Tự động tải trước đoạn tiếp theo trong khi đang phát đoạn hiện tại (giảm tối đa độ trễ)
   * - Kết nối Web Audio AnalyserNode để nhép miệng avatar Thầy Giáo Live theo sóng âm thực tế
   */
  class GplxMcSpeaker {
    constructor(callbacks = {}) {
      this.onSpeakingChange = callbacks.onSpeakingChange || (() => {});
      this.onLipSyncMode = callbacks.onLipSyncMode || (() => {});
      this.onAnalyserReady = callbacks.onAnalyserReady || (() => {});
      this.onAutoplayBlocked = callbacks.onAutoplayBlocked || (() => {});
      this.onLog = callbacks.onLog || (() => {});
      this.isObsMode = Boolean(callbacks.isObsMode);

      const savedEnabled = localStorage.getItem('gplx_mc_enabled');
      const savedVoice = localStorage.getItem('gplx_mc_voice');
      const savedVol = parseFloat(localStorage.getItem('gplx_mc_volume'));

      this.enabled = savedEnabled === null ? true : savedEnabled === 'true';
      this.voice = savedVoice || 'quangminh';
      this.volume = Number.isFinite(savedVol) ? Math.max(0, Math.min(1, savedVol)) : 0.95;
      // Chế độ OBS (?obs=1) không bao giờ tự tắt tiếng cục bộ
      this.localMuted = this.isObsMode ? false : localStorage.getItem('gplx_local_muted') === 'true';

      this.zeroTtsReady = false;
      this.sessionId = 0;
      this.isSpeaking = false;
      this.audioEl = null;
      this.audioCtx = null;
      this.mediaSource = null;
      this.gainNode = null;
      this.analyser = null;
      this.pendingSegments = null;
      this.pendingOptions = null;
      this.autoplayBlocked = false;
    }

    getEffectiveVolume() {
      return this.localMuted ? 0 : this.volume;
    }

    applyVolumeToNodes() {
      const effectiveVol = this.getEffectiveVolume();
      if (this.gainNode && this.audioCtx) {
        try {
          this.gainNode.gain.setValueAtTime(effectiveVol, this.audioCtx.currentTime);
        } catch (_) {
          this.gainNode.gain.value = effectiveVol;
        }
        // Khi đã nối qua GainNode, giữ audioEl.volume = 1 để AnalyserNode vẫn nhận đủ tín hiệu nhép miệng
        // và tránh bị nhân đôi suy hao âm lượng (Chrome) hoặc bỏ qua audioEl.volume (Safari/WebKit)
        if (this.audioEl) {
          this.audioEl.volume = 1;
        }
      } else if (this.audioEl) {
        this.audioEl.volume = effectiveVol;
      }
    }

    resumeAudioContext() {
      try {
        if (!this.audioCtx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      } catch (_) {}
    }

    ensureAudioPipeline() {
      if (!this.audioEl) {
        this.audioEl = new Audio();
        this.audioEl.preload = 'auto';
        this.audioEl.crossOrigin = 'anonymous';
        this.audioEl.volume = this.getEffectiveVolume();
      }

      this.resumeAudioContext();

      // Chỉ gắn MediaElementAudioSourceNode khi AudioContext đã mở ('running')
      // Nối chuỗi: mediaSource -> analyser (nhép miệng) -> gainNode (chỉnh âm lượng chuẩn Safari & Chrome) -> destination
      if (!this.mediaSource && this.audioCtx && this.audioCtx.state === 'running') {
        try {
          this.mediaSource = this.audioCtx.createMediaElementSource(this.audioEl);
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 256;
          this.analyser.smoothingTimeConstant = 0.45;
          this.gainNode = this.audioCtx.createGain();
          this.gainNode.gain.value = this.getEffectiveVolume();

          this.mediaSource.connect(this.analyser);
          this.analyser.connect(this.gainNode);
          this.gainNode.connect(this.audioCtx.destination);
          this.audioEl.volume = 1;
          this.onAnalyserReady(this.analyser);
        } catch (err) {
          console.warn('[MC LipSync Analyser Fallback]', err?.message || err);
        }
      }

      this.applyVolumeToNodes();
      return this.audioEl;
    }

    setZeroTtsReady(ready) {
      this.zeroTtsReady = !!ready;
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
      try {
        localStorage.setItem('gplx_mc_enabled', String(this.enabled));
      } catch (_) {}
      if (!this.enabled) {
        this.stop();
      }
    }

    setVoice(voice) {
      if (!voice) return false;
      const nextVoice = String(voice).toLowerCase().trim();
      const changed = nextVoice !== this.voice;
      this.voice = nextVoice;
      try {
        localStorage.setItem('gplx_mc_voice', this.voice);
      } catch (_) {}
      return changed;
    }

    setVolume(vol) {
      const v = Math.max(0, Math.min(1, Number(vol)));
      if (!Number.isFinite(v)) return;
      this.volume = v;
      try {
        localStorage.setItem('gplx_mc_volume', String(v));
      } catch (_) {}
      this.applyVolumeToNodes();
    }

    setLocalMuted(muted) {
      this.localMuted = this.isObsMode ? false : Boolean(muted);
      if (!this.isObsMode) {
        try {
          localStorage.setItem('gplx_local_muted', String(this.localMuted));
        } catch (_) {}
      }
      this.applyVolumeToNodes();
    }

    stop() {
      this.sessionId++;
      this.pendingSegments = null;
      this.pendingOptions = null;
      this.onLipSyncMode('idle');
      if (this.audioEl) {
        try {
          this.audioEl.onended = null;
          this.audioEl.onerror = null;
          this.audioEl.pause();
          this.audioEl.currentTime = 0;
        } catch (_) {}
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
      }
      if (this.isSpeaking) {
        this.isSpeaking = false;
        this.onSpeakingChange(false, '');
      }
    }

    unlockAndResume() {
      this.autoplayBlocked = false;
      this.onAutoplayBlocked(false);
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (this.pendingSegments && this.pendingSegments.length && this.enabled) {
        const segs = this.pendingSegments;
        const opts = this.pendingOptions || {};
        this.pendingSegments = null;
        this.pendingOptions = null;
        this.speakSegments(segs, { ...opts, force: true });
      }
    }

    async fetchTts(text, voiceOverride) {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: voiceOverride || this.voice })
        });
        const data = await res.json();
        if (data && data.ok && data.url) {
          return { ok: true, url: data.url };
        }
        return { ok: false, error: data?.error || 'ZeroTTS unavailable' };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    playAudioFile(url, mySessionId) {
      return new Promise((resolve) => {
        if (mySessionId !== this.sessionId) {
          resolve({ status: 'cancelled' });
          return;
        }
        const audio = this.ensureAudioPipeline();
        this.applyVolumeToNodes();
        audio.onended = null;
        audio.onerror = null;

        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(guardTimer);
          audio.onended = null;
          audio.onerror = null;
          this.onLipSyncMode('idle');
          resolve(result);
        };

        const guardTimer = setTimeout(() => finish({ status: 'timeout' }), 24000);
        audio.onended = () => finish({ status: 'ended' });
        audio.onerror = () => finish({ status: 'error' });

        audio.src = url;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              if (!settled && mySessionId === this.sessionId) {
                this.onLipSyncMode(this.analyser ? 'audio' : 'synthetic');
              }
            })
            .catch((err) => {
              if (err && err.name === 'NotAllowedError') {
                finish({ status: 'blocked' });
              } else {
                finish({ status: 'error' });
              }
            });
        } else {
          this.onLipSyncMode(this.analyser ? 'audio' : 'synthetic');
        }
      });
    }

    playWebSpeech(text, mySessionId) {
      return new Promise((resolve) => {
        if (mySessionId !== this.sessionId || !('speechSynthesis' in window)) {
          resolve({ status: 'skipped' });
          return;
        }
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'vi-VN';
          u.rate = 1.06;
          u.volume = this.getEffectiveVolume();

          const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
          const viVoice = voices.find(v => (v.lang || '').toLowerCase().startsWith('vi'));
          if (viVoice) u.voice = viVoice;

          let settled = false;
          const finish = (status) => {
            if (settled) return;
            settled = true;
            clearTimeout(guard);
            this.onLipSyncMode('idle');
            resolve({ status });
          };

          const guard = setTimeout(() => finish('timeout'), 18000);
          u.onstart = () => {
            if (!settled && mySessionId === this.sessionId) {
              this.onLipSyncMode('synthetic');
            }
          };
          u.onend = () => finish('ended');
          u.onerror = () => finish('error');
          this.onLipSyncMode('synthetic');
          window.speechSynthesis.speak(u);
        } catch (_) {
          this.onLipSyncMode('idle');
          resolve({ status: 'error' });
        }
      });
    }

    async speakSegments(segments, options = {}) {
      const onStart = typeof options.onStart === 'function' ? options.onStart : null;
      const onDone = typeof options.onDone === 'function' ? options.onDone : null;
      const activeVoice = options.voice || this.voice;

      const cleanSegs = (Array.isArray(segments) ? segments : [segments])
        .map(s => String(s || '').trim())
        .filter(Boolean);

      if (!cleanSegs.length) {
        if (onDone) onDone('empty');
        return 'empty';
      }
      if (!this.enabled && !options.force) {
        if (onDone) onDone('disabled');
        return 'disabled';
      }

      this.stop();
      const mySession = this.sessionId;
      this.isSpeaking = true;
      if (onStart) onStart();

      // Cửa sổ tải trước (prefetch 2 đoạn liên tiếp) giúp MC đọc nối mạch mượt mà
      const prefetches = new Map();
      const schedulePrefetch = (idx) => {
        if (idx >= cleanSegs.length || prefetches.has(idx)) return;
        prefetches.set(idx, this.fetchTts(cleanSegs[idx], activeVoice));
      };

      schedulePrefetch(0);
      schedulePrefetch(1);

      for (let i = 0; i < cleanSegs.length; i++) {
        if (mySession !== this.sessionId) {
          if (onDone) onDone('cancelled');
          return 'cancelled';
        }

        const text = cleanSegs[i];
        this.onSpeakingChange(true, text);
        schedulePrefetch(i + 1);
        schedulePrefetch(i + 2);

        const ttsRes = await prefetches.get(i);
        if (mySession !== this.sessionId) {
          if (onDone) onDone('cancelled');
          return 'cancelled';
        }

        if (ttsRes && ttsRes.ok && ttsRes.url) {
          const playRes = await this.playAudioFile(ttsRes.url, mySession);
          if (playRes.status === 'blocked') {
            this.autoplayBlocked = true;
            this.pendingSegments = cleanSegs.slice(i);
            this.pendingOptions = options;
            this.onAutoplayBlocked(true);
            this.isSpeaking = false;
            this.onSpeakingChange(false, '🔇 Bấm nút "Bật giọng đọc MC AI" để nghe MC đọc và đếm giờ!');
            if (onDone) onDone('blocked');
            return 'blocked';
          }
          if (playRes.status === 'error') {
            await this.playWebSpeech(text, mySession);
          }
        } else {
          // Dự phòng khi ZeroTTS đang khởi động
          await this.playWebSpeech(text, mySession);
        }
      }

      if (mySession === this.sessionId) {
        this.isSpeaking = false;
        this.onSpeakingChange(false, '');
        if (onDone) onDone('completed');
        return 'completed';
      }
      if (onDone) onDone('cancelled');
      return 'cancelled';
    }
  }

  class GplxClient {
    constructor() {
      this.ws = null;
      this.state = null;
      this.timerRemaining = 15;
      this.timerMax = 15;
      this.lastSpokenQuestionRoundId = null;
      this.lastSpokenRevealRoundId = null;
      this.lastTickSec = null;
      this.giftToastTimer = null;

      this.settings = {
        timerSeconds: 15,
        mcAutoRead: true,
        waitMcBeforeTimer: true,
        autoNextQuestion: true,
        mcVoice: 'quangminh',
        mcVolume: 0.95,
        sfxEnabled: true,
        sfxVolume: 0.8
      };

      // Hỗ trợ chế độ OBS Browser Source sạch (?obs=1)
      const urlParams = new URLSearchParams(window.location.search);
      this.isObsMode = urlParams.get('obs') === '1' || urlParams.get('obs') === 'true';
      if (this.isObsMode) {
        document.body.classList.add('obs-mode');
      }

      this.audio = null;
      this.lipSync = new TeacherLipSyncAnimator(document.getElementById('teacherAvatarSvg'));
      this.mc = new GplxMcSpeaker({
        isObsMode: this.isObsMode,
        onSpeakingChange: (speaking, caption) => this.updateMcVisual(speaking, caption),
        onLipSyncMode: (mode) => this.lipSync.setMode(mode),
        onAnalyserReady: (analyser) => this.lipSync.attachAnalyser(analyser),
        onAutoplayBlocked: (blocked) => this.toggleAudioUnlockButton(blocked),
        onLog: (msg) => this.logDockEvent(msg)
      });

      this.initEventListeners();
      this.initResizeScaling();
      this.syncAllDockControls();
      this.initWebSocket();
    }

    ensureAudioCtx() {
      if (!this.audio) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audio = new AudioCtx();
      }
      if (this.audio && this.audio.state === 'suspended') {
        this.audio.resume().catch(() => {});
      }
      return this.audio;
    }

    initWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[GPLX WS] Connected');
        this.updateConnectionStatus(true);
        this.sendRpc('gplx.getState', {});
        this.sendRpc('tts.status', {});
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.method === 'gplx.state') {
            this.onStateUpdate(msg.params);
          } else if (msg.method === 'gplx.settingsUpdated') {
            this.applySyncedSettings(msg.params);
          } else if (msg.method === 'gplx.mcCommand') {
            this.handleMcCommand(msg.params);
          } else if (msg.method === 'gplx.questionStarted') {
            this.onQuestionStarted(msg.params);
          } else if (msg.method === 'gplx.countdownStarted') {
            this.onCountdownStarted(msg.params);
          } else if (msg.method === 'gplx.answerRevealed') {
            this.onAnswerRevealed(msg.params);
          } else if (msg.method === 'gplx.answerResult') {
            this.onAnswerReceived(msg.params);
          } else if (msg.method === 'gplx.giftAlert') {
            this.onGiftAlert(msg.params);
          } else if (msg.method === 'gplx.chat') {
            if (msg.params?.comment) {
              this.logDockEvent(`💭 [TikTok] ${msg.params.user || 'Khán giả'}: ${msg.params.comment}`);
            }
          } else if (msg.method === 'gplx.tiktokStatus') {
            this.renderTikTokStatus(msg.params);
          } else if (msg.method === 'tts.status') {
            this.renderTtsStatus(msg.params);
          } else if (msg.error) {
            this.logDockEvent(`⚠️ Lỗi RPC: ${msg.error.message || 'Không xác định'}`);
          } else if (msg.result) {
            this.handleRpcResult(msg.result);
          }
        } catch (err) {
          console.error('[GPLX WS Message Error]', err);
        }
      };

      this.ws.onclose = () => {
        console.warn('[GPLX WS] Disconnected. Reconnecting in 3s...');
        this.updateConnectionStatus(false);
        setTimeout(() => this.initWebSocket(), 3000);
      };
    }

    handleRpcResult(res, { fromHttpFallback = false } = {}) {
      if (!res || typeof res !== 'object') return;
      if (res.ok === false && res.error) {
        this.logDockEvent(`⚠️ ${res.error}`);
        return;
      }
      if (res.closed) {
        this.logDockEvent('⏳ Câu hỏi đã hết giờ, hãy bấm "Câu Tiếp" hoặc "Đọc & Đếm Lại" để bình chọn!');
        return;
      }
      if (res.duplicate) {
        this.logDockEvent(`ℹ️ ${res.user || 'Học viên'} đã trả lời câu này rồi!`);
        return;
      }
      if (res.settings) {
        this.applySyncedSettings(res.settings);
      }
      if (res.question) {
        this.onStateUpdate(res);
      } else if (res.model && res.status !== undefined) {
        this.renderTtsStatus(res);
      } else if (res.connected !== undefined && res.username !== undefined) {
        this.renderTikTokStatus(res);
      } else if (fromHttpFallback && res.action && res.segments) {
        this.handleMcCommand(res);
      }
    }

    async sendRpc(method, params = {}) {
      const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      };
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(payload));
        return null;
      }
      try {
        const res = await fetch('/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data?.error) {
          this.logDockEvent(`⚠️ Lỗi RPC: ${data.error.message || 'Không xác định'}`);
        } else if (data?.result) {
          this.handleRpcResult(data.result, { fromHttpFallback: true });
        }
        return data;
      } catch (err) {
        this.logDockEvent(`⚠️ Không gọi được server: ${err.message}`);
        return null;
      }
    }

    applySyncedSettings(rawSettings) {
      if (!rawSettings || typeof rawSettings !== 'object') return;
      const prevVoice = this.settings.mcVoice;
      const wasSpeaking = this.mc.isSpeaking;
      this.settings = { ...this.settings, ...rawSettings };
      this.timerMax = Number(this.settings.timerSeconds) || 15;

      this.mc.setVoice(this.settings.mcVoice);
      this.mc.setVolume(this.settings.mcVolume);
      this.mc.setEnabled(this.settings.mcAutoRead);

      this.syncAllDockControls();

      // Nếu người dùng đổi giọng MC ngay lúc MC đang đọc dở -> chuyển sang giọng mới ngay lập tức
      if (prevVoice && prevVoice !== this.settings.mcVoice && wasSpeaking && this.state?.speechScripts) {
        const isRev = Boolean(this.state.isRevealed);
        const segs = isRev ? this.state.speechScripts.answer : this.state.speechScripts.question;
        if (Array.isArray(segs) && segs.length) {
          const roundId = this.state.roundId;
          const isWaiting = !isRev && this.state.phase === 'reading';
          this.mc.speakSegments(segs, {
            force: true,
            voice: this.settings.mcVoice,
            onDone: (status) => {
              if (isWaiting && status === 'completed') {
                this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: 'completed' });
              }
            }
          });
        }
      }

      if (!this.mc.isSpeaking) {
        this.updateMcVisual(false, '');
      }
    }

    handleMcCommand(cmd) {
      if (!cmd || !cmd.action) return;
      if (cmd.voice) {
        this.mc.setVoice(cmd.voice);
      }
      const voice = cmd.voice || this.settings.mcVoice;

      if (cmd.action === 'stop') {
        this.mc.stop();
        this.logDockEvent('⏹️ Đã dừng giọng đọc MC.');
        return;
      }

      if (cmd.action === 'testVoice') {
        const segs = Array.isArray(cmd.segments) && cmd.segments.length
          ? cmd.segments
          : ['Xin chào quý học viên! Tôi là MC Đấu Trường Giấy Phép Lái Xe, giọng đọc đã sẵn sàng!'];
        this.logDockEvent(`📢 Đang phát thử giọng MC (${voice})...`);
        this.mc.speakSegments(segs, { force: true, voice });
        return;
      }

      if (cmd.action === 'readAnswer') {
        const segs = Array.isArray(cmd.segments) && cmd.segments.length
          ? cmd.segments
          : this.state?.speechScripts?.answer;
        if (Array.isArray(segs) && segs.length) {
          this.logDockEvent(`📣 MC đang đọc đáp án Câu ${cmd.questionNumber || this.state?.question?.questionNumber || ''}...`);
          this.mc.speakSegments(segs, { force: true, voice });
        }
        return;
      }

      if (cmd.action === 'readQuestion') {
        const segs = Array.isArray(cmd.segments) && cmd.segments.length
          ? cmd.segments
          : this.state?.speechScripts?.question;
        if (Array.isArray(segs) && segs.length) {
          this.logDockEvent(`🔊 MC đang đọc lại Câu ${cmd.questionNumber || this.state?.question?.questionNumber || ''}...`);
          const roundId = cmd.roundId || this.state?.roundId;
          const isWaiting = this.state?.phase === 'reading';
          this.mc.speakSegments(segs, {
            force: true,
            voice,
            onStart: () => {
              if (isWaiting) this.sendRpc('gplx.mcReadingStarted', { roundId });
            },
            onDone: (status) => {
              if (isWaiting && status === 'completed') {
                this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: 'completed' });
              }
            }
          });
        }
      }
    }

    updateConnectionStatus(connected) {
      const dot = document.getElementById('livePulseDot');
      if (dot) {
        dot.style.background = connected ? '#ffffff' : '#94a3b8';
      }
    }

    updateMcVisual(speaking, caption) {
      const hostFrame = document.getElementById('mcHostFrame');
      const speakingBadge = document.getElementById('mcSpeakingBadge');
      const subtitlePill = document.getElementById('mcSubtitlePill');
      const subtitleText = document.getElementById('mcSubtitleText');

      if (hostFrame) hostFrame.classList.toggle('is-speaking', speaking);
      if (speakingBadge) speakingBadge.hidden = !speaking;
      if (subtitlePill) subtitlePill.classList.toggle('is-speaking', speaking);
      if (subtitleText) {
        if (caption) {
          subtitleText.textContent = speaking ? `🎙️ MC: ${caption}` : caption;
        } else {
          subtitleText.textContent = this.mc.enabled
            ? '🎙️ MC AI sẵn sàng đọc câu hỏi & đáp án...'
            : '🔇 MC tự động đọc đang TẮT';
        }
      }
    }

    toggleAudioUnlockButton(show) {
      const btn = document.getElementById('btnUnlockAudio');
      if (btn) {
        btn.hidden = !show || this.isObsMode;
      }
    }

    renderTtsStatus(status) {
      if (!status) return;
      const badge = document.getElementById('dockTtsStatus');
      const ready = Boolean(status.ready || status.status === 'ready');
      this.mc.setZeroTtsReady(ready);
      if (badge) {
        badge.classList.toggle('is-ready', ready);
        badge.textContent = ready
          ? '🟢 ZeroTTS Sẵn Sàng'
          : `🟡 ${status.status === 'loading' ? 'Đang nạp ZeroTTS...' : (status.status || 'Dự phòng WebSpeech')}`;
      }
    }

    renderTikTokStatus(tt) {
      if (!tt) return;
      const statusEl = document.getElementById('dockTikTokStatus');
      const liveBadgeLabel = document.getElementById('liveBadgeLabel');
      const btnConnect = document.getElementById('btnConnectTikTok');

      // Không khóa nút Kết Nối khi server đang tự thử lại kênh cũ — cho phép người dùng đổi kênh ngay lập tức
      if (btnConnect) {
        btnConnect.disabled = false;
        btnConnect.textContent = tt.connecting ? 'Đổi Kênh' : 'Kết Nối';
      }

      if (statusEl) {
        if (tt.connected) {
          statusEl.textContent = `🟢 LIVE @${tt.username} • ${tt.viewerCount || 0} mắt xem`;
          statusEl.style.color = '#86efac';
        } else if (tt.connecting) {
          statusEl.textContent = `🟡 Đang kết nối @${tt.username}...`;
          statusEl.style.color = '#fde047';
        } else if (tt.lastError) {
          statusEl.textContent = `🔴 Chưa kết nối (@${tt.username || ''}): ${tt.lastError}`;
          statusEl.style.color = '#fca5a5';
        } else {
          statusEl.textContent = '⚪ Chưa kết nối phòng TikTok Live';
          statusEl.style.color = '#94a3b8';
        }
      }

      if (liveBadgeLabel) {
        liveBadgeLabel.textContent = tt.connected
          ? `LIVE @${tt.username} • ${tt.viewerCount || 0} MẮT`
          : tt.connecting
          ? `ĐANG KẾT NỐI @${tt.username}...`
          : 'LIVE STREAM • ĐANG THI ĐẤU';
      }
    }

    startQuestionSpeech(roundId, questionNumber, segments) {
      const isWaitingPhase = this.state?.phase === 'reading';
      if (!Array.isArray(segments) || !segments.length) {
        if (isWaitingPhase) {
          this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: 'empty' });
        }
        return;
      }

      if (!this.mc.enabled) {
        // Nếu host đang tắt MC tự đọc -> bắt đầu đếm ngược ngay lập tức
        if (isWaitingPhase) {
          this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: 'mc_disabled' });
        }
        return;
      }

      const sec = this.settings.timerSeconds || this.timerMax || 15;
      const waitNote = this.settings.waitMcBeforeTimer
        ? `hết câu mới đếm ${sec}s`
        : `đếm song song ${sec}s`;
      this.logDockEvent(`🎙️ MC đang đọc Câu ${questionNumber} (${waitNote})...`);
      this.mc.speakSegments(segments, {
        voice: this.settings.mcVoice,
        onStart: () => {
          if (this.state?.phase === 'reading') {
            this.sendRpc('gplx.mcReadingStarted', { roundId });
          }
        },
        onDone: (status) => {
          if (
            this.state?.phase === 'reading' &&
            (status === 'completed' || status === 'disabled' || status === 'empty')
          ) {
            this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: status });
          }
        }
      });
    }

    startAnswerSpeech(roundId, questionNumber, correctKey, segments) {
      if (!this.mc.enabled || !Array.isArray(segments) || !segments.length) return;
      this.logDockEvent(`📣 MC công bố đáp án đúng Câu ${questionNumber}: [${correctKey}]`);
      this.mc.speakSegments(segments, {
        voice: this.settings.mcVoice,
        onDone: (status) => {
          if (status === 'completed') {
            this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'answer', reason: 'completed' });
          }
        }
      });
    }

    onQuestionStarted(data) {
      if (!data) return;
      if (this.lastSpokenQuestionRoundId === data.roundId) return;
      this.lastSpokenQuestionRoundId = data.roundId;
      this.lastTickSec = null;
      this.startQuestionSpeech(data.roundId, data.questionNumber, data.segments);
    }

    onCountdownStarted(data) {
      if (!data) return;
      this.lastTickSec = null;
      this.playCountdownStartChime();
      const sec = data.timerMax || this.settings.timerSeconds || 15;
      this.logDockEvent(`⏱️ Bắt đầu đếm ngược ${sec} giây!`);
    }

    onAnswerRevealed(data) {
      if (!data) return;
      this.playRevealChime();

      if (this.lastSpokenRevealRoundId === data.roundId) return;
      this.lastSpokenRevealRoundId = data.roundId;
      this.startAnswerSpeech(data.roundId, data.questionNumber, data.correctKey, data.segments);
    }

    onStateUpdate(state) {
      if (!state) return;
      const prevRoundId = this.state?.roundId;
      const prevRevealed = this.state?.isRevealed;
      this.state = state;

      // Đồng bộ cài đặt từ server TRƯỚC khi bắt đầu đọc câu hỏi đầu tiên
      if (state.settings) {
        this.applySyncedSettings(state.settings);
      }

      // Render Question
      if (state.question) {
        const q = state.question;
        const totalQ = state.totalQuestionsCount || q.totalQuestions || 600;
        const counterEl = document.getElementById('questionCounterText');
        const qTextEl = document.getElementById('questionText');
        if (counterEl) counterEl.textContent = `CÂU HỎI: ${q.questionNumber || q.id} / ${totalQ}`;
        if (qTextEl) qTextEl.textContent = `Câu ${q.questionNumber || q.id}: ${q.question}`;

        const fatalBadge = document.getElementById('fatalBadge');
        if (fatalBadge) {
          if (q.isFatal) {
            fatalBadge.style.display = 'flex';
            fatalBadge.textContent = q.fatalLabel || '⚠️ Điểm liệt! (Câu hỏi quan trọng)';
          } else {
            fatalBadge.style.display = 'none';
          }
        }

        // Render Real Exam Image or Sa-hình
        const diagramWrapper = document.querySelector('.question-diagram-wrapper');
        const saHinhImg = document.getElementById('saHinhImage');
        if (diagramWrapper && saHinhImg) {
          if (q.image) {
            diagramWrapper.style.display = 'flex';
            if (saHinhImg.getAttribute('src') !== q.image) {
              saHinhImg.src = q.image;
            }
            saHinhImg.style.objectFit = 'contain';
            saHinhImg.style.display = 'block';
          } else {
            diagramWrapper.style.display = 'none';
          }
        }

        // Render Dynamic Answer Options (A, B, C, D)
        const allKeys = ['a', 'b', 'c', 'd'];
        const optMap = {};
        if (Array.isArray(q.options)) {
          q.options.forEach(opt => {
            optMap[String(opt.key).toLowerCase()] = opt;
          });
        }

        const votes = state.votes || {};
        const totalVotes = Object.values(votes).reduce((acc, n) => acc + Number(n || 0), 0);

        allKeys.forEach(k => {
          const btn = document.getElementById(`optBtn_${k}`);
          if (!btn) return;
          const opt = optMap[k];
          if (opt) {
            btn.style.display = 'flex';
            const mainLbl = btn.querySelector('.opt-main-label');
            const subDesc = btn.querySelector('.opt-sub-desc');
            const textStr = String(opt.text || '');
            if (mainLbl) mainLbl.textContent = textStr;
            if (subDesc) subDesc.textContent = '';

            btn.classList.toggle('is-long-text', textStr.length > 65 && textStr.length <= 130);
            btn.classList.toggle('is-very-long-text', textStr.length > 130);

            const upperK = k.toUpperCase();
            const isCorrect = state.isRevealed && state.highlightedKey === upperK;
            const isDimmed = state.isRevealed && state.highlightedKey && state.highlightedKey !== upperK;
            btn.classList.toggle('is-correct', isCorrect);
            btn.classList.toggle('is-highlighted', isCorrect);
            btn.classList.toggle('is-dimmed', isDimmed);

            const bar = document.getElementById(`optVoteBar_${k}`);
            if (bar) {
              const count = Number(votes[upperK] || 0);
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              bar.style.width = `${pct}%`;
            }
          } else {
            btn.style.display = 'none';
          }
        });

        // Đồng bộ trạng thái nút giả lập Vote A/B/C/D theo số đáp án thực tế của câu hiện tại
        allKeys.forEach((k) => {
          const simBtn = document.getElementById(`btnSim${k.toUpperCase()}`);
          if (simBtn) {
            const exists = Boolean(optMap[k]);
            simBtn.disabled = !exists;
            simBtn.title = exists
              ? `Giả lập học viên bình luận ${k.toUpperCase()}`
              : `Câu hỏi này không có đáp án ${k.toUpperCase()}`;
          }
        });

        // Cập nhật banner kêu gọi bình luận theo trạng thái MC đọc / Đếm ngược / Công bố
        const banner = document.getElementById('commentActionBanner');
        if (banner && Array.isArray(q.options)) {
          const keys = q.options.map(o => o.key).join(', ');
          if (state.isRevealed || state.phase === 'revealed') {
            banner.textContent = `✅ ĐÁP ÁN CHÍNH XÁC: [${q.correctKey}] • CHUẨN BỊ CÂU TIẾP THEO!`;
          } else if (state.phase === 'reading' || state.waitingForMc) {
            banner.textContent = `🎙️ MC ĐANG ĐỌC CÂU HỎI • LẮNG NGHE VÀ CHUẨN BỊ BÌNH LUẬN ${keys}!`;
          } else {
            banner.textContent = `💬 BÌNH LUẬN ${keys} ĐỂ TRẢ LỜI TRONG ${state.timerMax || 15} GIÂY!`;
          }
        }
      }

      // Global x2 badge & trạng thái nút điều khiển
      const isGlobalX2 = (state.multiplier || 1) >= 2;
      const globalX2Badge = document.getElementById('globalX2Badge');
      if (globalX2Badge) {
        globalX2Badge.hidden = !isGlobalX2;
      }
      const btnTogglex2 = document.getElementById('btnTogglex2');
      if (btnTogglex2) {
        btnTogglex2.textContent = isGlobalX2 ? '⚡ x2 Toàn Phòng: ĐANG BẬT' : '⚡ x2 Toàn Phòng: TẮT';
        btnTogglex2.classList.toggle('gold', isGlobalX2);
      }
      const btnStartCountdownNow = document.getElementById('btnStartCountdownNow');
      if (btnStartCountdownNow) {
        btnStartCountdownNow.disabled = state.phase !== 'reading';
      }
      const btnRevealNow = document.getElementById('btnRevealNow');
      if (btnRevealNow) {
        btnRevealNow.disabled = Boolean(state.isRevealed);
      }

      // Update Votes text
      if (state.votes) {
        const parts = Object.entries(state.votes).map(([k, count]) => `${k} (${count} người)`);
        const voteEl = document.getElementById('voteDistribution');
        if (voteEl) voteEl.textContent = parts.join(' • ');
      }

      // Update Online Count (chỉ hiển thị số thật từ TikTok Live hoặc số học viên đã ghi điểm)
      const onlineEl = document.getElementById('onlineCountText');
      if (onlineEl) {
        const viewers = Number(state.tiktok?.viewerCount || state.onlineLearnersCount || 0);
        const rankedCount = Number(state.totalRankedPlayers ?? (Array.isArray(state.leaderboard) ? state.leaderboard.length : 0));
        if (state.tiktok?.connected && viewers > 0) {
          const formatted = viewers >= 1000 ? `${(viewers / 1000).toFixed(1)}K` : String(viewers);
          onlineEl.textContent = rankedCount > 0
            ? `👤 Đang xem trực tiếp: ${formatted} người • Đã ghi điểm: ${rankedCount} học viên`
            : `👤 Đang xem trực tiếp: ${formatted} người • Bình luận để lên bảng vàng!`;
        } else if (rankedCount > 0) {
          onlineEl.textContent = `👤 Đã có ${rankedCount} học viên ghi điểm trên bảng xếp hạng`;
        } else {
          onlineEl.textContent = '👤 Đang chờ học viên tham gia bình luận A, B, C, D...';
        }
      }

      // Update Stats
      if (state.stats) {
        const accEl = document.getElementById('accuracyStatsText');
        if (accEl) {
          accEl.textContent = `✓ Tỷ lệ đúng: ${state.stats.accuracyRate || 68}% • Thời gian trung bình: ${state.stats.avgSpeed || '1.2 giây'}`;
        }
      }

      // Update Leaderboard
      if (Array.isArray(state.leaderboard)) {
        this.renderLeaderboard(state.leaderboard);
      }

      // Update Active x2 Gift Boosters Strip
      this.renderActiveBoosters(state.activeBoosters || []);

      // Update TikTok Status
      if (state.tiktok) {
        this.renderTikTokStatus(state.tiktok);
      }

      // Update Timer (15s — chỉ đếm khi MC đọc xong)
      if (state.timerRemaining !== undefined) {
        this.timerRemaining = state.timerRemaining;
        this.timerMax = state.timerMax || 15;
        this.renderTimer();

        // Tiếng đếm ngược 5 giây cuối (chỉ khi đang trong pha countdown)
        if (
          state.phase === 'countdown' &&
          !state.isRevealed &&
          this.timerRemaining > 0 &&
          this.timerRemaining <= 5 &&
          this.lastTickSec !== this.timerRemaining
        ) {
          this.lastTickSec = this.timerRemaining;
          this.playBeep(760 + (5 - this.timerRemaining) * 60, 0.08);
        }
      }

      // Tự động đọc câu hỏi lần đầu ngay khi vừa mở màn hình (nếu đang chờ MC đọc hoặc đầu vòng mới)
      if (
        state.roundId &&
        prevRoundId !== state.roundId &&
        !state.isRevealed &&
        this.lastSpokenQuestionRoundId !== state.roundId &&
        state.speechScripts?.question?.length
      ) {
        this.lastSpokenQuestionRoundId = state.roundId;
        this.startQuestionSpeech(
          state.roundId,
          state.question?.questionNumber || state.question?.id,
          state.speechScripts.question
        );
      }

      // Trường hợp state nhảy sang isRevealed trước khi nhận event riêng
      if (
        state.roundId &&
        state.isRevealed &&
        !prevRevealed &&
        this.lastSpokenRevealRoundId !== state.roundId &&
        state.speechScripts?.answer?.length
      ) {
        this.lastSpokenRevealRoundId = state.roundId;
        this.startAnswerSpeech(
          state.roundId,
          state.question?.questionNumber || state.question?.id,
          state.question?.correctKey || '',
          state.speechScripts.answer
        );
      }
    }

    renderActiveBoosters(boosters) {
      const bar = document.getElementById('activeBoostersBar');
      if (!bar) return;

      if (!Array.isArray(boosters) || boosters.length === 0) {
        bar.hidden = true;
        bar.replaceChildren();
        return;
      }

      bar.hidden = false;
      const frag = document.createDocumentFragment();
      boosters.slice(0, 4).forEach((b) => {
        const pill = document.createElement('div');
        pill.className = `booster-pill${b.applied ? ' is-applied' : ''}`;

        const av = document.createElement('img');
        av.className = 'booster-pill-avatar';
        av.src = b.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(b.user)}`;
        av.alt = '';
        av.referrerPolicy = 'no-referrer';

        const name = document.createElement('span');
        name.textContent = b.user;

        const giftImg = document.createElement('img');
        giftImg.className = 'booster-pill-gift';
        giftImg.src = b.giftImage || b.fallbackImage || DEFAULT_GIFT_IMAGE;
        giftImg.alt = b.giftName || 'Quà TikTok';
        giftImg.referrerPolicy = 'no-referrer';
        giftImg.onerror = () => {
          giftImg.onerror = null;
          giftImg.src = b.fallbackImage || DEFAULT_GIFT_IMAGE;
        };

        const tag = document.createElement('span');
        tag.className = 'booster-pill-tag';
        tag.textContent = b.applied ? '✓ x2' : '⚡ x2';

        pill.append(av, name, giftImg, tag);
        frag.appendChild(pill);
      });
      bar.replaceChildren(frag);
    }

    setX2Badge(elId, rankObj) {
      const el = document.getElementById(elId);
      if (!el) return;
      if (!rankObj || !rankObj.lastBoosted) {
        el.hidden = true;
        el.replaceChildren();
        return;
      }
      el.hidden = false;
      el.replaceChildren();
      if (rankObj.lastGiftImage) {
        const img = document.createElement('img');
        img.src = rankObj.lastGiftImage;
        img.alt = rankObj.lastGiftName || 'Quà x2';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          img.onerror = null;
          img.src = DEFAULT_GIFT_IMAGE;
        };
        el.appendChild(img);
      }
      const txt = document.createElement('span');
      txt.textContent = 'x2';
      el.appendChild(txt);
    }

    getInitialChar(name) {
      const clean = String(name || '').replace(/^@+/, '').trim();
      return clean ? clean.charAt(0).toUpperCase() : '?';
    }

    setRealAvatar(imgId, initialId, avatarUrl, displayName, isEmptySlot = false) {
      const img = document.getElementById(imgId);
      const initEl = document.getElementById(initialId);
      if (!img || !initEl) return;

      const fallbackLetter = isEmptySlot ? '?' : this.getInitialChar(displayName);
      initEl.textContent = fallbackLetter;

      const cleanUrl = !isEmptySlot && avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('http')
        ? avatarUrl
        : '';

      if (!cleanUrl) {
        img.hidden = true;
        img.removeAttribute('src');
        initEl.hidden = false;
        return;
      }

      img.onerror = () => {
        img.onerror = null;
        img.hidden = true;
        initEl.hidden = false;
      };
      img.onload = () => {
        img.hidden = false;
        initEl.hidden = true;
      };
      if (img.getAttribute('src') !== cleanUrl) {
        img.src = cleanUrl;
      } else if (img.complete && img.naturalWidth > 0) {
        img.hidden = false;
        initEl.hidden = true;
      }
    }

    renderLeaderboard(ranks) {
      const list = Array.isArray(ranks) ? ranks : [];
      const emptyEl = document.getElementById('leaderboardEmptyState');
      const podiumRow = document.getElementById('leaderboardPodiumRow');
      const runnersRow = document.getElementById('leaderboardRunnersRow');

      if (list.length === 0) {
        if (emptyEl) emptyEl.hidden = false;
        if (podiumRow) podiumRow.hidden = true;
        if (runnersRow) runnersRow.hidden = true;
        return;
      }

      if (emptyEl) emptyEl.hidden = true;
      if (podiumRow) podiumRow.hidden = false;
      if (runnersRow) runnersRow.hidden = false;

      // Top 3 Podium (#1, #2, #3)
      for (let rankNum = 1; rankNum <= 3; rankNum++) {
        const entry = list[rankNum - 1];
        const card = document.getElementById(`podiumCard${rankNum}`);
        const nameEl = document.getElementById(`podiumUser${rankNum}`);
        const scoreEl = document.getElementById(`podiumScore${rankNum}`);
        const deltaEl = document.getElementById(`podiumDelta${rankNum}`);

        if (entry) {
          if (card) card.classList.remove('is-empty-slot');
          if (nameEl) nameEl.textContent = entry.user;
          if (scoreEl) scoreEl.textContent = `${entry.points}đ`;
          if (deltaEl) deltaEl.textContent = entry.delta || '';
          this.setRealAvatar(`podiumAvatar${rankNum}`, `podiumInitial${rankNum}`, entry.avatar, entry.user, false);
          this.setX2Badge(`podiumX2_${rankNum}`, entry);
        } else {
          if (card) card.classList.add('is-empty-slot');
          if (nameEl) nameEl.textContent = `Đang chờ #${rankNum}...`;
          if (scoreEl) scoreEl.textContent = '—';
          if (deltaEl) deltaEl.textContent = '';
          this.setRealAvatar(`podiumAvatar${rankNum}`, `podiumInitial${rankNum}`, '', '', true);
          this.setX2Badge(`podiumX2_${rankNum}`, null);
        }
      }

      // Runners #4 & #5
      for (let rankNum = 4; rankNum <= 5; rankNum++) {
        const entry = list[rankNum - 1];
        const card = document.getElementById(`runnerCard${rankNum}`);
        const nameEl = document.getElementById(`runnerUser${rankNum}`);
        const scoreEl = document.getElementById(`runnerScore${rankNum}`);

        if (entry) {
          if (card) card.classList.remove('is-empty-slot');
          if (nameEl) nameEl.textContent = entry.user;
          if (scoreEl) scoreEl.textContent = `${entry.points}đ • ${entry.delta || ''}`;
          this.setRealAvatar(`runnerAvatar${rankNum}`, `runnerInitial${rankNum}`, entry.avatar, entry.user, false);
          this.setX2Badge(`podiumX2_${rankNum}`, entry);
        } else {
          if (card) card.classList.add('is-empty-slot');
          if (nameEl) nameEl.textContent = `Đang chờ Top ${rankNum}...`;
          if (scoreEl) scoreEl.textContent = '—';
          this.setRealAvatar(`runnerAvatar${rankNum}`, `runnerInitial${rankNum}`, '', '', true);
          this.setX2Badge(`podiumX2_${rankNum}`, null);
        }
      }
    }

    renderTimer() {
      const container = document.getElementById('timerContainer');
      const secEl = document.getElementById('timerSeconds');
      const msEl = document.getElementById('timerMs');
      const circle = document.getElementById('timerCircleProgress');
      if (!secEl || !msEl || !circle) return;

      const isWaitingMc = this.state?.phase === 'reading' || !!this.state?.waitingForMc;
      const isRevealed = !!this.state?.isRevealed || this.state?.phase === 'revealed';
      if (container) {
        container.classList.toggle('is-waiting-mc', isWaitingMc);
      }

      const totalSeconds = Math.max(0, this.timerRemaining);
      const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const ss = String(totalSeconds % 60).padStart(2, '0');

      secEl.textContent = `${mm}:${ss}`;
      msEl.textContent = isRevealed ? 'ĐÁP ÁN' : isWaitingMc ? 'MC ĐỌC' : `${totalSeconds}s`;

      const circumference = 314.16;
      const progress = isWaitingMc
        ? 1
        : Math.max(0, Math.min(1, this.timerRemaining / Math.max(1, this.timerMax)));
      const offset = circumference * (1 - progress);
      circle.style.strokeDashoffset = offset;

      if (isRevealed) {
        circle.style.stroke = '#22c55e';
        secEl.style.textShadow = '0 0 16px rgba(34, 197, 94, 0.9)';
      } else if (isWaitingMc) {
        circle.style.stroke = '#00d2ff';
        secEl.style.textShadow = '0 0 14px rgba(0, 210, 255, 0.9)';
      } else if (this.timerRemaining <= 5) {
        circle.style.stroke = '#ef4444';
        secEl.style.textShadow = '0 0 16px rgba(239, 68, 68, 0.95)';
      } else if (this.timerRemaining <= 8) {
        circle.style.stroke = '#facc15';
        secEl.style.textShadow = '0 0 14px rgba(250, 204, 21, 0.9)';
      } else {
        circle.style.stroke = '#ff5722';
        secEl.style.textShadow = '0 0 12px rgba(255, 87, 34, 0.8)';
      }
    }

    playCountdownStartChime() {
      const notes = [659.25, 987.77];
      notes.forEach((f, idx) => {
        setTimeout(() => this.playBeep(f, 0.16), idx * 90);
      });
    }

    playBeep(freq = 600, duration = 0.1) {
      if (!this.settings.sfxEnabled || this.mc.localMuted) return;
      try {
        const ctx = this.ensureAudioCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const sfxVol = Math.max(0.05, Math.min(1, Number(this.settings.sfxVolume ?? 0.8)));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.14 * sfxVol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (_) {}
    }

    playRevealChime() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, idx) => {
        setTimeout(() => this.playBeep(f, 0.22), idx * 80);
      });
    }

    playGiftFanfare(coins = 1) {
      const notes = coins >= 30
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51]
        : [659.25, 880, 1174.66];
      notes.forEach((f, idx) => {
        setTimeout(() => this.playBeep(f, 0.18), idx * 70);
      });
    }

    showGiftToast(data) {
      const toast = document.getElementById('gplxGiftToast');
      if (!toast) return;

      const av = document.getElementById('giftToastAvatar');
      const title = document.getElementById('giftToastUser');
      const sub = document.getElementById('giftToastMessage');
      const img = document.getElementById('giftToastImg');
      const cnt = document.getElementById('giftToastCount');

      if (av) {
        av.src = data.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.user || 'vip')}`;
        av.onerror = () => {
          av.onerror = null;
          av.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.user || 'vip')}`;
        };
      }
      if (title) {
        const coinsText = data.coins > 0 ? ` (${data.coins} 🪙)` : '';
        title.textContent = `${data.user || 'Khán giả'} tặng ${data.giftName || 'Quà TikTok'}${coinsText}`;
      }
      if (sub) {
        sub.textContent = `⚡ ${data.message || 'Kích hoạt x2 điểm cho câu trả lời!'}`;
      }
      if (img) {
        const fallback = data.fallbackImage || DEFAULT_GIFT_IMAGE;
        img.src = data.giftImage || fallback;
        img.onerror = () => {
          img.onerror = null;
          img.src = fallback;
        };
      }
      if (cnt) {
        cnt.textContent = `x${data.repeatCount || 1}`;
      }

      toast.classList.add('is-visible');
      clearTimeout(this.giftToastTimer);
      this.giftToastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
      }, 4600);
    }

    onAnswerReceived(data) {
      if (!data) return;
      this.playBeep(data.isCorrect ? (data.boosted ? 1120 : 880) : 420, 0.12);
      const ptsInfo = data.isCorrect
        ? (data.boosted ? ` • ⚡ x${data.multiplier} (+${data.earnedPoints}đ)` : ` • +${data.earnedPoints}đ`)
        : ' • Chưa chính xác';
      this.logDockEvent(`💬 [${data.user}] chọn [${data.answer}] (${data.speed})${ptsInfo}`);
    }

    onGiftAlert(data) {
      if (!data) return;
      this.playGiftFanfare(data.coins || 1);
      this.showGiftToast(data);
      const extra = data.mode === 'retroactive'
        ? ` → Cộng bù x2 (+${data.bonusPoints}đ = ${data.totalPoints}đ)!`
        : data.mode === 'next_question'
        ? ' → Bảo lưu x2 sang câu tiếp theo!'
        : ' → Kích hoạt x2 điểm câu này!';
      this.logDockEvent(`🎁 [${data.user}] tặng ${data.giftName} (${data.coins || 1} xu)${extra}`);
    }

    logDockEvent(text) {
      const feed = document.getElementById('dockEventFeed');
      if (!feed) return;
      const item = document.createElement('div');
      const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
      item.textContent = `[${time}] ${text}`;
      item.style.padding = '4px 0';
      item.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
      feed.prepend(item);
      if (feed.children.length > 60) feed.removeChild(feed.lastChild);
    }

    syncAllDockControls() {
      const s = this.settings;
      const voiceSel = document.getElementById('selectMcVoice');
      const toggleMcBtn = document.getElementById('btnToggleMcAuto');
      const toggleSfxBtn = document.getElementById('btnToggleSfx');
      const toggleLocalMuteBtn = document.getElementById('btnToggleLocalMute');
      const volRange = document.getElementById('mcVolumeRange');
      const volVal = document.getElementById('mcVolumeValue');
      const timerInput = document.getElementById('inputTimerSeconds');
      const matchTitle = document.getElementById('matchSectionTitle');
      const btnRestartTimer = document.getElementById('btnRestartTimer');
      const btnToggleWaitMc = document.getElementById('btnToggleWaitMc');
      const btnToggleAutoNext = document.getElementById('btnToggleAutoNext');

      if (voiceSel && document.activeElement !== voiceSel) {
        voiceSel.value = s.mcVoice || this.mc.voice;
      }
      if (toggleMcBtn) {
        toggleMcBtn.textContent = s.mcAutoRead ? '🎙️ MC Tự Đọc: BẬT' : '🔇 MC Tự Đọc: TẮT';
        toggleMcBtn.classList.toggle('gold', !!s.mcAutoRead);
      }
      if (toggleSfxBtn) {
        toggleSfxBtn.textContent = s.sfxEnabled ? '🔔 Âm Hiệu Ứng: BẬT' : '🔕 Âm Hiệu Ứng: TẮT';
        toggleSfxBtn.classList.toggle('is-active', !!s.sfxEnabled);
      }
      if (toggleLocalMuteBtn) {
        toggleLocalMuteBtn.textContent = this.mc.localMuted ? '🔇 Loa Tab Này: TẮT' : '🔊 Loa Tab Này: BẬT';
        toggleLocalMuteBtn.classList.toggle('danger', !!this.mc.localMuted);
      }
      const pct = Math.round((Number.isFinite(Number(s.mcVolume)) ? Number(s.mcVolume) : this.mc.volume) * 100);
      if (volRange && document.activeElement !== volRange) {
        volRange.value = String(pct);
      }
      if (volVal) {
        volVal.textContent = `${pct}%`;
      }
      if (timerInput && document.activeElement !== timerInput) {
        timerInput.value = String(s.timerSeconds || 15);
      }
      if (matchTitle) {
        matchTitle.textContent = `⏱️ Trận Đấu & Cài Đặt (${s.timerSeconds || 15}s)`;
      }
      if (btnRestartTimer) {
        btnRestartTimer.textContent = `🔄 Đọc & Đếm Lại ${s.timerSeconds || 15}s`;
      }
      if (btnToggleWaitMc) {
        btnToggleWaitMc.textContent = s.waitMcBeforeTimer ? '🎙️ Chờ MC Xong: BẬT' : '⚡ Chờ MC Xong: TẮT';
        btnToggleWaitMc.classList.toggle('is-active', !!s.waitMcBeforeTimer);
      }
      if (btnToggleAutoNext) {
        btnToggleAutoNext.textContent = s.autoNextQuestion ? '⏭️ Tự Chuyển Câu: BẬT' : '⏸️ Tự Chuyển Câu: TẮT';
        btnToggleAutoNext.classList.toggle('is-active', !!s.autoNextQuestion);
      }
    }

    initEventListeners() {
      // Tự động mở khóa âm thanh trên lần tương tác đầu tiên của host
      const unlockOnce = () => {
        this.ensureAudioCtx();
        this.mc.resumeAudioContext();
        if (this.mc.autoplayBlocked) {
          this.mc.unlockAndResume();
        }
      };
      document.addEventListener('pointerdown', unlockOnce, { passive: true });

      const btnUnlockAudio = document.getElementById('btnUnlockAudio');
      if (btnUnlockAudio) {
        btnUnlockAudio.onclick = () => {
          this.ensureAudioCtx();
          this.mc.unlockAndResume();
          if (!this.mc.isSpeaking && this.state?.speechScripts?.question?.length) {
            this.mc.speakSegments(
              this.state.isRevealed ? this.state.speechScripts.answer : this.state.speechScripts.question,
              { force: true, voice: this.settings.mcVoice }
            );
          }
        };
      }

      // Click trực tiếp vào thẻ đáp án A/B/C/D để test trả lời
      ['a', 'b', 'c', 'd'].forEach((key) => {
        const btn = document.getElementById(`optBtn_${key}`);
        if (btn) {
          btn.addEventListener('click', () => {
            this.playBeep(520, 0.08);
            const targetUser = (document.getElementById('inputGiftUser')?.value || '@HocVien_Demo').trim();
            const uid = targetUser.replace(/^@+/, '') || 'demo_user';
            this.sendRpc('gplx.submitAnswer', {
              user: targetUser.startsWith('@') ? targetUser : `@${targetUser}`,
              uniqueId: uid,
              avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uid)}`,
              answer: key.toUpperCase()
            });
          });
        }
      });

      // MC Controls (đồng bộ qua server sang tất cả tab & OBS Browser Source)
      const selectMcVoice = document.getElementById('selectMcVoice');
      if (selectMcVoice) {
        selectMcVoice.onchange = () => {
          this.ensureAudioCtx();
          this.mc.resumeAudioContext();
          const voice = selectMcVoice.value;
          const label = selectMcVoice.selectedOptions[0]?.text || voice;
          this.mc.setVoice(voice);
          this.sendRpc('gplx.updateSettings', { mcVoice: voice });
          this.logDockEvent(`🗣️ Đã đổi giọng MC sang: ${label} (đã đồng bộ OBS & Admin)`);
        };
      }

      const btnMcTestVoice = document.getElementById('btnMcTestVoice');
      if (btnMcTestVoice) {
        btnMcTestVoice.onclick = () => {
          this.ensureAudioCtx();
          this.mc.resumeAudioContext();
          this.sendRpc('gplx.mcCommand', { action: 'testVoice' });
        };
      }

      const btnToggleMcAuto = document.getElementById('btnToggleMcAuto');
      if (btnToggleMcAuto) {
        btnToggleMcAuto.onclick = () => {
          const next = !this.settings.mcAutoRead;
          this.sendRpc('gplx.updateSettings', { mcAutoRead: next });
          this.logDockEvent(next ? '🎙️ Đã BẬT MC đọc tự động câu hỏi & đáp án.' : '🔇 Đã TẮT MC đọc tự động.');
        };
      }

      const btnToggleSfx = document.getElementById('btnToggleSfx');
      if (btnToggleSfx) {
        btnToggleSfx.onclick = () => {
          const next = !this.settings.sfxEnabled;
          this.sendRpc('gplx.updateSettings', { sfxEnabled: next });
          this.logDockEvent(next ? '🔔 Đã BẬT âm hiệu ứng đếm giờ & quà tặng.' : '🔕 Đã TẮT âm hiệu ứng.');
        };
      }

      const btnToggleLocalMute = document.getElementById('btnToggleLocalMute');
      if (btnToggleLocalMute) {
        btnToggleLocalMute.onclick = () => {
          const nextMuted = !this.mc.localMuted;
          this.mc.setLocalMuted(nextMuted);
          this.syncAllDockControls();
          this.logDockEvent(
            nextMuted
              ? '🔇 Đã TẮT tiếng riêng tab điều khiển này (OBS vẫn phát bình thường).'
              : '🔊 Đã BẬT tiếng lại cho tab điều khiển này.'
          );
        };
      }

      const btnMcReadQuestion = document.getElementById('btnMcReadQuestion');
      if (btnMcReadQuestion) {
        btnMcReadQuestion.onclick = () => {
          this.ensureAudioCtx();
          this.mc.resumeAudioContext();
          this.sendRpc('gplx.mcCommand', { action: 'readQuestion' });
        };
      }

      const btnMcReadAnswer = document.getElementById('btnMcReadAnswer');
      if (btnMcReadAnswer) {
        btnMcReadAnswer.onclick = () => {
          this.ensureAudioCtx();
          this.mc.resumeAudioContext();
          this.sendRpc('gplx.mcCommand', { action: 'readAnswer' });
        };
      }

      const btnMcStop = document.getElementById('btnMcStop');
      if (btnMcStop) {
        btnMcStop.onclick = () => {
          this.mc.stop();
          this.sendRpc('gplx.mcCommand', { action: 'stop' });
        };
      }

      const mcVolumeRange = document.getElementById('mcVolumeRange');
      if (mcVolumeRange) {
        mcVolumeRange.oninput = () => {
          const pct = Number(mcVolumeRange.value);
          this.settings.mcVolume = pct / 100;
          this.mc.setVolume(pct / 100);
          const volVal = document.getElementById('mcVolumeValue');
          if (volVal) volVal.textContent = `${pct}%`;
        };
        mcVolumeRange.onchange = () => {
          const pct = Number(mcVolumeRange.value);
          this.sendRpc('gplx.updateSettings', { mcVolume: pct / 100 });
          this.logDockEvent(`🔊 Đã đồng bộ âm lượng MC: ${pct}%`);
        };
      }

      // Cài đặt Thời gian & Luật trận đấu (lưu file + đồng bộ server/OBS/Admin)
      const saveTimerSeconds = () => {
        const inputEl = document.getElementById('inputTimerSeconds');
        const raw = Number(inputEl?.value);
        if (!Number.isFinite(raw) || raw < 5 || raw > 120) {
          this.logDockEvent('⚠️ Thời gian đếm ngược phải từ 5 đến 120 giây!');
          return;
        }
        const sec = Math.round(raw);
        this.sendRpc('gplx.updateSettings', { timerSeconds: sec });
        this.logDockEvent(`⏱️ Đã lưu thời gian trả lời mỗi câu: ${sec} giây.`);
      };

      const btnSaveTimerSec = document.getElementById('btnSaveTimerSec');
      if (btnSaveTimerSec) btnSaveTimerSec.onclick = saveTimerSeconds;

      const inputTimerSeconds = document.getElementById('inputTimerSeconds');
      if (inputTimerSeconds) {
        inputTimerSeconds.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveTimerSeconds();
          }
        });
      }

      const btnToggleWaitMc = document.getElementById('btnToggleWaitMc');
      if (btnToggleWaitMc) {
        btnToggleWaitMc.onclick = () => {
          const next = !this.settings.waitMcBeforeTimer;
          this.sendRpc('gplx.updateSettings', { waitMcBeforeTimer: next });
          this.logDockEvent(
            next
              ? '🎙️ Chế độ: MC đọc xong câu hỏi mới bắt đầu đếm giờ.'
              : '⚡ Chế độ: Đếm giờ ngay khi mở câu mới (không chờ MC đọc xong).'
          );
        };
      }

      const btnToggleAutoNext = document.getElementById('btnToggleAutoNext');
      if (btnToggleAutoNext) {
        btnToggleAutoNext.onclick = () => {
          const next = !this.settings.autoNextQuestion;
          this.sendRpc('gplx.updateSettings', { autoNextQuestion: next });
          this.logDockEvent(
            next
              ? '⏭️ Đã BẬT tự động chuyển câu tiếp theo sau khi mở đáp án.'
              : '⏸️ Đã TẮT tự chuyển câu (host chủ động bấm Câu Tiếp).'
          );
        };
      }

      // Giả lập tặng quà TikTok (kết nối x2 điểm ngay cho user đang nhập)
      document.querySelectorAll('[data-gift-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const giftId = btn.getAttribute('data-gift-id');
          const rawUser = (document.getElementById('inputGiftUser')?.value || '@Minh_B2').trim() || '@Minh_B2';
          const userHandle = rawUser.startsWith('@') ? rawUser : `@${rawUser}`;
          const uid = userHandle.replace(/^@+/, '');
          this.sendRpc('gplx.sendGift', {
            user: userHandle,
            uniqueId: uid,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uid)}`,
            giftId,
            repeatCount: 1
          });
        });
      });

      // Giả lập bình luận A/B/C/D
      ['A', 'B', 'C', 'D'].forEach((letter) => {
        const btn = document.getElementById(`btnSim${letter}`);
        if (btn) {
          btn.onclick = () => this.sendRpc('gplx.simulateComment', { answer: letter });
        }
      });

      // Điều khiển câu hỏi & thời gian
      const btnNextQ = document.getElementById('btnNextQ');
      if (btnNextQ) btnNextQ.onclick = () => this.sendRpc('gplx.nextQuestion', {});
      const btnPrevQ = document.getElementById('btnPrevQ');
      if (btnPrevQ) btnPrevQ.onclick = () => this.sendRpc('gplx.prevQuestion', {});

      const triggerJumpQ = () => {
        const val = document.getElementById('inputJumpQ')?.value.trim();
        if (!val) {
          this.logDockEvent('⚠️ Vui lòng nhập số câu hỏi cần nhảy tới (vd: 486)!');
          return;
        }
        this.sendRpc('gplx.jumpToQuestion', { id: val });
      };

      const btnJumpQ = document.getElementById('btnJumpQ');
      if (btnJumpQ) btnJumpQ.onclick = triggerJumpQ;

      const inputJumpQ = document.getElementById('inputJumpQ');
      if (inputJumpQ) {
        inputJumpQ.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            triggerJumpQ();
          }
        });
      }

      const btnRestartTimer = document.getElementById('btnRestartTimer');
      if (btnRestartTimer) btnRestartTimer.onclick = () => this.sendRpc('gplx.restartTimer', {});

      const btnStartCountdownNow = document.getElementById('btnStartCountdownNow');
      if (btnStartCountdownNow) {
        btnStartCountdownNow.onclick = () => {
          this.sendRpc('gplx.startCountdownNow', {});
          this.logDockEvent(`▶️ Đã kích hoạt đếm ngược ${this.settings.timerSeconds || 15} giây ngay lập tức.`);
        };
      }

      const btnRevealNow = document.getElementById('btnRevealNow');
      if (btnRevealNow) btnRevealNow.onclick = () => this.sendRpc('gplx.revealNow', {});

      const btnTogglex2 = document.getElementById('btnTogglex2');
      if (btnTogglex2) {
        btnTogglex2.onclick = () => {
          this.sendRpc('gplx.toggleMultiplier', {});
        };
      }

      const btnResetLeaderboard = document.getElementById('btnResetLeaderboard');
      if (btnResetLeaderboard) {
        btnResetLeaderboard.onclick = () => {
          this.sendRpc('gplx.resetLeaderboard', {});
          this.logDockEvent('🗑️ Đã đặt lại bảng xếp hạng về trống.');
        };
      }

      // Kết nối / Ngắt kết nối TikTok Live (đồng bộ chuẩn live.connect / live.disconnect như test2)
      const triggerConnectTikTok = () => {
        const username = document.getElementById('inputTikTokUser')?.value.trim();
        if (!username) {
          this.logDockEvent('⚠️ Vui lòng nhập @username hoặc link TikTok Live!');
          return;
        }
        this.sendRpc('live.connect', { username });
        this.logDockEvent(`📡 Đang kết nối tới phòng TikTok Live: ${username}...`);
      };

      const btnConnect = document.getElementById('btnConnectTikTok');
      if (btnConnect) btnConnect.onclick = triggerConnectTikTok;

      const inputTikTokUser = document.getElementById('inputTikTokUser');
      if (inputTikTokUser) {
        inputTikTokUser.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            triggerConnectTikTok();
          }
        });
      }

      const btnDisconnect = document.getElementById('btnDisconnectTikTok');
      if (btnDisconnect) {
        btnDisconnect.onclick = () => {
          this.sendRpc('live.disconnect', {});
          this.logDockEvent('🔌 Đã ngắt kết nối TikTok Live.');
        };
      }
    }

    initResizeScaling() {
      const stage = document.getElementById('stage9x16');
      const wrapper = document.getElementById('stageWrapper');
      if (!stage || !wrapper) return;

      const resize = () => {
        const availW = wrapper.clientWidth;
        const availH = wrapper.clientHeight;
        const targetW = 1080;
        const targetH = 1920;
        const scale = Math.min(availW / targetW, availH / targetH, 1);
        stage.style.transform = `scale(${scale})`;
      };

      window.addEventListener('resize', resize);
      resize();
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.gplx = new GplxClient();
  });
})();
