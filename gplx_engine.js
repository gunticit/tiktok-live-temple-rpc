/**
 * GPLX Engine - Đấu Trường GPLX: Hạng B - C1 - C
 * Interactive Trivia Game Engine for TikTok Live RPC
 */

const fs = require('fs');
const path = require('path');

class GplxEngine {
  constructor(broadcastCallback) {
    this.broadcast = broadcastCallback || (() => {});
    this.questions = this.loadQuestions();
    this.currentQIndex = 0;
    
    // Tìm câu sa hình đầu tiên nếu có (thường từ câu 486)
    const saHinhIdx = this.questions.findIndex(q => q.id >= 486);
    if (saHinhIdx !== -1) {
      this.currentQIndex = saHinhIdx;
    }

    this.timerRemaining = 15;
    this.timerMax = 15;
    this.isRevealed = false;
    this.multiplier = 1;
    this.onlineLearnersCount = 2418;

    this.syncQuestionState();

    this.leaderboard = [
      { user: '@Minh_B2', points: 820, delta: '+0.4s', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=champion1' },
      { user: '@Thanh_TaiXe_C', points: 790, delta: '+0.6s', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=driver2' },
      { user: '@Phuong_C1', points: 750, delta: '+0.8s', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=driver3' },
      { user: '@Tuan_LaiMoi', points: 710, delta: '+1.1s', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=driver4' },
      { user: '@Hoa_SaHinh', points: 680, delta: '+1.3s', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=driver5' }
    ];

    this.startTimerTicker();
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
        correctKey: 'B',
        image: '/assets/sa_hinh_12.svg'
      }
    ];
  }

  syncQuestionState() {
    const q = this.getCurrentQuestion();
    this.highlightedKey = q.correctKey;
    this.votes = q.mockVotes ? { ...q.mockVotes } : { A: 120, B: 240, C: 45, D: 15 };
    this.stats = {
      accuracyRate: q.accuracyRate || 72,
      avgSpeed: q.avgSpeed || '1.2 giây'
    };
  }

  startTimerTicker() {
    setInterval(() => {
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

  getState() {
    return {
      question: this.getCurrentQuestion(),
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
      leaderboard: this.leaderboard
    };
  }

  broadcastState() {
    this.broadcast('gplx.state', this.getState());
  }

  submitAnswer({ user, uniqueId, avatar, answer }) {
    const rawAnswer = String(answer || '').trim().toUpperCase();
    const validKeys = ['A', 'B', 'C', 'D'];
    if (!validKeys.includes(rawAnswer)) return null;

    this.votes[rawAnswer] = (this.votes[rawAnswer] || 0) + 1;
    this.onlineLearnersCount += Math.floor(Math.random() * 2);

    const q = this.getCurrentQuestion();
    const isCorrect = rawAnswer === q.correctKey;
    const speedSec = ((this.timerMax - this.timerRemaining) + Math.random() * 0.3).toFixed(1);
    const speedText = `+${speedSec}s`;

    if (isCorrect) {
      const earned = (100 + Math.max(0, this.timerRemaining * 10)) * this.multiplier;
      this.highlightedKey = rawAnswer;

      const existing = this.leaderboard.find(p => p.user === user);
      if (existing) {
        existing.points += earned;
        existing.delta = speedText;
      } else {
        this.leaderboard.push({
          user: user || `@HocVien_${uniqueId || 'Live'}`,
          points: earned,
          delta: speedText,
          avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user}`
        });
      }

      this.leaderboard.sort((a, b) => b.points - a.points);
      if (this.leaderboard.length > 5) {
        this.leaderboard = this.leaderboard.slice(0, 5);
      }
    }

    const payload = {
      user: user || 'Học viên',
      answer: rawAnswer,
      isCorrect,
      speed: speedText
    };

    this.broadcast('gplx.answerResult', payload);
    this.broadcastState();
    return payload;
  }

  simulateComment(params) {
    const q = this.getCurrentQuestion();
    const validKeys = q.options.map(o => o.key);
    const ans = params.answer || validKeys[Math.floor(Math.random() * validKeys.length)];
    const mockUsers = ['@Minh_B2', '@Thanh_TaiXe_C', '@Phuong_C1', '@Tuan_LaiMoi', '@Hoa_SaHinh', '@Bao_Ngoc', '@Huy_Tuan', '@Linh_GPLX'];
    const chosenUser = mockUsers[Math.floor(Math.random() * mockUsers.length)];
    return this.submitAnswer({
      user: chosenUser,
      uniqueId: chosenUser.replace('@', ''),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${chosenUser}`,
      answer: ans
    });
  }

  revealAnswer() {
    this.isRevealed = true;
    const q = this.getCurrentQuestion();
    this.highlightedKey = q.correctKey;
    this.broadcastState();

    // Tự động chuyển câu tiếp theo sau 8s
    setTimeout(() => {
      this.nextQuestion();
    }, 8000);
  }

  nextQuestion() {
    this.currentQIndex = (this.currentQIndex + 1) % this.questions.length;
    this.timerRemaining = this.timerMax;
    this.isRevealed = false;
    this.syncQuestionState();
    this.broadcastState();
    return this.getState();
  }

  prevQuestion() {
    this.currentQIndex = (this.currentQIndex - 1 + this.questions.length) % this.questions.length;
    this.timerRemaining = this.timerMax;
    this.isRevealed = false;
    this.syncQuestionState();
    this.broadcastState();
    return this.getState();
  }

  jumpToQuestion(targetId) {
    const num = parseInt(targetId, 10);
    const idx = this.questions.findIndex(q => q.id === num);
    if (idx !== -1) {
      this.currentQIndex = idx;
      this.timerRemaining = this.timerMax;
      this.isRevealed = false;
      this.syncQuestionState();
      this.broadcastState();
      return this.getState();
    }
    return { ok: false, error: 'Không tìm thấy câu hỏi' };
  }

  restartTimer() {
    this.timerRemaining = this.timerMax;
    this.isRevealed = false;
    this.broadcastState();
    return this.getState();
  }

  toggleMultiplier() {
    this.multiplier = this.multiplier === 1 ? 2 : 1;
    this.broadcast('gplx.giftAlert', {
      user: 'Hệ thống Quà Tặng',
      giftName: this.multiplier === 2 ? 'Kích hoạt x2 Điểm' : 'Trở về x1 Điểm'
    });
    this.broadcastState();
    return { multiplier: this.multiplier };
  }
}

module.exports = GplxEngine;
