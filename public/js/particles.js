/**
 * Ultra-Low-CPU 2.5D Nightclub & Bar Canvas FX Engine
 * Tối ưu hóa tối đa cho OBS / TikTok Live treo máy 24/7:
 * - Khóa cố định 30 FPS siêu mượt và siêu nhẹ CPU/GPU
 * - Tự động tạm dừng khi ẩn tab (document.hidden)
 * - Laser beams đa sắc quét sàn nhảy, disco sparkles, pháo hoa và mưa confetti khi tặng quà!
 */
class ClubParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.width = 1080;
    this.height = 1920;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.confetti = [];
    this.sparkles = [];
    this.bubbles = [];
    this.fireworks = [];

    this.feverActive = false;
    this.time = 0;
    this.lastFrameTime = 0;
    this.frameInterval = 1000 / 30; // 30 FPS

    this.initAmbientSparkles();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initAmbientSparkles() {
    for (let i = 0; i < 24; i++) {
      this.sparkles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: 3 + Math.random() * 5,
        vy: -(0.5 + Math.random() * 1.2),
        vx: (Math.random() - 0.5) * 0.5,
        alpha: 0.2 + Math.random() * 0.7,
        color: Math.random() > 0.5 ? '#ff007f' : '#00e5ff'
      });
    }
  }

  // Bắn pháo hoa rực rỡ
  addFireworks(x = 540, y = 600, color = '#ffd600') {
    const colors = ['#ff007f', '#00e5ff', '#ffd600', '#76ff03', '#d500f9'];
    for (let i = 0; i < 48; i++) {
      const angle = (Math.PI * 2 * i) / 48;
      const speed = 4 + Math.random() * 8;
      this.fireworks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.18,
        alpha: 1.0,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 4
      });
    }
  }

  // Mưa confetti tiệc tùng
  addConfetti(count = 60) {
    const colors = ['#ff007f', '#00e5ff', '#ffd600', '#76ff03', '#ffffff', '#ff9100'];
    for (let i = 0; i < count; i++) {
      this.confetti.push({
        x: Math.random() * this.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3,
        vy: 4 + Math.random() * 6,
        sizeW: 8 + Math.random() * 8,
        sizeH: 5 + Math.random() * 5,
        rot: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 12,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0
      });
    }
  }

  // Mưa bong bóng disco
  addBubbles(count = 35) {
    for (let i = 0; i < count; i++) {
      this.bubbles.push({
        x: Math.random() * this.width,
        y: this.height + 20 + Math.random() * 100,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(2.5 + Math.random() * 3.5),
        radius: 12 + Math.random() * 18,
        alpha: 0.75,
        wobble: Math.random() * Math.PI * 2
      });
    }
  }

  // Kích hoạt chế độ Sàn Cháy (Fever Mode)
  setFever(active) {
    this.feverActive = !!active;
    if (active) {
      this.addConfetti(100);
      this.addFireworks(300, 500);
      this.addFireworks(780, 500);
    }
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    if (document.hidden) return;

    const elapsed = now - this.lastFrameTime;
    if (elapsed < this.frameInterval) return;
    this.lastFrameTime = now - (elapsed % this.frameInterval);
    this.time += 0.04;

    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Vẽ đốm sáng disco lấp lánh
    this.renderSparkles();

    // 2. Vẽ pháo hoa
    this.renderFireworks();

    // 3. Vẽ confetti rơi
    this.renderConfetti();

    // 4. Vẽ bong bóng bay
    this.renderBubbles();
  }

  renderSparkles() {
    this.ctx.save();
    for (const s of this.sparkles) {
      s.y += s.vy;
      s.x += s.vx;
      if (s.y < 0) s.y = this.height;

      this.ctx.fillStyle = s.color;
      this.ctx.globalAlpha = s.alpha * (0.5 + Math.sin(this.time * 2 + s.x) * 0.5);
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  renderFireworks() {
    this.ctx.save();
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const p = this.fireworks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.alpha -= 0.02;

      if (p.alpha <= 0) {
        this.fireworks.splice(i, 1);
        continue;
      }

      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  renderConfetti() {
    this.ctx.save();
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.vRot;

      if (c.y > this.height + 40) {
        this.confetti.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(c.x, c.y);
      this.ctx.rotate((c.rot * Math.PI) / 180);
      this.ctx.fillStyle = c.color;
      this.ctx.globalAlpha = c.alpha;
      this.ctx.fillRect(-c.sizeW / 2, -c.sizeH / 2, c.sizeW, c.sizeH);
      this.ctx.restore();
    }
    this.ctx.restore();
  }

  renderBubbles() {
    this.ctx.save();
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y += b.vy;
      b.wobble += 0.05;
      b.x += Math.sin(b.wobble) * 1.2;

      if (b.y < -50) {
        this.bubbles.splice(i, 1);
        continue;
      }

      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = b.alpha;
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Highlight
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      this.ctx.beginPath();
      this.ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.25, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }
}

// Global instance & aliases
window.ClubParticleEngine = ClubParticleEngine;
window.FishingParticleEngine = ClubParticleEngine;
window.TempleParticleEngine = ClubParticleEngine;
