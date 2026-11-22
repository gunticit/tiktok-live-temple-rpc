/**
 * WuxiaAudioEngine — Hệ Thống Âm Thanh Kiếm Hiệp & Bình Luận Viên Võ Lâm
 * - Âm thanh Web Audio tổng hợp đa tầng:
 *   + Tiếng đao kiếm va chạm (Clang / Clash / Metal Ring)
 *   + Tiếng chém kiếm xé gió (Whoosh / Slash)
 *   + Tiếng chưởng phong nổ khí công (Ki Blast / Punch)
 *   + Tiếng Đại Tuyệt Kỹ & Tiếng Rồng Gầm (Dragon Roar / Ultimate)
 *   + Tiếng Trống Trận & Chiêng Lôi Đài (War Drum / Victory Gong)
 *   + Tiếng Đăng Quang Võ Lâm Minh Chủ (Fanfare)
 * - Bình Luận Viên TTS (ZeroTTS Mai Chi hoặc Web Speech API fallback)
 */
class WuxiaAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    this.ttsVoice = 'maichi';
    this.sfxVolume = 0.8;
    this.ttsVolume = 0.95;
    this.musicVolume = 0.5;

    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;

    // Background martial arts ambience loop
    this.bgOscTimer = null;
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
    if (this.bgMusicEnabled && !this.bgOscTimer) {
      this.startAmbientMusic();
    }
    return this.ctx;
  }

  // --------------------------------------------------------------------------
  // SFX: TIẾNG BINH KHÍ & CHIẾN ĐẤU KIẾM HIỆP
  // --------------------------------------------------------------------------
  playSwordSlash() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    const t = ctx.currentTime;

    // Tiếng xé gió (Filtered Noise whoosh)
    const bufferSize = ctx.sampleRate * 0.18;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.08);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.18);
    filter.Q.value = 3.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35 * this.sfxVolume, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(t);
    noise.stop(t + 0.18);
  }

  playSwordClash() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    const t = ctx.currentTime;

    // Hai sóng kim loại đập vào nhau tạo tiếng leng keng đanh thép
    [2400, 3180, 4750].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.25);

      const amp = (0.28 / (idx + 1)) * this.sfxVolume;
      gain.gain.setValueAtTime(amp, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.35);
    });

    // Tiếng rít xé gió kèm theo
    this.playSwordSlash();
  }

  playBluntHit() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    const t = ctx.currentTime;

    // Tiếng Côn / Bổng gõ uy lực trầm bổng
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);

    gain.gain.setValueAtTime(0.5 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  playCritHit() {
    if (!this.sfxEnabled) return;
    this.playSwordClash();
    const ctx = this.ensureContext();
    const t = ctx.currentTime;

    // Tiếng nổ bạo kích chấn động
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.3);

    gain.gain.setValueAtTime(0.45 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  playUltimateVfx() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    const t = ctx.currentTime;

    // Tiếng Đại Tuyệt Kỹ: Rồng Gầm & Sóng Khí Công bùng nổ
    const chord = [130.81, 164.81, 196.0, 261.63, 392.0];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 1.5, t + 0.3);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 1.2);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.2 * this.sfxVolume, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 1.2);
    });
  }

  playCoronation() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    const t = ctx.currentTime;

    // Tiếng chiêng vàng và nhạc khúc Minh Chủ đăng quang
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const delay = idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);

      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.25 * this.sfxVolume, t + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 1.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t + delay);
      osc.stop(t + delay + 1.5);
    });
  }

  startAmbientMusic() {
    // Nhạc nền cổ phong kiếm hiệp êm dịu tạo cảm giác lôi đài ngàn năm
    if (this.bgOscTimer) return;
    const notes = [130.81, 146.83, 164.81, 196.0, 220.0]; // Thang ngũ cung Cổ Phong (C, D, E, G, A)
    let noteIdx = 0;

    const playAmbientNote = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[noteIdx % notes.length], t);
      noteIdx = (noteIdx + Math.floor(Math.random() * 3 + 1)) % notes.length;

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.04 * this.musicVolume, t + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 3.2);
    };

    this.bgOscTimer = setInterval(playAmbientNote, 3200);
  }

  // --------------------------------------------------------------------------
  // BÌNH LUẬN VIÊN GIỌNG ĐỌC TTS
  // --------------------------------------------------------------------------
  speak(text) {
    if (!this.ttsEnabled || !text) return;
    this.ttsQueue.push(text);
    if (!this.ttsPlaying) {
      this.processTtsQueue();
    }
  }

  async processTtsQueue() {
    if (this.ttsQueue.length === 0) {
      this.ttsPlaying = false;
      return;
    }
    this.ttsPlaying = true;
    const text = this.ttsQueue.shift();

    try {
      // 1. Thử gọi ZeroTTS từ server
      const resp = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'wuxia.speak',
          params: { text, broadcast: false }
        })
      });
      const data = await resp.json();
      if (data?.result?.ok && data.result.url) {
        await this.playAudioUrl(data.result.url);
      } else {
        // Fallback Web Speech API của trình duyệt
        this.speakBrowserFallback(text);
      }
    } catch (_) {
      this.speakBrowserFallback(text);
    }

    setTimeout(() => {
      this.processTtsQueue();
    }, 400);
  }

  playAudioUrl(url) {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.volume = this.ttsVolume;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }

  speakBrowserFallback(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'vi-VN';
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.volume = this.ttsVolume;
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang.startsWith('vi') || v.lang.includes('VN'));
      if (viVoice) utter.voice = viVoice;
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }
}

window.WuxiaAudioEngine = WuxiaAudioEngine;
