/**
 * Live 9:16 Client Controller — VÕ ĐÀI 3D (Đi Tìm Võ Lâm Minh Chủ)
 * - Đồng bộ Real-time 10Hz tới 3D Engine Three.js
 * - Quản lý bảng trạng thái VÕ ĐÀI (TRẬN X • Đang giao đấu / Ghi danh • Ma Đấu • Minh Chủ)
 * - Side Panels đối xứng: TOP HẠ GỤC / TRẬN VỪA RỒI & TẶNG QUÀ (7 kỹ năng) / BẢNG VÀNG
 * - Thẻ Chiến Tích rực lửa, Gift Combo Toast & Modal Cài đặt 3D
 */
import { Wuxia3DEngine } from '/js/wuxia3d.js';

(function () {
  const params = new URLSearchParams(window.location.search);
  const isObsMode = params.get('obs') === '1';
  if (isObsMode) {
    document.body.classList.add('obs-mode');
  }

  const wuxia3d = new Wuxia3DEngine('stage3D');
  const audio = new window.WuxiaAudioEngine();

  let currentPhase = 'fighting';
  let maDauTarget = 1000;
  let lastAttackSfxAt = 0;
  let achievementTimer = null;
  let announceTimer = null;
  let lastFullState = null;
  let lastBossActive = false;
  let lastBossDmgSignature = '';

  const CAMERA_CYCLE_LIST = [
    { id: 'broadcast', label: '📺 Góc Live' },
    { id: 'director', label: '🎬 Đạo Diễn' },
    { id: 'low_hero', label: '🔥 Góc Thấp' },
    { id: 'side_left', label: '⬅️ Cánh Trái' },
    { id: 'side_right', label: '➡️ Cánh Phải' },
    { id: 'crowd_pov', label: '👀 Khán Đài' },
    { id: 'cinematic', label: '🎥 Xoay 360°' },
    { id: 'action', label: '⚔️ Giao Tranh' },
    { id: 'champion', label: '👑 Minh Chủ' },
    { id: 'topdown', label: '📐 Trên Cao' }
  ];

  function updateQuickCameraLabel(modeId) {
    const lbl = document.getElementById('btnCycleCameraText');
    if (!lbl) return;
    const found = CAMERA_CYCLE_LIST.find((c) => c.id === modeId);
    lbl.textContent = found ? found.label : (modeId === 'orbit' ? '🖱️ Tự Do' : '📺 Góc Live');
  }

  function renderGiftSpotlightBadge(focus) {
    const badge = document.getElementById('giftSpotlightBadge');
    const txt = document.getElementById('giftSpotlightText');
    if (!badge || !txt) return;
    if (!focus) {
      badge.classList.remove('show');
      return;
    }
    const skillInfo = focus.skillLabel ? ` (${focus.skillLabel})` : '';
    txt.textContent = `🎥 ZOOM: ${focus.giftIcon || '🎁'} ${focus.user} — ${focus.giftName}${skillInfo}`;
    badge.classList.add('show');
  }
  wuxia3d.onGiftFocusChange = renderGiftSpotlightBadge;

  const GIFT_PANEL_ORDER = [
    { id: 'rose', icon: '🌹', iconImg: null, label: 'Vào đấu / +20 máu' },
    { id: 'gg', icon: '🎮', iconImg: '/assets/gifts/gg.png', label: 'Hồi máu' },
    { id: 'giftbox', icon: '🎁', iconImg: '/assets/gifts/giftbox.png', label: 'Khổng lồ' },
    { id: 'heart_hands', icon: '💎', iconImg: '/assets/gifts/heart_hands.png', label: 'Hồi sinh / Thần Võ' }
  ];

  function unlockAudioOnce() {
    audio.ensureContext();
    const btn = document.getElementById('btnUnlockAudio');
    if (btn) {
      btn.textContent = '✅ Âm Thanh Kiếm Hiệp Đã Bật';
      btn.classList.add('active');
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });

  // --------------------------------------------------------------------------
  // 1. WEBSOCKET JSON-RPC 2.0
  // --------------------------------------------------------------------------
  let ws = null;
  let reconnectTimer = null;

  function connectWs() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.onopen = () => updateWsDot(true);
    ws.onmessage = (e) => {
      try {
        handleMessage(JSON.parse(e.data));
      } catch (err) {
        console.warn('[WS] Lỗi dữ liệu:', err);
      }
    };
    ws.onclose = () => {
      updateWsDot(false);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWs, 2500);
    };
    ws.onerror = () => {};
  }

  function sendRpc(method, rpcParams = {}) {
    const payload = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: rpcParams });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    } else {
      fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(() => {});
    }
  }

  function handleMessage(msg) {
    if (msg.method === 'wuxia.state') {
      applyFullState(msg.params);
    } else if (msg.method === 'wuxia.tick') {
      applyCompactTick(msg.params);
    } else if (msg.method === 'wuxia.event') {
      // Đồng bộ danh sách nhân vật 3D TRƯỚC khi chạy VFX/Gift Zoom để người mới tặng quà được zoom trúng ngay frame đầu!
      if (msg.params?.state) applyFullState(msg.params.state);
      handleEvent(msg.params?.event);
    } else if (msg.method === 'tiktok.status') {
      updateTikTokStatusUI(msg.params);
    } else if (msg.method === 'tts.play') {
      audio.speak(msg.params?.text);
    }
  }

  function updateTikTokStatusUI(tt) {
    if (!tt) return;
    const badge = document.getElementById('modalTikTokBadge');
    const input = document.getElementById('modalTikTokInput');
    const errEl = document.getElementById('modalTikTokError');

    if (input && tt.username && document.activeElement !== input && !input.value) {
      input.value = tt.username;
    }

    if (badge) {
      if (tt.connected) {
        badge.className = 'tt-status-pill online';
        badge.textContent = `@${tt.username} • ${tt.viewerCount || 0} mắt xem`;
      } else if (tt.connecting) {
        badge.className = 'tt-status-pill connecting';
        badge.textContent = `Đang kết nối @${tt.username}...`;
      } else {
        badge.className = 'tt-status-pill offline';
        badge.textContent = 'Chưa kết nối';
      }
    }

    if (errEl) {
      if (tt.lastError) {
        errEl.textContent = `⚠️ ${tt.lastError}`;
        errEl.classList.add('show');
      } else {
        errEl.textContent = '';
        errEl.classList.remove('show');
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. HUD RENDERERS
  // --------------------------------------------------------------------------
  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  }

  function updateWsDot(online) {
    const dot = document.getElementById('liveDot');
    if (dot) dot.className = online ? 'ws-dot online' : 'ws-dot offline';
  }

  function updateBossAndMaDauUI(boss, remaining, target, nextBossInSec, phase) {
    const board = document.getElementById('centralStatusBoard');
    const crest = document.getElementById('vodaiCrest');
    const track = document.getElementById('maDauGoalBar');
    const fill = document.getElementById('maDauGoalFill');
    const txt = document.getElementById('maDauGoalText');
    const instrPill = document.getElementById('instructionPill');
    const instrText = document.getElementById('instructionText');
    const phaseEl = document.getElementById('boardPhaseText');
    const timerEl = document.getElementById('boardTimerText');

    const bossAlive = Boolean(boss && boss.alive);
    if (board) board.classList.toggle('boss-raid-active', bossAlive);
    if (track) track.classList.toggle('is-boss-hp', bossAlive);
    if (instrPill) instrPill.classList.toggle('is-boss-raid', bossAlive);

    if (bossAlive) {
      if (crest) crest.textContent = boss.enraged ? '🔥 BOSS CUỒNG NỘ' : '👹 ĐỒNG TÂM DIỆT BOSS';
      if (phaseEl) phaseEl.textContent = 'Đánh Boss';
      if (timerEl) timerEl.textContent = 'RAID';
      const maxHp = Math.max(1, Number(boss.maxHp) || 1);
      const hp = Math.max(0, Number(boss.hp) || 0);
      const pct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
      if (fill) fill.style.width = `${pct}%`;
      if (txt) {
        txt.textContent = `${boss.user} • ${hp.toLocaleString('vi-VN')} / ${maxHp.toLocaleString('vi-VN')} HP`;
      }
      if (instrPill) instrPill.style.display = 'block';
      if (instrText) instrText.textContent = '⚔️ TOÀN VÕ LÂM ĐÌNH CHIẾN • HỢP LỰC HẠ BOSS!';
      renderBossDamagePanel(boss.damageTop || []);
      lastBossActive = true;
      return;
    }

    if (crest) crest.textContent = 'VÕ ĐÀI';
    const safeTarget = Math.max(1, target || maDauTarget || 1000);
    const rem = Math.max(0, Number(remaining) || 0);
    const pct = Math.max(6, Math.min(100, Math.round(((safeTarget - rem) / safeTarget) * 100)));
    if (fill) fill.style.width = `${pct}%`;
    if (txt) {
      if (phase === 'fighting' && nextBossInSec != null && nextBossInSec > 0) {
        txt.textContent = `👹 Boss ngẫu nhiên ~${nextBossInSec}s • ❤️ còn ${rem.toLocaleString('vi-VN')} tim`;
      } else {
        txt.textContent = `❤️ Ma Đấu: còn ${rem.toLocaleString('vi-VN')} tim`;
      }
    }

    // Vừa kết thúc Boss -> trả lại panel TOP HẠ GỤC ngay lập tức
    if (lastBossActive) {
      lastBossActive = false;
      lastBossDmgSignature = '';
      if (lastFullState) renderLeftPanel({ ...lastFullState, boss: null });
    }
  }

  function renderBossDamagePanel(damageTop = []) {
    const sig = damageTop.map((d) => `${d.uniqueId}:${d.damage}`).join('|');
    if (sig === lastBossDmgSignature && lastBossActive) return;
    lastBossDmgSignature = sig;

    const titleEl = document.getElementById('leftPanelTitle');
    const listEl = document.getElementById('leftPanelList');
    if (!titleEl || !listEl) return;

    titleEl.textContent = '🔥 SÁT THƯƠNG BOSS';
    listEl.textContent = '';

    if (damageTop.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'stat-row';
      empty.textContent = 'Đang xông lên đánh Boss...';
      listEl.appendChild(empty);
      return;
    }

    damageTop.slice(0, 3).forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'stat-row';

      const rc = document.createElement('span');
      rc.className = `rank-circle ${idx === 0 ? 'r1' : idx === 1 ? 'r2' : 'r3'}`;
      rc.textContent = String(idx + 1);

      const nm = document.createElement('span');
      nm.className = 'stat-name';
      nm.textContent = item.user;

      const val = document.createElement('span');
      val.className = 'stat-val';
      val.textContent = `${item.damage} DMG`;

      row.append(rc, nm, val);
      listEl.appendChild(row);
    });
  }

  function applyCompactTick(tick) {
    if (!tick) return;
    wuxia3d.syncFighters(tick.fighters || [], tick.boss || null);

    const timerEl = document.getElementById('boardTimerText');
    const phaseEl = document.getElementById('boardPhaseText');
    const heroesEl = document.getElementById('boardHeroesText');
    const instrEl = document.getElementById('instructionText');
    const bossAlive = Boolean(tick.boss && tick.boss.alive);

    if (!bossAlive) {
      if (timerEl) {
        timerEl.textContent = (tick.phase === 'registration' && (tick.totalHeroes || 0) < 2)
          ? 'Chờ'
          : formatTime(tick.phaseTimer);
      }
      if (phaseEl) {
        if (tick.phase === 'registration') {
          phaseEl.textContent = (tick.totalHeroes || 0) < 2 ? 'Chờ anh hùng' : 'Ghi danh';
        } else if (tick.phase === 'fighting') {
          phaseEl.textContent = 'Đang giao đấu';
        }
      }
      if (instrEl && tick.phase === 'fighting') {
        instrEl.textContent = `Gõ đánh để lên võ đài trận sau • Đang chờ ${tick.waitingCount || 0}`;
      }
    }
    if (heroesEl) {
      heroesEl.textContent = tick.phase === 'registration'
        ? `Anh hùng ${tick.totalHeroes} / 24`
        : `Còn ${tick.aliveCount} / ${tick.totalHeroes} anh hùng`;
    }
    updateBossAndMaDauUI(tick.boss || null, tick.maDauRemaining, maDauTarget, tick.nextBossInSec, tick.phase);
  }

  function applyFullState(state) {
    if (!state) return;
    lastFullState = state;
    currentPhase = state.phase || 'fighting';
    maDauTarget = state.maDauTarget || 1000;

    wuxia3d.syncFighters(state.activeFighters || [], state.boss || null);

    // Central Status Board
    const roundEl = document.getElementById('boardRoundText');
    const phaseEl = document.getElementById('boardPhaseText');
    const timerEl = document.getElementById('boardTimerText');
    const heroesEl = document.getElementById('boardHeroesText');
    const instrPill = document.getElementById('instructionPill');
    const instrText = document.getElementById('instructionText');
    const regCallout = document.getElementById('regCallout');

    if (roundEl) roundEl.textContent = `TRẬN ${state.round || 1}`;
    if (timerEl) timerEl.textContent = formatTime(state.phaseTimer);

    if (currentPhase === 'registration') {
      const waitingForMin = (state.totalHeroes || 0) < 2;
      if (phaseEl) phaseEl.textContent = waitingForMin ? 'Chờ anh hùng' : 'Ghi danh';
      if (timerEl) timerEl.textContent = waitingForMin ? 'Chờ' : formatTime(state.phaseTimer);
      if (heroesEl) heroesEl.textContent = `Anh hùng ${state.totalHeroes || 0} / ${state.maxHeroes || 24}`;
      if (instrPill) instrPill.style.display = 'none';
      if (regCallout) regCallout.classList.add('show');
    } else if (currentPhase === 'coronation') {
      if (phaseEl) phaseEl.textContent = 'Vinh danh';
      if (heroesEl) heroesEl.textContent = `Còn ${state.aliveCount || 1} / ${state.totalHeroes || 1} anh hùng`;
      if (instrPill) instrPill.style.display = 'block';
      if (instrText) instrText.textContent = '👑 Tân Võ Lâm Minh Chủ đã lộ diện • Chuẩn bị trận sau!';
      if (regCallout) regCallout.classList.remove('show');
    } else {
      if (phaseEl) phaseEl.textContent = 'Đang giao đấu';
      if (heroesEl) heroesEl.textContent = `Còn ${state.aliveCount || 0} / ${state.totalHeroes || 0} anh hùng`;
      if (instrPill) instrPill.style.display = 'block';
      if (instrText) instrText.textContent = `Gõ đánh để lên võ đài trận sau • Đang chờ ${state.waitingCount || 0}`;
      if (regCallout) regCallout.classList.remove('show');
    }

    // Symmetrical Side Panels (nếu đang đánh Boss thì renderBossDamagePanel sẽ thay thế Left Panel)
    if (!(state.boss && state.boss.alive)) {
      renderLeftPanel(state);
    }
    renderRightPanel(state);

    updateBossAndMaDauUI(state.boss || null, state.maDauRemaining, state.maDauTarget, state.nextBossInSec, currentPhase);
    updateTikTokStatusUI(state.tiktok);

    // Reigning Champion Pill
    const champName = document.getElementById('boardChampName');
    const champAv = document.getElementById('boardChampAv');
    if (state.champion) {
      if (champName) champName.textContent = state.champion.user;
      if (champAv) champAv.textContent = state.champion.user.slice(0, 1).toUpperCase();
    } else {
      if (champName) champName.textContent = 'Chưa có Minh Chủ';
      if (champAv) champAv.textContent = '⚔️';
    }

    // 3D Graphics & Boss Settings
    if (state.settings?.graphics3D) {
      apply3DSettingsLocal(state.settings.graphics3D);
      syncSettingsDialogInputs(state.settings.graphics3D, state.settings);
    }
  }

  function renderLeftPanel(state) {
    const titleEl = document.getElementById('leftPanelTitle');
    const listEl = document.getElementById('leftPanelList');
    if (!titleEl || !listEl) return;

    const isReg = state.phase === 'registration';
    titleEl.textContent = isReg ? 'TRẬN VỪA RỒI' : 'TOP HẠ GỤC';
    const items = isReg ? (state.lastRoundTopKills || []) : (state.topKills || []).slice(0, 3);

    listEl.textContent = '';
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'stat-row';
      empty.textContent = 'Chưa có hạ gục...';
      listEl.appendChild(empty);
      return;
    }

    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'stat-row';

      const rc = document.createElement('span');
      rc.className = `rank-circle ${idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : 'rn'}`;
      rc.textContent = String(idx + 1);

      const nm = document.createElement('span');
      nm.className = 'stat-name';
      nm.textContent = item.user;

      const val = document.createElement('span');
      val.className = 'stat-val';
      val.textContent = `${item.kills} hạ gục`;

      row.append(rc, nm, val);
      listEl.appendChild(row);
    });
  }

  function renderRightPanel(state) {
    const titleEl = document.getElementById('rightPanelTitle');
    const listEl = document.getElementById('rightPanelList');
    if (!titleEl || !listEl) return;

    listEl.textContent = '';
    if (state.phase === 'registration') {
      titleEl.textContent = 'BẢNG VÀNG';
      const hof = (state.hallOfFame || []).slice(0, 5);
      if (hof.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'stat-row';
        empty.textContent = 'Chưa có Minh Chủ...';
        listEl.appendChild(empty);
        return;
      }
      hof.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'stat-row';

        const rc = document.createElement('span');
        rc.className = `rank-circle ${idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : 'rn'}`;
        rc.textContent = String(idx + 1);

        const nm = document.createElement('span');
        nm.className = 'stat-name';
        nm.textContent = item.user;

        const val = document.createElement('span');
        val.className = 'stat-val';
        val.textContent = `${item.wins}👑`;

        row.append(rc, nm, val);
        listEl.appendChild(row);
      });
    } else {
      titleEl.textContent = 'TẶNG QUÀ';
      GIFT_PANEL_ORDER.forEach((g) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gift-skill-row';
        btn.title = `Bấm thử kỹ năng ${g.label}`;
        btn.addEventListener('click', () => triggerLocalGift(g.id));

        const ic = document.createElement('span');
        ic.className = 'gs-icon';
        if (g.iconImg) {
          const img = document.createElement('img');
          img.src = g.iconImg;
          img.alt = g.label;
          img.className = 'gs-icon-img';
          ic.appendChild(img);
        } else {
          ic.textContent = g.icon;
        }

        const lb = document.createElement('span');
        lb.className = 'gs-label';
        lb.textContent = g.label;

        btn.append(ic, lb);
        listEl.appendChild(btn);
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3. XỬ LÝ SỰ KIỆN CHIẾN ĐẤU & POP-UP
  // --------------------------------------------------------------------------
  function handleEvent(evt) {
    if (!evt) return;

    if (evt.type === 'attack') {
      wuxia3d.playAttackEvent(evt);
      const now = performance.now();
      if (evt.isCrit || evt.isKill || now - lastAttackSfxAt > 240) {
        lastAttackSfxAt = now;
        if (evt.isCrit) audio.playCritHit();
        else if (evt.ranged) audio.playArrowShot();
        else if (evt.weaponType === 'con' || evt.weaponType === 'quyen') audio.playBluntHit();
        else audio.playSwordClash();
      }
    } else if (evt.type === 'kill') {
      showAchievementPopUp(evt);
    } else if (evt.type === 'heal') {
      audio.playHealChime();
      wuxia3d.spawnLightPillar({ x: evt.x || 0, z: evt.z || 0 }, '#4ade80');
      wuxia3d.spawnComicNumber({ x: evt.x || 0, y: 2.5, z: evt.z || 0 }, `+${evt.amount}`, 'heal');
    } else if (evt.type === 'giftSkill') {
      if (evt.skillId === 'shield') audio.playShieldBell();
      else if (evt.skillId === 'heal' || evt.skillId === 'rose' || evt.skillId === 'cake') audio.playHealChime();
      else audio.playUltimateVfx();

      wuxia3d.playGiftSkillVfx(evt);
      pushGiftComboBanner(evt);
    } else if (evt.type === 'bossSpawn') {
      audio.playBossSpawnRoar();
      const bName = evt.boss?.user || '👹 ĐẠI BOSS VÕ LÂM';
      showGrandAnnouncement(`${bName} GIÁNG LÂM! TOÀN VÕ LÂM HỢP LỰC ĐÁNH BOSS!`);
    } else if (evt.type === 'bossEnrage') {
      audio.playBossAoESlam();
      showGrandAnnouncement(`⚠️ ${evt.bossName || 'BOSS'} BẠO PHÁT CUỒNG NỘ!`);
    } else if (evt.type === 'bossAoE') {
      audio.playBossAoESlam();
      wuxia3d.playBossAoEVfx(evt);
    } else if (evt.type === 'bossDefeated') {
      audio.playCoronation();
      wuxia3d.playBossDefeatedVfx(evt);
      const bName = evt.bossName || 'BOSS';
      const bonus = evt.slayerBonus || 3;
      showGrandAnnouncement(`🏆 ${evt.killerUser} KẾT LIỄU ${bName} (+${bonus} HẠ GỤC)! CHUẨN BỊ TỈ THÍ TIẾP!`);
    } else if (evt.type === 'bossEscaped') {
      audio.playBossSpawnRoar();
      showGrandAnnouncement(`💨 ${evt.bossName || 'BOSS'} ĐÃ RÚT LUI • HỒI SINH QUAY LẠI TỈ THÍ!`);
    } else if (evt.type === 'pvpResumed') {
      audio.playUltimateVfx();
      showGrandAnnouncement('⚔️ BOSS ĐÃ CHẾT — TOÀN VÕ LÂM QUAY LẠI TỈ THÍ!');
    } else if (evt.type === 'coronation' && evt.champion) {
      audio.playCoronation();
      wuxia3d.playCoronationVfx();
      showGrandAnnouncement(`👑 ${evt.champion.user} ĐĂNG QUANG VÕ LÂM MINH CHỦ!`);
    }

    if (evt.ttsText) {
      audio.speak(evt.ttsText);
    }
  }

  function showAchievementPopUp(evt) {
    const card = document.getElementById('achievementCard');
    const numEl = document.getElementById('achieveBadgeNum');
    const tagEl = document.getElementById('achieveTag');
    const mainEl = document.getElementById('achieveMain');
    const subEl = document.getElementById('achieveSub');
    if (!card) return;

    const totalDisplay = Math.max(evt.killerKills || 1, evt.killerTotalKills || 1);
    if (numEl) numEl.textContent = `x${totalDisplay}`;
    if (tagEl) tagEl.textContent = evt.killerKills >= 3 ? '🔥 LIÊN TRẢM VÔ SONG' : '⚔️ CHIẾN TÍCH VÕ ĐÀI';
    if (mainEl) mainEl.textContent = `${evt.killerUser} x${totalDisplay} hạ gục`;
    if (subEl) subEl.textContent = `${evt.killerUser} ⚔️ ${evt.victimUser}`;

    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');

    clearTimeout(achievementTimer);
    achievementTimer = setTimeout(() => card.classList.remove('show'), 4000);
  }

  function pushGiftComboBanner(evt) {
    const stack = document.getElementById('giftComboStack');
    if (!stack) return;

    const pill = document.createElement('div');
    pill.className = 'gift-combo-pill';

    const av = document.createElement('div');
    av.className = 'gc-av';
    av.textContent = (evt.user || 'H').slice(0, 1).toUpperCase();

    const textWrap = document.createElement('div');
    textWrap.className = 'gc-text';

    const u = document.createElement('span');
    u.className = 'gc-user';
    u.textContent = evt.user;

    const d = document.createElement('span');
    d.className = 'gc-desc';
    d.textContent = `${evt.skillLabel || evt.giftName}`;

    textWrap.append(u, d);

    const ic = document.createElement('span');
    ic.className = 'gc-icon';
    if (evt.iconImg) {
      const img = document.createElement('img');
      img.src = evt.iconImg;
      img.alt = evt.giftName || 'Gift';
      img.className = 'gc-icon-img';
      ic.appendChild(img);
    } else {
      ic.textContent = evt.giftIcon || '🌹';
    }

    const mult = document.createElement('span');
    mult.className = 'gc-mult';
    mult.textContent = `x${evt.combo || 1}`;

    pill.append(av, textWrap, ic, mult);
    stack.appendChild(pill);

    while (stack.children.length > 2) {
      stack.firstChild.remove();
    }

    setTimeout(() => {
      pill.classList.add('fade-out');
      setTimeout(() => pill.remove(), 420);
    }, 3400);
  }

  function showGrandAnnouncement(text) {
    const el = document.getElementById('grandAnnouncement');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => el.classList.remove('show'), 4600);
  }

  function triggerLocalGift(skillId) {
    unlockAudioOnce();
    sendRpc('wuxia.giftSkill', {
      user: 'Đại Hiệp Live',
      uniqueId: 'local_viewer_host',
      skillId,
      repeatCount: 1
    });
  }

  // --------------------------------------------------------------------------
  // 4. NATIVE <dialog> 3D GRAPHICS SETTINGS CONTROLLER
  // --------------------------------------------------------------------------
  const settingsDialog = document.getElementById('settingsModal');
  function openSettings() {
    if (!settingsDialog) return;
    if (typeof settingsDialog.showModal === 'function') settingsDialog.showModal();
    else settingsDialog.setAttribute('open', '');
  }
  function closeSettings() {
    if (!settingsDialog) return;
    if (typeof settingsDialog.close === 'function') settingsDialog.close();
    else settingsDialog.removeAttribute('open');
  }

  document.getElementById('btnOpenSettings')?.addEventListener('click', openSettings);
  document.getElementById('btnCloseSettings')?.addEventListener('click', closeSettings);
  settingsDialog?.addEventListener('click', (e) => {
    if (e.target === settingsDialog) closeSettings();
  });

  const settingIds = [
    'settingQuality',
    'settingCamera',
    'settingEnvironment',
    'settingAspect',
    'settingGiftCamZoom',
    'settingShadows',
    'settingSpectators',
    'settingBraziers',
    'settingKiAura',
    'settingSlashTrails',
    'settingDamageNumbers'
  ];

  settingIds.forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      const g3d = readSettingsFromDialog();
      apply3DSettingsLocal(g3d);
      sendRpc('wuxia.updateSettings', { graphics3D: g3d });
    });
  });

  function cycleCameraAngle() {
    const cur = wuxia3d.settings.cameraMode || 'broadcast';
    const curIdx = CAMERA_CYCLE_LIST.findIndex((c) => c.id === cur);
    const next = CAMERA_CYCLE_LIST[(curIdx + 1) % CAMERA_CYCLE_LIST.length];
    const g3d = { ...readSettingsFromDialog(), cameraMode: next.id };
    apply3DSettingsLocal(g3d);
    syncSettingsDialogInputs(g3d);
    sendRpc('wuxia.updateSettings', { graphics3D: { cameraMode: next.id } });
  }

  document.getElementById('btnCycleCamera')?.addEventListener('click', cycleCameraAngle);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'c' && e.key !== 'C') return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    cycleCameraAngle();
  });

  function readSettingsFromDialog() {
    return {
      quality: document.getElementById('settingQuality')?.value || 'high',
      cameraMode: document.getElementById('settingCamera')?.value || 'broadcast',
      environmentFx: document.getElementById('settingEnvironment')?.value || 'embers',
      aspectMode: document.getElementById('settingAspect')?.value || '9:16',
      giftCamZoom: document.getElementById('settingGiftCamZoom')?.checked ?? true,
      shadows: document.getElementById('settingShadows')?.checked ?? true,
      spectators: document.getElementById('settingSpectators')?.checked ?? true,
      braziers: document.getElementById('settingBraziers')?.checked ?? true,
      kiAura: document.getElementById('settingKiAura')?.checked ?? true,
      slashTrails: document.getElementById('settingSlashTrails')?.checked ?? true,
      damageNumbers: document.getElementById('settingDamageNumbers')?.checked ?? true
    };
  }

  function apply3DSettingsLocal(g3d) {
    if (!g3d) return;
    wuxia3d.applySettings(g3d);
    updateQuickCameraLabel(g3d.cameraMode);

    const wrapper = document.getElementById('stageWrapper');
    if (wrapper) {
      wrapper.classList.toggle('aspect-16x9', g3d.aspectMode === '16:9');
    }
    requestAnimationFrame(() => wuxia3d.onResize());
  }

  const BOSS_CADENCE_PRESETS = {
    fast: { bossMinIntervalSec: 15, bossMaxIntervalSec: 30 },
    normal: { bossMinIntervalSec: 25, bossMaxIntervalSec: 50 },
    slow: { bossMinIntervalSec: 45, bossMaxIntervalSec: 80 }
  };

  document.getElementById('settingRandomBoss')?.addEventListener('change', (e) => {
    sendRpc('wuxia.updateSettings', { randomBossEnabled: Boolean(e.target.checked) });
  });

  document.getElementById('settingBossCadence')?.addEventListener('change', (e) => {
    const preset = BOSS_CADENCE_PRESETS[e.target.value] || BOSS_CADENCE_PRESETS.normal;
    sendRpc('wuxia.updateSettings', preset);
  });

  function syncSettingsDialogInputs(g3d, rootSettings = null) {
    if (!g3d) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.checked = Boolean(v); };

    setVal('settingQuality', g3d.quality);
    setVal('settingCamera', g3d.cameraMode);
    setVal('settingEnvironment', g3d.environmentFx);
    setVal('settingAspect', g3d.aspectMode);
    setChk('settingGiftCamZoom', g3d.giftCamZoom !== false);
    setChk('settingShadows', g3d.shadows);
    setChk('settingSpectators', g3d.spectators);
    setChk('settingBraziers', g3d.braziers);
    setChk('settingKiAura', g3d.kiAura);
    setChk('settingSlashTrails', g3d.slashTrails);
    setChk('settingDamageNumbers', g3d.damageNumbers);

    if (rootSettings) {
      setChk('settingRandomBoss', rootSettings.randomBossEnabled !== false);
      const minS = Number(rootSettings.bossMinIntervalSec) || 25;
      const cadenceVal = minS <= 18 ? 'fast' : minS >= 40 ? 'slow' : 'normal';
      setVal('settingBossCadence', cadenceVal);
    }
  }

  document.getElementById('sfxVolumeSlider')?.addEventListener('input', (e) => {
    audio.sfxVolume = parseFloat(e.target.value);
  });

  document.getElementById('btnUnlockAudio')?.addEventListener('click', unlockAudioOnce);
  document.getElementById('btnTriggerReg')?.addEventListener('click', () => {
    sendRpc('wuxia.resetRound');
    closeSettings();
  });
  document.getElementById('btnTriggerBoss')?.addEventListener('click', () => {
    sendRpc('wuxia.spawnBoss');
    closeSettings();
  });

  document.getElementById('btnModalConnectTT')?.addEventListener('click', async () => {
    const val = document.getElementById('modalTikTokInput')?.value?.trim();
    const errEl = document.getElementById('modalTikTokError');
    if (!val) {
      if (errEl) {
        errEl.textContent = '⚠️ Vui lòng nhập @username hoặc link TikTok Live!';
        errEl.classList.add('show');
      }
      return;
    }
    try {
      const resp = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'live.connect', params: { username: val } })
      });
      const data = await resp.json();
      if (data.error && errEl) {
        errEl.textContent = `⚠️ ${data.error.message}`;
        errEl.classList.add('show');
      }
    } catch (e) {
      if (errEl) {
        errEl.textContent = `⚠️ ${e.message}`;
        errEl.classList.add('show');
      }
    }
  });

  document.getElementById('btnModalDisconnectTT')?.addEventListener('click', () => {
    sendRpc('live.disconnect');
  });

  connectWs();
})();
