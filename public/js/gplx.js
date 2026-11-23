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

      const savedEnabled = localStorage.getItem('gplx_mc_enabled');
      const savedVoice = localStorage.getItem('gplx_mc_voice');
      const savedVol = parseFloat(localStorage.getItem('gplx_mc_volume'));

      this.enabled = savedEnabled === null ? true : savedEnabled === 'true';
      this.voice = savedVoice || 'quangminh';
      this.volume = Number.isFinite(savedVol) ? Math.max(0, Math.min(1, savedVol)) : 0.95;

      this.zeroTtsReady = false;
      this.sessionId = 0;
      this.isSpeaking = false;
      this.audioEl = null;
      this.audioCtx = null;
      this.mediaSource = null;
      this.analyser = null;
      this.pendingSegments = null;
      this.pendingOptions = null;
      this.autoplayBlocked = false;
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
        this.audioEl.volume = this.volume;
      }

      this.resumeAudioContext();

      // Chỉ gắn MediaElementAudioSourceNode khi AudioContext đã mở ('running')
      // để tránh trường hợp trình duyệt chặn autoplay làm AudioContext ở trạng thái suspended gây mất tiếng
      if (!this.mediaSource && this.audioCtx && this.audioCtx.state === 'running') {
        try {
          this.mediaSource = this.audioCtx.createMediaElementSource(this.audioEl);
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 256;
          this.analyser.smoothingTimeConstant = 0.45;
          this.mediaSource.connect(this.analyser);
          this.analyser.connect(this.audioCtx.destination);
          this.onAnalyserReady(this.analyser);
        } catch (err) {
          console.warn('[MC LipSync Analyser Fallback]', err?.message || err);
        }
      }

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
      if (!voice) return;
      this.voice = String(voice).toLowerCase().trim();
      try {
        localStorage.setItem('gplx_mc_voice', this.voice);
      } catch (_) {}
    }

    setVolume(vol) {
      const v = Math.max(0, Math.min(1, Number(vol)));
      if (!Number.isFinite(v)) return;
      this.volume = v;
      try {
        localStorage.setItem('gplx_mc_volume', String(v));
      } catch (_) {}
      if (this.audioEl) {
        this.audioEl.volume = v;
      }
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

    async fetchTts(text) {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: this.voice })
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
        audio.volume = this.volume;
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
          u.volume = this.volume;

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
        prefetches.set(idx, this.fetchTts(cleanSegs[idx]));
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

      // Hỗ trợ chế độ OBS Browser Source sạch (?obs=1)
      const urlParams = new URLSearchParams(window.location.search);
      this.isObsMode = urlParams.get('obs') === '1' || urlParams.get('obs') === 'true';
      if (this.isObsMode) {
        document.body.classList.add('obs-mode');
      }

      this.audio = null;
      this.lipSync = new TeacherLipSyncAnimator(document.getElementById('teacherAvatarSvg'));
      this.mc = new GplxMcSpeaker({
        onSpeakingChange: (speaking, caption) => this.updateMcVisual(speaking, caption),
        onLipSyncMode: (mode) => this.lipSync.setMode(mode),
        onAnalyserReady: (analyser) => this.lipSync.attachAnalyser(analyser),
        onAutoplayBlocked: (blocked) => this.toggleAudioUnlockButton(blocked),
        onLog: (msg) => this.logDockEvent(msg)
      });

      this.initEventListeners();
      this.initResizeScaling();
      this.syncMcDockControls();
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
          } else if (msg.method === 'gplx.tiktokStatus') {
            this.renderTikTokStatus(msg.params);
          } else if (msg.method === 'tts.status') {
            this.renderTtsStatus(msg.params);
          } else if (msg.result) {
            if (msg.result.question) {
              this.onStateUpdate(msg.result);
            } else if (msg.result.model && msg.result.status !== undefined) {
              this.renderTtsStatus(msg.result);
            }
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

    sendRpc(method, params = {}) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        }));
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

      if (statusEl) {
        if (tt.connected) {
          statusEl.textContent = `🟢 Đã kết nối @${tt.username} • ${tt.viewerCount || 0} người xem`;
          statusEl.style.color = '#86efac';
        } else if (tt.connecting) {
          statusEl.textContent = `🟡 Đang kết nối @${tt.username}...`;
          statusEl.style.color = '#fde047';
        } else if (tt.lastError) {
          statusEl.textContent = `🔴 Chưa kết nối: ${tt.lastError}`;
          statusEl.style.color = '#fca5a5';
        } else {
          statusEl.textContent = '⚪ Chưa kết nối phòng TikTok Live';
          statusEl.style.color = '#94a3b8';
        }
      }

      if (liveBadgeLabel) {
        liveBadgeLabel.textContent = tt.connected
          ? `LIVE • @${tt.username}`
          : 'LIVE STREAM • ĐANG THI ĐẤU';
      }
    }

    startQuestionSpeech(roundId, questionNumber, segments) {
      if (!Array.isArray(segments) || !segments.length) {
        this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: 'empty' });
        return;
      }

      if (!this.mc.enabled) {
        // Nếu host đang tắt MC tự đọc -> bắt đầu đếm ngược 15 giây ngay lập tức
        this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: 'mc_disabled' });
        return;
      }

      this.logDockEvent(`🎙️ MC đang đọc Câu ${questionNumber} (hết câu mới đếm 15s)...`);
      this.mc.speakSegments(segments, {
        onStart: () => {
          this.sendRpc('gplx.mcReadingStarted', { roundId });
        },
        onDone: (status) => {
          if (status === 'completed' || status === 'disabled' || status === 'empty') {
            this.sendRpc('gplx.mcFinishedReading', { roundId, kind: 'question', reason: status });
          }
        }
      });
    }

    startAnswerSpeech(roundId, questionNumber, correctKey, segments) {
      if (!this.mc.enabled || !Array.isArray(segments) || !segments.length) return;
      this.logDockEvent(`📣 MC công bố đáp án đúng Câu ${questionNumber}: [${correctKey}]`);
      this.mc.speakSegments(segments, {
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
      this.logDockEvent(`⏱️ MC đã đọc xong! Bắt đầu đếm ngược ${data.timerMax || 15} giây!`);
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

      // Global x2 badge
      const globalX2Badge = document.getElementById('globalX2Badge');
      if (globalX2Badge) {
        globalX2Badge.hidden = (state.multiplier || 1) < 2;
      }

      // Update Votes text
      if (state.votes) {
        const parts = Object.entries(state.votes).map(([k, count]) => `${k} (${count} người)`);
        const voteEl = document.getElementById('voteDistribution');
        if (voteEl) voteEl.textContent = parts.join(' • ');
      }

      // Update Online Count
      if (state.onlineLearnersCount !== undefined) {
        const count = Number(state.onlineLearnersCount || 0);
        const formatted = count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
        const onlineEl = document.getElementById('onlineCountText');
        if (onlineEl) onlineEl.textContent = `👤 Đang online: ${formatted} người tham gia`;
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

    renderLeaderboard(ranks) {
      if (!ranks || ranks.length < 5) return;

      const setAvatar = (id, url, seed) => {
        const img = document.getElementById(id);
        if (!img) return;
        const target = url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
        if (img.getAttribute('src') !== target) {
          img.src = target;
        }
      };

      // #1 Center
      const r1 = ranks[0];
      document.getElementById('podiumUser1').textContent = r1.user;
      document.getElementById('podiumScore1').textContent = `${r1.points}đ`;
      document.getElementById('podiumDelta1').textContent = r1.delta;
      setAvatar('podiumAvatar1', r1.avatar, r1.user);
      this.setX2Badge('podiumX2_1', r1);

      // #2 Left
      const r2 = ranks[1];
      document.getElementById('podiumUser2').textContent = r2.user;
      document.getElementById('podiumScore2').textContent = `${r2.points}đ`;
      document.getElementById('podiumDelta2').textContent = r2.delta;
      setAvatar('podiumAvatar2', r2.avatar, r2.user);
      this.setX2Badge('podiumX2_2', r2);

      // #3 Right
      const r3 = ranks[2];
      document.getElementById('podiumUser3').textContent = r3.user;
      document.getElementById('podiumScore3').textContent = `${r3.points}đ`;
      document.getElementById('podiumDelta3').textContent = r3.delta;
      setAvatar('podiumAvatar3', r3.avatar, r3.user);
      this.setX2Badge('podiumX2_3', r3);

      // #4
      const r4 = ranks[3];
      document.getElementById('runnerUser4').textContent = r4.user;
      document.getElementById('runnerScore4').textContent = `${r4.points}đ • ${r4.delta}`;
      setAvatar('runnerAvatar4', r4.avatar, r4.user);
      this.setX2Badge('podiumX2_4', r4);

      // #5
      const r5 = ranks[4];
      document.getElementById('runnerUser5').textContent = r5.user;
      document.getElementById('runnerScore5').textContent = `${r5.points}đ • ${r5.delta}`;
      setAvatar('runnerAvatar5', r5.avatar, r5.user);
      this.setX2Badge('podiumX2_5', r5);
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
      try {
        const ctx = this.ensureAudioCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
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

    syncMcDockControls() {
      const voiceSel = document.getElementById('selectMcVoice');
      const toggleBtn = document.getElementById('btnToggleMcAuto');
      const volRange = document.getElementById('mcVolumeRange');
      const volVal = document.getElementById('mcVolumeValue');

      if (voiceSel) voiceSel.value = this.mc.voice;
      if (toggleBtn) {
        toggleBtn.textContent = this.mc.enabled ? '🎙️ MC Tự Đọc: BẬT' : '🔇 MC Tự Đọc: TẮT';
        toggleBtn.classList.toggle('gold', this.mc.enabled);
      }
      if (volRange) volRange.value = String(Math.round(this.mc.volume * 100));
      if (volVal) volVal.textContent = `${Math.round(this.mc.volume * 100)}%`;
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
              { force: true }
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

      // MC Controls
      const selectMcVoice = document.getElementById('selectMcVoice');
      if (selectMcVoice) {
        selectMcVoice.onchange = () => {
          this.mc.setVoice(selectMcVoice.value);
          this.logDockEvent(`🗣️ Đã đổi giọng MC sang: ${selectMcVoice.selectedOptions[0]?.text || selectMcVoice.value}`);
        };
      }

      const btnToggleMcAuto = document.getElementById('btnToggleMcAuto');
      if (btnToggleMcAuto) {
        btnToggleMcAuto.onclick = () => {
          this.mc.setEnabled(!this.mc.enabled);
          this.syncMcDockControls();
          this.logDockEvent(this.mc.enabled ? '🎙️ Đã BẬT MC đọc tự động câu hỏi & đáp án.' : '🔇 Đã TẮT MC đọc tự động.');
          if (!this.mc.enabled && this.state?.phase === 'reading') {
            this.sendRpc('gplx.mcFinishedReading', {
              roundId: this.state.roundId,
              kind: 'question',
              reason: 'mc_disabled'
            });
          }
        };
      }

      const btnMcReadQuestion = document.getElementById('btnMcReadQuestion');
      if (btnMcReadQuestion) {
        btnMcReadQuestion.onclick = () => {
          this.ensureAudioCtx();
          const segs = this.state?.speechScripts?.question;
          if (segs && segs.length) {
            this.logDockEvent('🔊 MC đang đọc lại câu hỏi và các đáp án...');
            const roundId = this.state?.roundId;
            const isWaiting = this.state?.phase === 'reading';
            this.mc.speakSegments(segs, {
              force: true,
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
        };
      }

      const btnMcReadAnswer = document.getElementById('btnMcReadAnswer');
      if (btnMcReadAnswer) {
        btnMcReadAnswer.onclick = () => {
          this.ensureAudioCtx();
          const segs = this.state?.speechScripts?.answer;
          if (segs && segs.length) {
            this.logDockEvent('📣 MC đang đọc đáp án chính xác...');
            this.mc.speakSegments(segs, { force: true });
          }
        };
      }

      const btnMcStop = document.getElementById('btnMcStop');
      if (btnMcStop) {
        btnMcStop.onclick = () => {
          this.mc.stop();
          this.logDockEvent('⏹️ Đã dừng giọng đọc MC.');
          if (this.state?.phase === 'reading') {
            this.sendRpc('gplx.mcFinishedReading', {
              roundId: this.state.roundId,
              kind: 'question',
              reason: 'stopped'
            });
          }
        };
      }

      const mcVolumeRange = document.getElementById('mcVolumeRange');
      if (mcVolumeRange) {
        mcVolumeRange.oninput = () => {
          const pct = Number(mcVolumeRange.value);
          this.mc.setVolume(pct / 100);
          const volVal = document.getElementById('mcVolumeValue');
          if (volVal) volVal.textContent = `${pct}%`;
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

      // Điều khiển câu hỏi & thời gian 15s
      const btnNextQ = document.getElementById('btnNextQ');
      if (btnNextQ) btnNextQ.onclick = () => this.sendRpc('gplx.nextQuestion', {});
      const btnPrevQ = document.getElementById('btnPrevQ');
      if (btnPrevQ) btnPrevQ.onclick = () => this.sendRpc('gplx.prevQuestion', {});

      const btnJumpQ = document.getElementById('btnJumpQ');
      if (btnJumpQ) {
        btnJumpQ.onclick = () => {
          const val = document.getElementById('inputJumpQ')?.value.trim();
          if (val) this.sendRpc('gplx.jumpToQuestion', { id: val });
        };
      }

      const btnRestartTimer = document.getElementById('btnRestartTimer');
      if (btnRestartTimer) btnRestartTimer.onclick = () => this.sendRpc('gplx.restartTimer', {});

      const btnStartCountdownNow = document.getElementById('btnStartCountdownNow');
      if (btnStartCountdownNow) {
        btnStartCountdownNow.onclick = () => {
          this.sendRpc('gplx.startCountdownNow', {});
          this.logDockEvent('▶️ Đã kích hoạt đếm ngược 15 giây ngay lập tức.');
        };
      }

      const btnRevealNow = document.getElementById('btnRevealNow');
      if (btnRevealNow) btnRevealNow.onclick = () => this.sendRpc('gplx.revealNow', {});

      const btnTogglex2 = document.getElementById('btnTogglex2');
      if (btnTogglex2) btnTogglex2.onclick = () => this.sendRpc('gplx.toggleMultiplier', {});

      // Kết nối / Ngắt kết nối TikTok Live
      const btnConnect = document.getElementById('btnConnectTikTok');
      if (btnConnect) {
        btnConnect.onclick = () => {
          const username = document.getElementById('inputTikTokUser')?.value.trim();
          if (username) {
            this.sendRpc('tiktok.connect', { username });
            this.logDockEvent(`📡 Đang kết nối tới TikTok Live của ${username}...`);
          }
        };
      }

      const btnDisconnect = document.getElementById('btnDisconnectTikTok');
      if (btnDisconnect) {
        btnDisconnect.onclick = () => {
          this.sendRpc('tiktok.disconnect', {});
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
