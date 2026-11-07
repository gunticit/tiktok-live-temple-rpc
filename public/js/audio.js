/**
 * FishingAudioEngine
 * - Nhạc nền: Mô phỏng sóng nước hồ câu êm dịu, tiếng chim rừng & suối reo thư giãn bằng Web Audio API,
 *   tự động hạ nhỏ âm lượng (ducking) khi có giọng đọc ZeroTTS thông báo bắt cá.
 * - Hiệu ứng âm thanh (SFX):
 *   + Tiếng ném thính tõm xuống nước (Water drop / splash)
 *   + Tiếng máy câu quay rè rè (Fishing reel clicker)
 *   + Tiếng vung cần xé gió (Rod whoosh)
 *   + Tiếng cá quẫy nước bì bõm (Fish splash & struggle)
 *   + Tiếng còi báo cá bến thuyền (Boat air horn)
 *   + Tiếng chuông reo ăn mừng cá to (Celebration chime)
 * - Giọng đọc: Hàng đợi ZeroTTS phát tuần tự hào sảng.
 */
class FishingAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    const savedVoice = localStorage.getItem('fishing_tts_voice');
    this.ttsVoice = savedVoice || 'maichi';

    const savedMusicVol = parseFloat(localStorage.getItem('fishing_music_vol'));
    const savedTtsVol = parseFloat(localStorage.getItem('fishing_tts_vol'));
    this.bgBaseVolume = Number.isFinite(savedMusicVol) ? Math.max(0, Math.min(1, savedMusicVol)) : 0.60;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;

    this.synthBgTimer = null;
    this.waterLapTimer = null;
    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;
    if (this.bgMusicEnabled && !this.synthBgTimer) {
      this.startLakeAmbience();
    }
    return this.ctx;
  }

  setVoice(voice) {
    if (!voice) return;
    this.ttsVoice = String(voice).toLowerCase().trim();
    try {
      localStorage.setItem('fishing_tts_voice', this.ttsVoice);
    } catch (_) {}
  }

  testVoice(text) {
    this.ensureContext();
    this.playCelebrationChime();
    const sample = text || 'Chào mừng quý cần thủ đến với Hồ Câu Giải Trí! Chúc anh em giật được nhiều cá to!';
    this.enqueueTts(sample, { voice: this.ttsVoice });
  }

  getDuckedVolume() {
    return Math.max(0.06, +(this.bgBaseVolume * 0.30).toFixed(2));
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    try {
      localStorage.setItem('fishing_music_vol', String(v));
    } catch (_) {}
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    try {
      localStorage.setItem('fishing_tts_vol', String(v));
    } catch (_) {}
    if (this.currentAudio) {
      this.currentAudio.volume = this.ttsVolume;
    }
  }

  // --------------------------------------------------------------------------
  // 1. ÂM THANH NỀN HỒ NƯỚC & THIÊN NHIÊN (LAKE & NATURE SYNTH AMBIENCE)
  // --------------------------------------------------------------------------
  startLakeAmbience() {
    if (!this.bgMusicEnabled) return;
    if (this.synthBgTimer) return;

    // Chuỗi nốt lofi ngũ cung êm dịu gợi cảm giác ngồi câu cá bên hồ
    const PENTATONIC = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let noteIdx = 0;

    const playLakeTone = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freq = PENTATONIC[noteIdx % PENTATONIC.length];
        noteIdx++;
        const vol = (this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume) * 0.12;
        if (vol <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 5.0);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 5.1);
      } catch (_) {}
    };

    // Tiếng nước vỗ nhẹ bờ hồ ngẫu nhiên
    const playSoftWaterLap = () => {
      if (!this.bgMusicEnabled || !this.ctx || this.ttsPlaying) return;
      try {
        const now = this.ctx.currentTime;
        const vol = this.bgBaseVolume * 0.05;

        // Pink noise buffer cho tiếng sóng
        const bufferSize = this.ctx.sampleRate * 1.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, now);
        filter.frequency.linearRampToValueAtTime(180, now + 1.2);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        whiteNoise.start(now);
        whiteNoise.stop(now + 1.25);
      } catch (_) {}
    };

    playLakeTone();
    this.synthBgTimer = setInterval(playLakeTone, 4200);
    this.waterLapTimer = setInterval(playSoftWaterLap, 6500);
  }

  stopLakeAmbience() {
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
    if (this.waterLapTimer) {
      clearInterval(this.waterLapTimer);
      this.waterLapTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // 2. TIẾNG THẢ THÍNH / MỒI RƠI XUỐNG NƯỚC (WATER DROP / PLOP)
  // --------------------------------------------------------------------------
  playWaterDrop(pitchMultiplier = 1.0) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startFreq = 420 * pitchMultiplier * (0.95 + Math.random() * 0.1);
      const endFreq = startFreq * 2.2;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 3. TIẾNG QUAY MÁY CÂU (REEL CLICKING / WINDING)
  // --------------------------------------------------------------------------
  playReelClick(clicks = 8, intervalMs = 45) {
    if (!this.sfxEnabled) return;
    for (let i = 0; i < clicks; i++) {
      setTimeout(() => {
        try {
          const ctx = this.ensureContext();
          const now = ctx.currentTime;

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1400 + Math.random() * 300, now);

          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.03);
        } catch (_) {}
      }, i * intervalMs);
    }
  }

  // --------------------------------------------------------------------------
  // 4. TIẾNG VUNG CẦN CÂU XÉ GIÓ (ROD WHOOSH)
  // --------------------------------------------------------------------------
  playRodWhoosh() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      // Bandpass noise whoosh
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(1600, now + 0.12);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.28);
      filter.Q.setValueAtTime(3.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.3);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 5. TIẾNG CÁ QUẪY NƯỚC (FISH SPLASH & STRUGGLE)
  // --------------------------------------------------------------------------
  playFishSplash() {
    if (!this.sfxEnabled) return;
    this.playWaterDrop(0.8);
    setTimeout(() => this.playWaterDrop(1.3), 80);
    setTimeout(() => this.playWaterDrop(1.1), 160);
    setTimeout(() => this.playWaterDrop(0.9), 240);
  }

  // --------------------------------------------------------------------------
  // 6. TIẾNG CÒI BÁO CÁ / CÒI BẾN TÀU (BOAT AIR HORN)
  // --------------------------------------------------------------------------
  playAirHorn() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const baseFreq = 210;
      const partials = [
        { freq: baseFreq, amp: 0.22 },
        { freq: baseFreq * 1.25, amp: 0.18 },
        { freq: baseFreq * 1.5, amp: 0.14 }
      ];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(0.28, now + 0.05);
      master.gain.setValueAtTime(0.28, now + 0.65);
      master.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      master.connect(ctx.destination);

      partials.forEach((p) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(p.freq, now);

        const g = ctx.createGain();
        g.gain.setValueAtTime(p.amp, now);

        osc.connect(g);
        g.connect(master);

        osc.start(now);
        osc.stop(now + 1.0);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 7. TIẾNG CHUÔNG ĂN MỪNG CHIẾN TÍCH (CELEBRATION CHIME)
  // --------------------------------------------------------------------------
  playCelebrationChime() {
    if (!this.sfxEnabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        try {
          const ctx = this.ensureContext();
          const now = ctx.currentTime;

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 1.25);
        } catch (_) {}
      }, idx * 110);
    });
  }

  // --------------------------------------------------------------------------
  // 7.1. TIẾNG ĂN MỪNG TẶNG QUÀ TIKTOK LIVE (GIFT FANFARE)
  // --------------------------------------------------------------------------
  playGiftFanfare(coins = 1) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      if (coins >= 100) {
        // Royal Brass & Chime (Grand Tay Cầm Chơi Game / Thủy Quái)
        const notes = [440, 554.37, 659.25, 880, 1108.73];
        notes.forEach((freq, i) => {
          setTimeout(() => {
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.24, now + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.7);
          }, i * 90);
        });
      } else if (coins >= 10) {
        // Chú heo may mắn fanfare
        const notes = [587.33, 739.99, 880, 1174.66];
        notes.forEach((freq, i) => {
          setTimeout(() => {
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.20, now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.3);
          }, i * 100);
        });
      } else {
        // Hoa hồng / Bắn tim / Nháy mắt coin ding
        const notes = [880, 1318.51];
        notes.forEach((freq, i) => {
          setTimeout(() => {
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.65);
          }, i * 80);
        });
      }
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 8. HÀNG ĐỢI ZEROTTS (VOICE QUEUE)
  // --------------------------------------------------------------------------
  enqueueTts(text, options = {}) {
    const onStart = typeof options.onStart === 'function' ? options.onStart : null;
    const onEnd = typeof options.onEnd === 'function' ? options.onEnd : null;

    if (!this.ttsEnabled) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 4500);
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 4500);
      return;
    }

    if (this.ttsQueue.length >= 6) {
      const dropped = this.ttsQueue.shift();
      if (dropped?.onStart) dropped.onStart();
      if (dropped?.onEnd) dropped.onEnd();
    }

    const item = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      voice: (options.voice || this.ttsVoice || 'maichi').toLowerCase(),
      url: options.url || null,
      onStart,
      onEnd,
      fetchPromise: null
    };

    if (!item.url) {
      item.fetchPromise = this.fetchZeroTtsAudio(item.text, item.voice);
    }

    this.ttsQueue.push(item);
    this.processTtsQueue();
  }

  async fetchZeroTtsAudio(text, voice = 'maichi') {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });
      const data = await res.json();
      if (data && data.ok && data.url) {
        return data;
      }
      return { ok: false, error: data?.error || 'ZeroTTS unavailable' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;
    const item = this.ttsQueue[0];
    this.ttsPlaying = true;

    try {
      let audioUrl = item.url;
      if (!audioUrl) {
        const result = await item.fetchPromise;
        if (result && result.ok && result.url) {
          audioUrl = result.url;
        }
      }

      if (audioUrl) {
        if (item.onStart) item.onStart();
        await this.playAudioUrl(audioUrl);
        if (item.onEnd) item.onEnd();
      } else {
        // Fallback: Web Speech API
        await this.playWebSpeechFallback(item.text, item.onStart, item.onEnd);
      }
    } catch (_) {
      if (item.onEnd) item.onEnd();
    } finally {
      this.ttsQueue.shift();
      this.ttsPlaying = false;
      this.processTtsQueue();
    }
  }

  playAudioUrl(url) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        this.currentAudio = audio;
        audio.volume = this.ttsVolume;
        let resolved = false;

        const done = () => {
          if (!resolved) {
            resolved = true;
            this.currentAudio = null;
            resolve();
          }
        };

        audio.onended = done;
        audio.onerror = done;
        setTimeout(done, 22000); // Guard timeout
        audio.play().catch(done);
      } catch (_) {
        resolve();
      }
    });
  }

  playWebSpeechFallback(text, onStart, onEnd) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        if (onStart) onStart();
        if (onEnd) onEnd();
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'vi-VN';
        u.rate = 1.05;
        u.volume = this.ttsVolume;
        u.onstart = () => {
          if (onStart) onStart();
        };
        u.onend = () => {
          if (onEnd) onEnd();
          resolve();
        };
        u.onerror = () => {
          if (onEnd) onEnd();
          resolve();
        };
        window.speechSynthesis.speak(u);
      } catch (_) {
        if (onEnd) onEnd();
        resolve();
      }
    });
  }
}

// Backward-compatible global singleton
window.FishingAudio = new FishingAudioEngine();
window.TempleAudio = window.FishingAudio; // Alias
