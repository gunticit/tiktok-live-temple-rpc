/**
 * ClubAudioEngine
 * - Nhạc nền: Mô phỏng nhịp điệu EDM / Vinahouse 128 BPM sôi động với tiếng bass, kick và synth lead,
 *   tự động hạ nhỏ âm lượng (ducking) khi có giọng đọc ZeroTTS xướng tên đại gia và đọc lời cảm ơn.
 * - Hiệu ứng âm thanh vũ trường (SFX):
 *   + Tiếng còi DJ air horn kinh điển (pew-pew-pew!)
 *   + Tiếng bass drop / còi hú khi sàn cháy
 *   + Tiếng laser zaps quét sàn
 *   + Tiếng pháo hoa / party popper nổ giòn giã
 *   + Tiếng nhạc hoàng gia khi cưỡi rồng xuất hiện
 * - Giọng đọc ZeroTTS: Hàng đợi xướng tên đại gia hào sảng.
 */
class ClubAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    this.ttsVoice = 'maichi';

    const savedMusicVol = parseFloat(localStorage.getItem('club_music_vol'));
    const savedTtsVol = parseFloat(localStorage.getItem('club_tts_vol'));
    this.bgBaseVolume = Number.isFinite(savedMusicVol) ? Math.max(0, Math.min(1, savedMusicVol)) : 0.65;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;

    this.beatTimer = null;
    this.beatStep = 0;
    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;

    // Nhạc nền chính: Festival Euphoria.mp3
    this.bgMusicSrc = '/assets/festival_euphoria.mp3';
    this.bgMusicAudio = new Audio(this.bgMusicSrc);
    this.bgMusicAudio.loop = true;
    this.bgMusicAudio.preload = 'auto';
    this.bgMusicAudio.volume = this.bgBaseVolume;
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
    if (this.bgMusicEnabled) {
      this.startClubBeat();
    }
    return this.ctx;
  }

  getDuckedVolume() {
    return Math.max(0.08, +(this.bgBaseVolume * 0.28).toFixed(2));
  }

  duckMusic(ducked) {
    if (!this.bgMusicAudio) return;
    this.bgMusicAudio.volume = ducked ? this.getDuckedVolume() : this.bgBaseVolume;
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    try {
      localStorage.setItem('club_music_vol', String(v));
    } catch (_) {}
    if (this.bgMusicAudio && !this.ttsPlaying) {
      this.bgMusicAudio.volume = v;
    }
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    try {
      localStorage.setItem('club_tts_vol', String(v));
    } catch (_) {}
    if (this.currentAudio) {
      this.currentAudio.volume = this.ttsVolume;
    }
  }

  // --------------------------------------------------------------------------
  // 1. NHẠC NỀN EDM FESTIVAL EUPHORIA (TỰ ĐỘNG LẶP & GIẢM NHẸ KHI ĐỌC TÊN)
  // --------------------------------------------------------------------------
  startClubBeat() {
    if (!this.bgMusicEnabled) return;
    if (this.bgMusicAudio) {
      this.bgMusicAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
      const playPromise = this.bgMusicAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[ClubAudio] Autoplay blocked, click "Bật Âm Nhạc & Giọng Đọc" to start:', err?.message);
        });
      }
    }
  }

  stopClubBeat() {
    if (this.bgMusicAudio) {
      this.bgMusicAudio.pause();
    }
  }

  // --------------------------------------------------------------------------
  // 2. TIẾNG CÒI DJ AIR HORN (PEW PEW PEW!)
  // --------------------------------------------------------------------------
  playAirHorn() {
    if (!this.sfxEnabled) return;
    const blasts = [0, 100, 200, 380];
    blasts.forEach((delay, idx) => {
      setTimeout(() => {
        try {
          const ctx = this.ensureContext();
          const now = ctx.currentTime;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sawtooth';
          osc2.type = 'sawtooth';

          const freq = idx === 3 ? 466.16 : 523.25; // C5 drop to Bb4
          osc1.frequency.setValueAtTime(freq, now);
          osc2.frequency.setValueAtTime(freq * 1.5, now);

          const dur = idx === 3 ? 0.45 : 0.08;
          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + dur + 0.02);
          osc2.stop(now + dur + 0.02);
        } catch (_) {}
      }, delay);
    });
  }

  // --------------------------------------------------------------------------
  // 3. TIẾNG SÀN CHÁY / BASS DROP & SIREN
  // --------------------------------------------------------------------------
  playFeverDrop() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      // Heavy Sub Bass Drop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 1.2);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.45);

      // Club Siren
      const siren = ctx.createOscillator();
      const sGain = ctx.createGain();
      siren.type = 'sawtooth';
      siren.frequency.setValueAtTime(600, now);
      siren.frequency.linearRampToValueAtTime(1100, now + 0.4);
      siren.frequency.linearRampToValueAtTime(600, now + 0.8);
      siren.frequency.linearRampToValueAtTime(1100, now + 1.2);

      sGain.gain.setValueAtTime(0.12, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      siren.connect(sGain);
      sGain.connect(ctx.destination);

      siren.start(now);
      siren.stop(now + 1.45);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 4. TIẾNG LASER ZAPS
  // --------------------------------------------------------------------------
  playLaser() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(2200, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 5. TIẾNG CƯỠI RỒNG XUẤT HIỆN (TRIUMPHANT DRAGON FANFARE)
  // --------------------------------------------------------------------------
  playDragonFanfare() {
    if (!this.sfxEnabled) return;
    this.playAirHorn();
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C major arpeggio
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        try {
          const ctx = this.ensureContext();
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.20, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.85);
        } catch (_) {}
      }, 400 + idx * 80);
    });
  }

  // --------------------------------------------------------------------------
  // 6. HÀNG ĐỢI ZEROTTS (VOICE QUEUE)
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
    this.duckMusic(true);

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
        await this.playWebSpeechFallback(item.text, item.onStart, item.onEnd);
      }
    } catch (_) {
      if (item.onEnd) item.onEnd();
    } finally {
      this.ttsQueue.shift();
      this.ttsPlaying = false;
      this.duckMusic(false);
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
        setTimeout(done, 22000);
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

// Global instance & aliases
window.ClubAudio = new ClubAudioEngine();
window.FishingAudio = window.ClubAudio;
window.TempleAudio = window.ClubAudio;
