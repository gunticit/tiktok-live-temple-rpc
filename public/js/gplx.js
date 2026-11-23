/**
 * GPLX Engine - Đấu Trường GPLX: Hạng B - C1 - C
 * TikTok Live Interactive Game Stream Engine (JSON-RPC 2.0 / WebSocket)
 */

class GplxClient {
  constructor() {
    this.ws = null;
    this.state = null;
    this.timerRemaining = 15;
    this.timerMax = 15;
    this.audio = new (window.AudioContext || window.webkitAudioContext)();
    this.initWebSocket();
    this.initEventListeners();
    this.initResizeScaling();
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[GPLX WS] Connected');
      this.updateConnectionStatus(true);
      this.sendRpc('gplx.getState', {});
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'gplx.state') {
          this.onStateUpdate(msg.params);
        } else if (msg.method === 'gplx.answerResult') {
          this.onAnswerReceived(msg.params);
        } else if (msg.method === 'gplx.giftAlert') {
          this.onGiftAlert(msg.params);
        } else if (msg.result && msg.result.question) {
          this.onStateUpdate(msg.result);
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

  onStateUpdate(state) {
    if (!state) return;
    this.state = state;

    // Render Question
    if (state.question) {
      const q = state.question;
      const totalQ = state.totalQuestionsCount || q.totalQuestions || 600;
      document.getElementById('questionCounterText').textContent =
        `CÂU HỎI: ${q.questionNumber || q.id} / ${totalQ}`;
      document.getElementById('questionText').textContent =
        `Câu ${q.questionNumber || q.id}: ${q.question}`;
      
      const fatalBadge = document.getElementById('fatalBadge');
      if (q.isFatal) {
        fatalBadge.style.display = 'flex';
        fatalBadge.textContent = q.fatalLabel || '⚠️ Điểm liệt! (Câu hỏi quan trọng)';
      } else {
        fatalBadge.style.display = 'none';
      }

      // Render Real Exam Image or Sa-hình
      const diagramWrapper = document.querySelector('.question-diagram-wrapper');
      const saHinhImg = document.getElementById('saHinhImage');
      if (q.image) {
        diagramWrapper.style.display = 'flex';
        saHinhImg.src = q.image;
        saHinhImg.style.objectFit = 'contain';
        saHinhImg.style.display = 'block';
      } else {
        diagramWrapper.style.display = 'none';
      }

      // Render Dynamic Answer Options (A, B, C, D)
      const allKeys = ['a', 'b', 'c', 'd'];
      const optMap = {};
      if (Array.isArray(q.options)) {
        q.options.forEach(opt => {
          optMap[opt.key.toLowerCase()] = opt;
        });
      }

      allKeys.forEach(k => {
        const btn = document.getElementById(`optBtn_${k}`);
        if (!btn) return;
        if (optMap[k]) {
          btn.style.display = 'flex';
          const mainLbl = btn.querySelector('.opt-main-label');
          const subDesc = btn.querySelector('.opt-sub-desc');
          if (mainLbl) mainLbl.textContent = optMap[k].text;
          if (subDesc) subDesc.textContent = ''; // clear mock labels
        } else {
          btn.style.display = 'none';
        }
      });
    }

    // Update Highlighted Answer Option
    ['a', 'b', 'c', 'd'].forEach((key) => {
      const btn = document.getElementById(`optBtn_${key}`);
      if (btn) {
        btn.classList.toggle('is-highlighted', state.highlightedKey === key.toUpperCase());
      }
    });

    // Update Votes
    if (state.votes) {
      const v = state.votes;
      const parts = [];
      if (v.A !== undefined) parts.push(`A (${v.A} người)`);
      if (v.B !== undefined) parts.push(`B (${v.B} người)`);
      if (v.C !== undefined) parts.push(`C (${v.C} người)`);
      if (v.D !== undefined) parts.push(`D (${v.D} người)`);
      document.getElementById('voteDistribution').textContent = parts.join(' • ');
    }

    // Update Online Count
    if (state.onlineLearnersCount) {
      document.getElementById('onlineCountText').textContent =
        `👤 Đang online: ${(state.onlineLearnersCount / 1000).toFixed(1)}K người tham gia`;
    }

    // Update Stats
    if (state.stats) {
      document.getElementById('accuracyStatsText').textContent =
        `✓ Tỷ lệ đúng: ${state.stats.accuracyRate || 68}% • Thời gian trung bình: ${state.stats.avgSpeed || '1.2 giây'}`;
    }

    // Update Leaderboard
    if (Array.isArray(state.leaderboard)) {
      this.renderLeaderboard(state.leaderboard);
    }

    // Update Timer
    if (state.timerRemaining !== undefined) {
      this.timerRemaining = state.timerRemaining;
      this.timerMax = state.timerMax || 15;
      this.renderTimer();
    }
  }

  renderLeaderboard(ranks) {
    if (!ranks || ranks.length < 5) return;
    
    // #1 Center
    const r1 = ranks[0];
    document.getElementById('podiumUser1').textContent = r1.user;
    document.getElementById('podiumScore1').textContent = `${r1.points}đ`;
    document.getElementById('podiumDelta1').textContent = r1.delta;
    if (r1.avatar) document.getElementById('podiumAvatar1').src = r1.avatar;

    // #2 Left
    const r2 = ranks[1];
    document.getElementById('podiumUser2').textContent = r2.user;
    document.getElementById('podiumScore2').textContent = `${r2.points}đ`;
    document.getElementById('podiumDelta2').textContent = r2.delta;
    if (r2.avatar) document.getElementById('podiumAvatar2').src = r2.avatar;

    // #3 Right
    const r3 = ranks[2];
    document.getElementById('podiumUser3').textContent = r3.user;
    document.getElementById('podiumScore3').textContent = `${r3.points}đ`;
    document.getElementById('podiumDelta3').textContent = r3.delta;
    if (r3.avatar) document.getElementById('podiumAvatar3').src = r3.avatar;

    // #4
    const r4 = ranks[3];
    document.getElementById('runnerUser4').textContent = r4.user;
    document.getElementById('runnerScore4').textContent = `${r4.points}đ • ${r4.delta}`;
    if (r4.avatar) document.getElementById('runnerAvatar4').src = r4.avatar;

    // #5
    const r5 = ranks[4];
    document.getElementById('runnerUser5').textContent = r5.user;
    document.getElementById('runnerScore5').textContent = `${r5.points}đ • ${r5.delta}`;
    if (r5.avatar) document.getElementById('runnerAvatar5').src = r5.avatar;
  }

  renderTimer() {
    const secEl = document.getElementById('timerSeconds');
    const msEl = document.getElementById('timerMs');
    const circle = document.getElementById('timerCircleProgress');

    const totalSeconds = Math.max(0, this.timerRemaining);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    
    secEl.textContent = `${mm}:${ss}`;
    msEl.textContent = `${ss}`;

    const circumference = 314.16;
    const progress = Math.max(0, Math.min(1, this.timerRemaining / this.timerMax));
    const offset = circumference * (1 - progress);
    circle.style.strokeDashoffset = offset;

    if (this.timerRemaining <= 5) {
      circle.style.stroke = '#ef4444';
      secEl.style.textShadow = '0 0 16px rgba(239, 68, 68, 0.9)';
    } else {
      circle.style.stroke = '#ff5722';
      secEl.style.textShadow = '0 0 12px rgba(255, 87, 34, 0.8)';
    }
  }

  playBeep(freq = 600, duration = 0.1) {
    try {
      if (this.audio.state === 'suspended') this.audio.resume();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audio.currentTime);
      gain.gain.setValueAtTime(0.15, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + duration);
    } catch (_) {}
  }

  onAnswerReceived(data) {
    this.playBeep(880, 0.12);
    this.logDockEvent(`💬 [${data.user}] chọn đáp án [${data.answer}] (${data.speed})`);
  }

  onGiftAlert(data) {
    this.playBeep(1200, 0.3);
    this.logDockEvent(`🎁 [${data.user}] tặng ${data.giftName}! Nhân đôi điểm x2 kích hoạt!`);
  }

  logDockEvent(text) {
    const feed = document.getElementById('dockEventFeed');
    if (!feed) return;
    const item = document.createElement('div');
    item.textContent = text;
    item.style.padding = '4px 0';
    item.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    feed.prepend(item);
    if (feed.children.length > 50) feed.removeChild(feed.lastChild);
  }

  initEventListeners() {
    ['a', 'b', 'c', 'd'].forEach((key) => {
      const btn = document.getElementById(`optBtn_${key}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.playBeep(520, 0.08);
          this.sendRpc('gplx.submitAnswer', {
            user: '@HocVien_Demo',
            uniqueId: 'demo_user',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=user_demo',
            answer: key.toUpperCase()
          });
        });
      }
    });

    const btnSimA = document.getElementById('btnSimA');
    if (btnSimA) btnSimA.onclick = () => this.sendRpc('gplx.simulateComment', { answer: 'A' });
    const btnSimB = document.getElementById('btnSimB');
    if (btnSimB) btnSimB.onclick = () => this.sendRpc('gplx.simulateComment', { answer: 'B' });
    const btnSimC = document.getElementById('btnSimC');
    if (btnSimC) btnSimC.onclick = () => this.sendRpc('gplx.simulateComment', { answer: 'C' });
    const btnSimD = document.getElementById('btnSimD');
    if (btnSimD) btnSimD.onclick = () => this.sendRpc('gplx.simulateComment', { answer: 'D' });

    const btnNextQ = document.getElementById('btnNextQ');
    if (btnNextQ) btnNextQ.onclick = () => this.sendRpc('gplx.nextQuestion', {});
    const btnPrevQ = document.getElementById('btnPrevQ');
    if (btnPrevQ) btnPrevQ.onclick = () => this.sendRpc('gplx.prevQuestion', {});
    
    const btnJumpQ = document.getElementById('btnJumpQ');
    if (btnJumpQ) {
      btnJumpQ.onclick = () => {
        const val = document.getElementById('inputJumpQ').value.trim();
        if (val) this.sendRpc('gplx.jumpToQuestion', { id: val });
      };
    }

    const btnRestartTimer = document.getElementById('btnRestartTimer');
    if (btnRestartTimer) btnRestartTimer.onclick = () => this.sendRpc('gplx.restartTimer', {});
    const btnTogglex2 = document.getElementById('btnTogglex2');
    if (btnTogglex2) btnTogglex2.onclick = () => this.sendRpc('gplx.toggleMultiplier', {});

    const btnConnect = document.getElementById('btnConnectTikTok');
    if (btnConnect) {
      btnConnect.onclick = () => {
        const username = document.getElementById('inputTikTokUser').value.trim();
        if (username) {
          this.sendRpc('tiktok.connect', { username });
          this.logDockEvent(`📡 Đang kết nối tới TikTok Live của ${username}...`);
        }
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
