/**
 * Fishing Lake Live Controller & WebSocket Client
 * - Tự động co giãn khung hình 9:16 (1080x1920) chuẩn xác theo màn hình
 * - Kết nối thời gian thực qua WebSocket (/ws) với JSON-RPC 2.0
 * - Điều phối hiệu ứng phao câu, cần thủ, âm thanh và giọng đọc ZeroTTS Mai Chi
 */
(function () {
  'use strict';

  // 1. Kiểm tra tham số ?obs=1 để kích hoạt chế độ OBS Studio sạch (không dock)
  const urlParams = new URLSearchParams(window.location.search);
  const isObsMode = urlParams.get('obs') === '1' || urlParams.get('obs') === 'true';
  if (isObsMode) {
    document.body.classList.add('obs-mode');
  }

  // 2. Tự động co giãn 9:16 (Auto Scale)
  const stage = document.getElementById('stage9x16');
  const stageWrapper = document.getElementById('stageWrapper');

  function resizeStage() {
    if (!stage || !stageWrapper) return;
    const availWidth = stageWrapper.clientWidth;
    const availHeight = stageWrapper.clientHeight;
    const scale = Math.min(availWidth / 1080, availHeight / 1920);
    stage.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', resizeStage);
  resizeStage();

  // 3. Khởi tạo Canvas Particle Engine
  const canvas = document.getElementById('fishingCanvas');
  let particleEngine = null;
  if (canvas && window.FishingParticleEngine) {
    particleEngine = new window.FishingParticleEngine(canvas);
  }

  // 4. Các phần tử DOM chính
  const shoreAnglersContainer = document.getElementById('shoreAnglersContainer');
  const lakeBobbersLayer = document.getElementById('lakeBobbersLayer');
  const lakeFishingLinesSvg = document.getElementById('lakeFishingLinesSvg');

  const statCatches = document.getElementById('statCatches');
  const statWeight = document.getElementById('statWeight');
  const statBait = document.getElementById('statBait');
  const statHorn = document.getElementById('statHorn');

  const liveStatusText = document.getElementById('liveStatusText');
  const liveDot = document.getElementById('liveDot');

  const activeAnglerName = document.getElementById('activeAnglerName');
  const activeActionTag = document.getElementById('activeActionTag');
  const activeAnglerAvatar = document.getElementById('activeAnglerAvatar');
  const activeAnglerIcon = document.getElementById('activeAnglerIcon');
  const leaderboardList = document.getElementById('leaderboardList');
  const eventFeed = document.getElementById('eventFeed');

  // Mục tiêu cộng đồng & Chat nổi
  const communityGoalBar = document.getElementById('communityGoalBar');
  const cgTitle = document.getElementById('cgTitle');
  const cgCurrent = document.getElementById('cgCurrent');
  const cgTarget = document.getElementById('cgTarget');
  const cgFill = document.getElementById('cgFill');
  const liveChatOverlay = document.getElementById('liveChatOverlay');

  // Gift Alert Toast
  const giftAlertToast = document.getElementById('giftAlertToast');
  const giftAlertAvatar = document.getElementById('giftAlertAvatar');
  const giftAlertSender = document.getElementById('giftAlertSender');
  const giftAlertAction = document.getElementById('giftAlertAction');
  const giftAlertBadge = document.getElementById('giftAlertBadge');

  // Modal & Banner
  const catchModal = document.getElementById('catchModal');
  const catchBadge = document.getElementById('catchBadge');
  const catchIcon = document.getElementById('catchIcon');
  const catchFishName = document.getElementById('catchFishName');
  const catchWeight = document.getElementById('catchWeight');
  const catchAnglerName = document.getElementById('catchAnglerName');
  const catchAnglerTitle = document.getElementById('catchAnglerTitle');
  const catchAnglerAvatarImg = document.getElementById('catchAnglerAvatarImg');
  const catchQuote = document.getElementById('catchQuote');

  const leviathanBanner = document.getElementById('leviathanBanner');
  const leviathanTitle = document.getElementById('leviathanTitle');
  const leviathanSub = document.getElementById('leviathanSub');
  const leviathanAvatar = document.getElementById('leviathanAvatar');

  // Helper avatar fallback an toàn
  function getSafeAvatarUrl(avatarUrl, user) {
    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('http')) {
      return avatarUrl;
    }
    const seed = encodeURIComponent(user || 'Angler');
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
  }

  function updateAvatarElement(imgElem, fallbackElem, avatarUrl, user) {
    if (!imgElem) return;
    const url = getSafeAvatarUrl(avatarUrl, user);
    imgElem.src = url;
    imgElem.style.display = 'block';
    if (fallbackElem) fallbackElem.style.display = 'none';
    imgElem.onerror = () => {
      imgElem.onerror = null;
      imgElem.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user || 'user')}`;
    };
  }

  // Helper hiển thị dòng chat nổi phong cách TikTok Live
  function appendLiveChatPill({ user, avatar, comment, isGift = false }) {
    if (!liveChatOverlay) return;
    const pill = document.createElement('div');
    pill.className = `chat-pill ${isGift ? 'gift-pill' : ''}`;
    const avatarUrl = getSafeAvatarUrl(avatar, user);
    pill.innerHTML = `
      <img src="${avatarUrl}" class="chat-pill-avatar" alt="" onerror="this.onerror=null; this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user)}'" />
      <div class="chat-pill-content">
        <div class="chat-pill-user">${user}</div>
        <div class="chat-pill-text">${comment}</div>
      </div>
    `;
    liveChatOverlay.appendChild(pill);
    while (liveChatOverlay.children.length > 5) {
      liveChatOverlay.removeChild(liveChatOverlay.firstChild);
    }
    setTimeout(() => {
      if (pill && pill.parentNode === liveChatOverlay) {
        pill.style.opacity = '0';
        pill.style.transition = 'opacity 0.6s ease';
        setTimeout(() => {
          if (pill && pill.parentNode === liveChatOverlay) {
            liveChatOverlay.removeChild(pill);
          }
        }, 600);
      }
    }, 6500);
  }

  // Helper hiển thị Popup Toast thông báo Donate Quà Tặng
  let giftToastTimer = null;
  function showGiftAlert(ev) {
    if (!giftAlertToast) return;
    if (giftAlertAvatar) {
      giftAlertAvatar.src = getSafeAvatarUrl(ev.avatar, ev.user);
      giftAlertAvatar.onerror = () => {
        giftAlertAvatar.onerror = null;
        giftAlertAvatar.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(ev.user || 'vip')}`;
      };
    }
    if (giftAlertSender) giftAlertSender.textContent = ev.user;
    if (giftAlertAction) {
      const rep = ev.repeatCount > 1 ? `x${ev.repeatCount}` : '';
      giftAlertAction.innerHTML = `Vừa tặng <strong>${ev.giftName || 'Quà Tặng'}</strong> ${ev.giftIcon || '🎁'} ${rep}`;
    }
    if (giftAlertBadge) {
      giftAlertBadge.textContent = `${ev.coins || 1} 🪙`;
    }

    giftAlertToast.classList.add('active');
    clearTimeout(giftToastTimer);
    giftToastTimer = setTimeout(() => {
      giftAlertToast.classList.remove('active');
    }, 4500);
  }

  // 4.3. HỆ THỐNG ĐA CẦN THỦ NGỒI VÒNG QUANH HỒ (SHORE ANGLERS RING)
  let cachedLakeAnglers = [];

  function calculateRodTip(a) {
    let rodTipX = a.shoreX;
    let rodTipY = a.shoreY;
    if (a.dir === 'down') {
      rodTipX = a.shoreX + 18;
      rodTipY = a.shoreY + 45;
    } else if (a.dir === 'right') {
      rodTipX = a.shoreX + 48;
      rodTipY = a.shoreY + 12;
    } else if (a.dir === 'left') {
      rodTipX = a.shoreX - 48;
      rodTipY = a.shoreY + 12;
    } else if (a.dir === 'up') {
      rodTipX = a.shoreX - 12;
      rodTipY = a.shoreY - 55;
    }
    return { rodTipX, rodTipY };
  }

  function renderShoreRingSystem(anglers) {
    if (!Array.isArray(anglers)) return;
    cachedLakeAnglers = anglers;

    // A. Vẽ các cần thủ ngồi ven bờ hồ
    if (shoreAnglersContainer) {
      shoreAnglersContainer.innerHTML = '';
      anglers.forEach((a) => {
        const seat = document.createElement('div');
        seat.id = `shoreSeat_${a.slotIndex}`;
        seat.className = `shore-angler-seat dir-${a.dir || 'up'}${a.rank <= 3 ? ' rank-' + a.rank : ''}`;
        seat.style.left = `${a.shoreX}px`;
        seat.style.top = `${a.shoreY}px`;
        seat.style.setProperty('--slot-scale', a.scale || 1);
        seat.style.setProperty('--slot-z', a.zIndex || 14);

        const avatarUrl = getSafeAvatarUrl(a.avatar, a.user);
        const rankMedal = a.rank === 1 ? '🥇' : a.rank === 2 ? '🥈' : a.rank === 3 ? '🥉' : `#${a.rank}`;
        const hatHtml = a.rank === 1
          ? '<span class="crown-top1">👑</span>'
          : '<div class="vietnamese-non-la"></div>';

        seat.innerHTML = `
          <div class="angler-speech-bubble" id="speechBubble_${a.slotIndex}">${a.wish || 'Đang thả mồi săn cá to...'}</div>
          <div class="angler-assembly">
            <div class="angler-camp-chair"></div>
            <div class="angler-fish-creel">
              <span class="creel-count-tag" id="creelCount_${a.slotIndex}">${a.catchesCount || (a.fish ? 1 : 0)}</span>
            </div>
            <div class="angler-body-figure">
              <div class="angler-hat-crown">${hatHtml}</div>
              <div class="angler-head-avatar">
                <img src="${avatarUrl}" class="angler-avatar-face" alt="${a.user}" onerror="this.onerror=null; this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(a.user)}'" />
              </div>
              <div class="angler-vest-torso">
                <div class="vest-pocket"></div>
                <div class="vest-pocket"></div>
              </div>
            </div>
            <div class="angler-fishing-rod-wrap">
              <div class="rod-carbon-pole">
                <div class="rod-tip-guide"></div>
              </div>
            </div>
          </div>
          <div class="angler-seat-tag">
            <span class="seat-rank-badge">${rankMedal}</span>
            <span class="seat-user-name">${a.user}</span>
            <span class="seat-catch-kg">${a.totalWeightKg || 0}kg</span>
          </div>
        `;

        seat.addEventListener('click', () => {
          window.FishingAudio?.ensureContext();
          callRpc('fishing.hookFish', { user: a.user, uniqueId: a.uniqueId, avatar: a.avatar });
        });

        shoreAnglersContainer.appendChild(seat);
      });
    }

    // B. Vẽ các phao câu nổi trên mặt hồ
    if (lakeBobbersLayer) {
      lakeBobbersLayer.innerHTML = '';
      anglers.forEach((a) => {
        const buoy = document.createElement('div');
        buoy.id = `lakeBobber_${a.slotIndex}`;
        buoy.className = 'lake-bobber-buoy';
        buoy.style.left = `${a.waterX}px`;
        buoy.style.top = `${a.waterY}px`;

        buoy.innerHTML = `
          <div class="bobber-body-unit">
            <div class="bobber-antenna-tip"></div>
            <div class="bobber-egg-float"></div>
          </div>
          <div class="bobber-ripples-ring-wrap">
            <div class="bobber-lake-ripple"></div>
            <div class="bobber-lake-ripple"></div>
          </div>
          <div class="bobber-user-micro-tag">${a.user}</div>
        `;

        buoy.addEventListener('click', () => {
          window.FishingAudio?.ensureContext();
          callRpc('fishing.hookFish', { user: a.user, uniqueId: a.uniqueId, avatar: a.avatar });
        });

        lakeBobbersLayer.appendChild(buoy);
      });
    }

    // C. Vẽ các đường dây cước câu mềm mại bằng SVG
    if (lakeFishingLinesSvg) {
      lakeFishingLinesSvg.innerHTML = '';
      anglers.forEach((a) => {
        const { rodTipX, rodTipY } = calculateRodTip(a);
        const midX = (rodTipX + a.waterX) / 2;
        const midY = (rodTipY + a.waterY) / 2 + 25;
        const d = `M ${rodTipX} ${rodTipY} Q ${midX} ${midY} ${a.waterX} ${a.waterY}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('id', `linePath_${a.slotIndex}`);
        path.setAttribute('class', 'lake-line-path');
        path.setAttribute('d', d);
        lakeFishingLinesSvg.appendChild(path);
      });
    }
  }

  function triggerShoreSlotAction(slotIndex, actionType, ev) {
    if (slotIndex === undefined || slotIndex === null || slotIndex < 0) return;
    const seat = document.getElementById(`shoreSeat_${slotIndex}`);
    const buoy = document.getElementById(`lakeBobber_${slotIndex}`);
    const line = document.getElementById(`linePath_${slotIndex}`);
    const bubble = document.getElementById(`speechBubble_${slotIndex}`);
    const creel = document.getElementById(`creelCount_${slotIndex}`);

    if (actionType === 'hookFish' || actionType === 'catchBigFish' || actionType === 'catchLeviathan' || actionType === 'gift') {
      if (seat) {
        seat.classList.add('reeling');
        setTimeout(() => seat.classList.remove('reeling'), 3200);
      }
      if (buoy) {
        buoy.classList.add('hooked');
        setTimeout(() => buoy.classList.remove('hooked'), 3200);
      }
      if (line) {
        line.classList.add('reeling');
        setTimeout(() => line.classList.remove('reeling'), 3200);
      }
      if (creel && ev.fish) {
        const cur = parseInt(creel.textContent || '0', 10);
        creel.textContent = cur + 1;
      }
      if (bubble) {
        clearInterval(bubble._cdTimer);
        let text = ev.wish || '';
        if (ev.type === 'gift') {
          text = `🎁 Cảm ơn quà ${ev.giftName || ''}! Bắt được ${ev.fish?.name || 'cá to'}!`;
        } else if (ev.fish) {
          text = `🎉 Giật được ${ev.fish.name} (${ev.weightKg}kg)!`;
        }
        bubble.textContent = text;
        bubble.classList.add('active');
        clearTimeout(bubble._bubbleTimer);
        bubble._bubbleTimer = setTimeout(() => bubble.classList.remove('active'), 5000);
      }
    } else if (actionType === 'castRod') {
      if (line) {
        line.classList.add('reeling');
        setTimeout(() => line.classList.remove('reeling'), 800);
      }
      if (bubble) {
        clearInterval(bubble._cdTimer);
        let secLeft = ev.durationSec || ev.remainingSec || 60;
        bubble.textContent = `⏱️ Đang đợi cá... ${secLeft}s`;
        bubble.classList.add('active');
        bubble._cdTimer = setInterval(() => {
          secLeft--;
          if (secLeft > 0) {
            bubble.textContent = `⏱️ Đang đợi cá... ${secLeft}s`;
          } else {
            clearInterval(bubble._cdTimer);
            bubble.textContent = '🐟 Cá đang đớp phao! Sắp giật!';
          }
        }, 1000);
      }
    } else if (actionType === 'waitingFish') {
      if (bubble) {
        clearInterval(bubble._cdTimer);
        let secLeft = ev.remainingSec || 30;
        bubble.textContent = `⏳ Đang câu cá... Còn ${secLeft}s nữa!`;
        bubble.classList.add('active');
        bubble._cdTimer = setInterval(() => {
          secLeft--;
          if (secLeft > 0) {
            bubble.textContent = `⏳ Đang câu cá... Còn ${secLeft}s nữa!`;
          } else {
            clearInterval(bubble._cdTimer);
            bubble.textContent = '🐟 Cá đang đớp phao!';
          }
        }, 1000);
      }
    } else if (bubble) {
      let text = ev.wish || '';
      if (actionType === 'soundHorn') text = '📯 Báo cá! Chúc cả bến hồ cùng phát tài!';
      else if (actionType === 'castBait') text = `🪱 Thả ${ev.count || 5} nắm thính thơm!`;
      if (text) {
        bubble.textContent = text;
        bubble.classList.add('active');
        clearTimeout(bubble._bubbleTimer);
        bubble._bubbleTimer = setTimeout(() => bubble.classList.remove('active'), 4500);
      }
    }

    // Hiệu ứng hạt nước tại phao của cần thủ đó
    const targetAngler = cachedLakeAnglers.find(a => a.slotIndex === slotIndex);
    if (targetAngler && particleEngine) {
      const isBig = ev.type === 'catchBigFish' || ev.type === 'catchLeviathan' || (ev.coins && ev.coins >= 5);
      if (ev.type === 'castBait') {
        particleEngine.addBaitDrop(targetAngler.waterX, targetAngler.waterY, ev.count || 3);
      } else if (actionType === 'castRod') {
        particleEngine.addBaitDrop(targetAngler.waterX, targetAngler.waterY, 1);
      } else if (actionType !== 'waitingFish') {
        particleEngine.addFishCatch(targetAngler.waterX, targetAngler.waterY, isBig);
      }
    }
  }

  // 5. Kết nối WebSocket (/ws)
  let ws = null;
  let wsRetryTimer = null;

  function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Đã kết nối tới server hồ câu!');
      if (liveDot) liveDot.style.background = '#00e676';
    };

    ws.onclose = () => {
      console.warn('[WebSocket] Mất kết nối, tự kết nối lại sau 2.5s...');
      if (liveDot) liveDot.style.background = '#ff5252';
      clearTimeout(wsRetryTimer);
      wsRetryTimer = setTimeout(connectWs, 2500);
    };

    ws.onerror = (err) => {
      console.warn('[WebSocket Error]', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (_) {}
    };
  }

  function handleWsMessage(msg) {
    if (!msg) return;

    // Trạng thái hồ câu
    if (msg.method === 'fishing.state' || msg.method === 'temple.state') {
      updatePublicState(msg.params);
    }
    // Sự kiện chat trực tiếp kèm avatar
    else if (msg.method === 'fishing.chat') {
      const chatData = msg.params;
      if (chatData) {
        appendLiveChatPill({
          user: chatData.user,
          avatar: chatData.avatar,
          comment: chatData.comment,
          isGift: false
        });
      }
    }
    // Sự kiện giờ vàng bão cá
    else if (msg.method === 'fishing.frenzy') {
      window.FishingAudio?.playCelebrationChime();
      if (communityGoalBar) {
        communityGoalBar.classList.add('frenzy-active');
        if (cgTitle) cgTitle.textContent = '🔥 GIỜ VÀNG BÃO CÁ HỒ SÂU (X2) 🔥';
      }
      if (particleEngine) {
        particleEngine.addFishCatch(540, 1150, true);
      }
    }
    // Sự kiện tương tác thời gian thực
    else if (msg.method === 'fishing.event' || msg.method === 'temple.event') {
      const eventData = msg.params?.event;
      if (eventData) {
        handleFishingEvent(eventData);
      }
      if (msg.params?.state) {
        updatePublicState(msg.params.state);
      }
    }
    // Số người xem live
    else if (msg.method === 'fishing.viewerCount' || msg.method === 'temple.viewerCount') {
      const count = msg.params?.viewerCount || 0;
      if (liveStatusText) {
        liveStatusText.textContent = `HỒ CÂU CÁ • ${count} NGƯỜI XEM`;
      }
    }
  }

  // 6. Cập nhật giao diện hồ câu từ trạng thái
  function updatePublicState(st) {
    if (!st) return;

    if (statCatches) statCatches.textContent = st.totalCatches ?? 0;
    if (statWeight) statWeight.textContent = st.totalWeightKg ?? '0.0';
    if (statBait) statBait.textContent = st.totalBait ?? 0;
    if (statHorn) statHorn.textContent = st.hornsBlown ?? 0;

    // Cập nhật mục tiêu cộng đồng
    if (st.communityGoal && communityGoalBar) {
      const cur = st.communityGoal.current || 0;
      const tgt = st.communityGoal.target || 500;
      if (cgCurrent) cgCurrent.textContent = cur;
      if (cgTarget) cgTarget.textContent = tgt;
      const pct = Math.min(100, Math.max(0, Math.round((cur / tgt) * 100)));
      if (cgFill) cgFill.style.width = `${pct}%`;

      const isFrenzy = !!st.communityGoal.frenzyActive;
      communityGoalBar.classList.toggle('frenzy-active', isFrenzy);
      if (cgTitle) {
        cgTitle.textContent = isFrenzy
          ? '🔥 GIỜ VÀNG BÃO CÁ HỒ SÂU (X2) 🔥'
          : '🌊 MỤC TIÊU BÃO CÁ CỘNG ĐỒNG';
      }
    }

    // Cập nhật hệ thống cần thủ ngồi vòng quanh bờ hồ (18 vị trí)
    if (Array.isArray(st.activeAnglers)) {
      renderShoreRingSystem(st.activeAnglers);
    }

    // Cập nhật bảng xếp hạng VUA SÁT CÁ
    if (leaderboardList && Array.isArray(st.leaderboard)) {
      renderLeaderboard(st.leaderboard);
    }

    // Cập nhật trạng thái TikTok
    if (st.tiktok && liveStatusText) {
      if (st.tiktok.connected) {
        liveStatusText.textContent = `@${st.tiktok.username} • ${st.tiktok.viewerCount || 0} NGƯỜI XEM`;
        if (liveDot) liveDot.style.background = '#00e676';
      } else if (st.tiktok.connecting) {
        liveStatusText.textContent = `ĐANG KẾT NỐI @${st.tiktok.username}...`;
        if (liveDot) liveDot.style.background = '#ffea00';
      } else {
        liveStatusText.textContent = 'HỒ CÂU CÁ GIẢI TRÍ • TRỰC TIẾP';
        if (liveDot) liveDot.style.background = '#00e676';
      }
    }
  }

  function renderLeaderboard(board) {
    leaderboardList.innerHTML = '';
    board.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const medal = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `${item.rank}.`;
      row.innerHTML = `
        <div class="lb-left">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name" title="${item.name}">${item.name}</span>
        </div>
        <div class="lb-weight">${item.totalWeightKg}kg</div>
      `;
      leaderboardList.appendChild(row);
    });
  }

  // 7. Xử lý hoạt ảnh sự kiện tương tác
  let catchModalTimer = null;
  let bannerTimer = null;

  function handleFishingEvent(ev) {
    appendEventFeed(ev);

    // Kích hoạt hoạt ảnh cần thủ cụ thể trên bờ hồ
    let slotIdx = ev.slotIndex;
    if ((slotIdx === undefined || slotIdx === null) && cachedLakeAnglers.length > 0) {
      const matched = cachedLakeAnglers.find(a => (ev.uniqueId && a.uniqueId === ev.uniqueId) || a.user === ev.user);
      if (matched) slotIdx = matched.slotIndex;
    }
    if (slotIdx !== undefined && slotIdx !== null) {
      triggerShoreSlotAction(slotIdx, ev.type, ev);
    }

    // Cập nhật Avatar & Tên trên thanh thông báo HUD đáy
    updateAvatarElement(activeAnglerAvatar, null, ev.avatar, ev.user);
    if (activeAnglerName) activeAnglerName.textContent = ev.user;

    // Kích hoạt âm thanh & giọng đọc
    const audio = window.FishingAudio;

    switch (ev.type) {
      // 0. Tặng quà TikTok Live (Hoa hồng, Đỉnh, GG, Tay cầm, Bắn tim, Chú heo...)
      case 'gift':
        const isLeviathanGift = !!ev.isLeviathan;

        // Âm thanh quà tặng fanfare
        if (audio) {
          audio.playGiftFanfare(ev.coins || 1);
          setTimeout(() => audio.playFishSplash(), 300);
        }

        // Hiển thị Popup Toast quà tặng nổi bật
        showGiftAlert(ev);

        // Hiển thị pill quà tặng trên Live Chat stream
        appendLiveChatPill({
          user: ev.user,
          avatar: ev.avatar,
          comment: `🎁 Đã tặng ${ev.giftName} ${ev.giftIcon} (${ev.coins} xu)!`,
          isGift: true
        });

        if (activeActionTag) activeActionTag.textContent = `Vừa tặng ${ev.giftName} (${ev.coins} xu)`;

        // Banner Thủy Quái nếu quà lớn >= 100 xu (Tay cầm chơi game)
        if (isLeviathanGift && leviathanBanner) {
          if (leviathanAvatar) {
            leviathanAvatar.src = getSafeAvatarUrl(ev.avatar, ev.user);
            leviathanAvatar.onerror = () => {
              leviathanAvatar.onerror = null;
              leviathanAvatar.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(ev.user)}`;
            };
          }
          leviathanTitle.textContent = `🐉 ${ev.fish?.name?.toUpperCase() || 'THỦY QUÁI XUẤT THẾ'} 🐉`;
          leviathanSub.textContent = `Đại gia ${ev.user} tặng ${ev.giftName}, kéo lên ${ev.fish?.name || 'Thủy Quái'} (${ev.weightKg}kg)!`;
          leviathanBanner.classList.add('active');
          clearTimeout(bannerTimer);
          bannerTimer = setTimeout(() => {
            leviathanBanner.classList.remove('active');
          }, 7500);
        }

        // Mở Modal Chiến Tích Bắt Cá đồng bộ Avatar & Giọng Đọc
        if (ev.fish && catchModal) {
          catchBadge.textContent = ev.fish.rarity || 'QUÝ HIẾM';
          catchBadge.style.background = ev.fish.badgeColor || '#fbc02d';
          catchIcon.textContent = ev.fish.icon || '🐟';
          catchFishName.textContent = ev.fish.name || 'Cá Quý';
          catchWeight.textContent = `${ev.weightKg} kg`;
          if (catchAnglerAvatarImg) catchAnglerAvatarImg.src = getSafeAvatarUrl(ev.avatar, ev.user);
          if (catchAnglerTitle) catchAnglerTitle.textContent = `Đại Gia Tặng ${ev.giftName} 👑`;
          if (catchAnglerName) catchAnglerName.textContent = ev.user;
          catchQuote.textContent = `“${ev.fish.quote || ''}”`;

          catchModal.classList.add('active');
          clearTimeout(catchModalTimer);
          catchModalTimer = setTimeout(() => {
            catchModal.classList.remove('active');
          }, 6500);
        }

        // Phát giọng đọc ZeroTTS
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText, {
            onStart: () => {
              if (catchModal && !catchModal.classList.contains('active')) {
                catchModal.classList.add('active');
              }
            },
            onEnd: () => {
              if (catchModal) catchModal.classList.remove('active');
            }
          });
        }
        break;

      // 1. Thả thính / Ném mồi
      case 'castBait':
        if (audio) audio.playWaterDrop();
        if (activeActionTag) activeActionTag.textContent = `Thả ${ev.count || 1} nắm thính thơm`;
        appendLiveChatPill({
          user: ev.user,
          avatar: ev.avatar,
          comment: `🪱 Thả ${ev.count || 1} nắm thính thơm dụ cá`
        });
        break;

      // 1.5. Đang kiên nhẫn đợi cá cắn câu
      case 'waitingFish':
        if (activeActionTag) activeActionTag.textContent = `Đang đợi cá cắn câu (còn ${ev.remainingSec}s)`;
        appendLiveChatPill({
          user: ev.user,
          avatar: ev.avatar,
          comment: `⏳ Đang buông cần... Còn ${ev.remainingSec}s cá sẽ cắn!`
        });
        break;

      // 2. Quăng cần (Khởi đầu phiên câu 1 phút)
      case 'castRod':
        if (audio) {
          audio.playRodWhoosh();
          audio.playWaterDrop(1.2);
        }
        if (activeActionTag) activeActionTag.textContent = 'Buông cần câu cá (đợi 1 phút)';
        appendLiveChatPill({
          user: ev.user,
          avatar: ev.avatar,
          comment: `🎣 Buông cần câu cá: ${ev.wish || 'Chờ 1 phút cá cắn câu'} ⏱️`
        });

        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;

      // 3. Giật cần lên cá (Hook Fish)
      case 'hookFish':
      case 'catchBigFish':
      case 'catchLeviathan':
        const isLeviathan = ev.type === 'catchLeviathan';
        const isBig = ev.type === 'catchBigFish' || isLeviathan;

        // Âm thanh
        if (audio) {
          audio.playReelClick(12, 35);
          setTimeout(() => audio.playFishSplash(), 350);
          if (isBig) {
            setTimeout(() => audio.playCelebrationChime(), 800);
          }
        }

        if (activeActionTag) {
          activeActionTag.textContent = `Vừa giật được ${ev.fish?.name || 'Cá to'} ${ev.weightKg}kg`;
        }

        appendLiveChatPill({
          user: ev.user,
          avatar: ev.avatar,
          comment: `🐟 Giật được ${ev.fish?.name || 'Cá'} (${ev.weightKg}kg)!`
        });

        // Mở Modal Chiến Tích Bắt Cá đồng bộ Giọng Đọc & Avatar
        if (ev.fish && catchModal) {
          catchBadge.textContent = ev.fish.rarity || 'PHỔ THÔNG';
          catchBadge.style.background = ev.fish.badgeColor || '#fbc02d';
          catchIcon.textContent = ev.fish.icon || '🐟';
          catchFishName.textContent = ev.fish.name || 'Cá Nước Ngọt';
          catchWeight.textContent = `${ev.weightKg} kg`;
          if (catchAnglerAvatarImg) catchAnglerAvatarImg.src = getSafeAvatarUrl(ev.avatar, ev.user);
          if (catchAnglerTitle) catchAnglerTitle.textContent = ev.title || 'Cần Thủ Bờ Hồ';
          if (catchAnglerName) catchAnglerName.textContent = ev.user;
          catchQuote.textContent = `“${ev.fish.quote || ''}”`;

          catchModal.classList.add('active');
          clearTimeout(catchModalTimer);
          catchModalTimer = setTimeout(() => {
            catchModal.classList.remove('active');
          }, 6500);
        }

        // Phát giọng đọc ZeroTTS
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText, {
            onStart: () => {
              if (catchModal && !catchModal.classList.contains('active')) {
                catchModal.classList.add('active');
              }
            },
            onEnd: () => {
              if (catchModal) catchModal.classList.remove('active');
            }
          });
        }
        break;

      // 4. Thổi còi báo cá
      case 'soundHorn':
        if (audio) audio.playAirHorn();
        if (activeActionTag) activeActionTag.textContent = 'Thổi còi báo cá vang rền bến hồ';
        appendLiveChatPill({
          user: ev.user,
          avatar: ev.avatar,
          comment: `📯 Thổi còi báo cá rộn rã bến hồ!`
        });
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;
    }
  }

  function appendEventFeed(ev) {
    if (!eventFeed) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    item.innerHTML = `<strong>[${timeStr}] ${ev.user}</strong>: ${ev.type === 'hookFish' ? `Giật được ${ev.fish?.name} (${ev.weightKg}kg)` : ev.type === 'castBait' ? `Thả ${ev.count} mồi thính` : ev.type === 'soundHorn' ? 'Thổi còi báo cá' : 'Quăng cần thả phao'}`;
    eventFeed.prepend(item);
    if (eventFeed.children.length > 25) {
      eventFeed.removeChild(eventFeed.lastChild);
    }
  }

  // 8. Đăng ký các nút bấm tương tác trực tiếp
  async function callRpc(method, params = {}) {
    try {
      const res = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        })
      });
      return await res.json();
    } catch (e) {
      console.warn('[RPC Error]', e.message);
      return null;
    }
  }

  function getAnglerInputs() {
    const nameInput = document.getElementById('inputAnglerName');
    const wishInput = document.getElementById('inputAnglerWish');
    return {
      user: nameInput?.value?.trim() || 'Hải Đăng Cần Thủ',
      wish: wishInput?.value?.trim() || 'Săn cá chép vàng 5 ký!'
    };
  }

  // Hotspots trên màn hình hồ câu
  const spotBait = document.getElementById('spotBait');
  const spotCast = document.getElementById('spotCast');
  const spotHorn = document.getElementById('spotHorn');
  const fishingBobberZone = document.getElementById('fishingBobberZone');

  if (spotBait) {
    spotBait.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user } = getAnglerInputs();
      callRpc('fishing.castBait', { user, count: 5 });
    });
  }

  if (spotCast) {
    spotCast.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user, wish } = getAnglerInputs();
      callRpc('fishing.castRod', { user, wish });
    });
  }

  if (spotHorn) {
    spotHorn.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user } = getAnglerInputs();
      callRpc('fishing.soundHorn', { user });
    });
  }

  if (fishingBobberZone) {
    fishingBobberZone.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user, wish } = getAnglerInputs();
      callRpc('fishing.hookFish', { user, wish });
    });
  }

  // Khay quà tặng TikTok Live 9 món ở HUD đáy
  document.querySelectorAll('.hud-gift-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const giftId = chip.getAttribute('data-gift-id');
      const { user } = getAnglerInputs();
      callRpc('fishing.sendGift', { user, giftId });
    });
  });

  // Nút test quà tặng trong Quick Dock
  document.querySelectorAll('[data-sim-gift]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const giftId = btn.getAttribute('data-sim-gift');
      const { user } = getAnglerInputs();
      callRpc('fishing.sendGift', { user, giftId });
    });
  });

  // Nút Quick Dock
  document.getElementById('btnRpcHook')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.hookFish', { user, wish });
  });

  document.getElementById('btnRpcCast')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.castRod', { user, wish });
  });

  document.getElementById('btnRpcBait')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.castBait', { user, count: 5 });
  });

  document.getElementById('btnRpcHorn')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.soundHorn', { user });
  });

  document.getElementById('btnRpcBigFish')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchBigFish', { user, coins: 35 });
  });

  document.getElementById('btnRpcLeviathan')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchLeviathan', { user, coins: 199 });
  });

  // ============================================================================
  // ĐIỀU KHIỂN ÂM THANH & THIẾT LẬP GIỌNG ĐỌC ZEROTTS
  // ============================================================================
  const btnUnlockAudio = document.getElementById('btnUnlockAudio');
  const btnTestVoice = document.getElementById('btnTestVoice');
  const selectTtsVoice = document.getElementById('selectTtsVoice');

  if (selectTtsVoice && window.FishingAudio) {
    if (window.FishingAudio.ttsVoice) {
      selectTtsVoice.value = window.FishingAudio.ttsVoice;
    }
    selectTtsVoice.addEventListener('change', (e) => {
      const voice = e.target.value;
      window.FishingAudio?.setVoice(voice);
      callRpc('fishing.updateSettings', { ttsVoice: voice });
      // Thử giọng mới ngay lập tức
      window.FishingAudio?.testVoice(`Đã chuyển sang giọng đọc ${e.target.selectedOptions[0]?.text || voice}!`);
    });
  }

  if (btnUnlockAudio) {
    btnUnlockAudio.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ensureContext();
      audio.testVoice('Hệ thống âm thanh hồ câu và giọng đọc đã sẵn sàng!');
      btnUnlockAudio.textContent = '✅ Âm Thanh Đã Bật (Bấm Thử Lại)';
      btnUnlockAudio.classList.remove('gold');
    });
  }

  if (btnTestVoice) {
    btnTestVoice.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ensureContext();
      const currentVoice = selectTtsVoice?.value || audio.ttsVoice || 'maichi';
      audio.setVoice(currentVoice);
      audio.testVoice('Chúc mừng cần thủ vừa giật được cá chép vàng 5 ký tại hồ câu!');
    });
  }

  const btnToggleMusic = document.getElementById('btnToggleMusic');
  if (btnToggleMusic) {
    btnToggleMusic.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ensureContext();
      audio.bgMusicEnabled = !audio.bgMusicEnabled;
      if (audio.bgMusicEnabled) {
        audio.startLakeAmbience();
        btnToggleMusic.textContent = '🎵 Âm Hồ Nước: BẬT';
        btnToggleMusic.classList.add('active-toggle');
      } else {
        audio.stopLakeAmbience();
        btnToggleMusic.textContent = '🎵 Âm Hồ Nước: TẮT';
        btnToggleMusic.classList.remove('active-toggle');
      }
      callRpc('fishing.updateSettings', { bgMusicEnabled: audio.bgMusicEnabled });
    });
  }

  const btnToggleTts = document.getElementById('btnToggleTts');
  if (btnToggleTts) {
    btnToggleTts.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ttsEnabled = !audio.ttsEnabled;
      btnToggleTts.textContent = audio.ttsEnabled ? '🎙️ Giọng Đọc: BẬT' : '🎙️ Giọng Đọc: TẮT';
      btnToggleTts.classList.toggle('active-toggle', audio.ttsEnabled);
      callRpc('fishing.updateSettings', { ttsEnabled: audio.ttsEnabled });
    });
  }

  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol) {
    if (window.FishingAudio) {
      sliderMusicVol.value = Math.round(window.FishingAudio.bgBaseVolume * 100);
      if (valMusicVol) valMusicVol.textContent = `${sliderMusicVol.value}%`;
    }
    sliderMusicVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valMusicVol) valMusicVol.textContent = `${val}%`;
      window.FishingAudio?.setMusicVolume(val / 100);
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol) {
    if (window.FishingAudio) {
      sliderTtsVol.value = Math.round(window.FishingAudio.ttsVolume * 100);
      if (valTtsVol) valTtsVol.textContent = `${sliderTtsVol.value}%`;
    }
    sliderTtsVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valTtsVol) valTtsVol.textContent = `${val}%`;
      window.FishingAudio?.setTtsVolume(val / 100);
    });
  }

  // Kết nối TikTok Live
  const btnConnectTikTok = document.getElementById('btnConnectTikTok');
  const inputTikTokUser = document.getElementById('inputTikTokUser');
  if (btnConnectTikTok) {
    btnConnectTikTok.addEventListener('click', async () => {
      const username = inputTikTokUser?.value?.trim();
      if (!username) return alert('Vui lòng nhập @username hoặc link TikTok Live');
      btnConnectTikTok.textContent = 'Đang kết nối...';
      btnConnectTikTok.disabled = true;
      try {
        await callRpc('fishing.connectTikTok', { username });
      } finally {
        btnConnectTikTok.textContent = 'Kết Nối';
        btnConnectTikTok.disabled = false;
      }
    });
  }

  // Tự động giả lập cần thủ
  let autoSimState = false;
  const btnToggleAutoSim = document.getElementById('btnToggleAutoSim');
  if (btnToggleAutoSim) {
    btnToggleAutoSim.addEventListener('click', async () => {
      autoSimState = !autoSimState;
      if (autoSimState) {
        await callRpc('fishing.startAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: BẬT';
        btnToggleAutoSim.classList.add('gold');
      } else {
        await callRpc('fishing.stopAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: TẮT';
        btnToggleAutoSim.classList.remove('gold');
      }
    });
  }

  // Bấm đóng modal chiến tích khi click ra ngoài
  if (catchModal) {
    catchModal.addEventListener('click', (e) => {
      if (e.target === catchModal) {
        catchModal.classList.remove('active');
      }
    });
  }

  // Khởi động kết nối
  connectWs();
})();
