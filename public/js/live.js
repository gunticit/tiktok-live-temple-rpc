/**
 * Live 9:16 Wuxia Client Controller — Hoa Sơn Luận Kiếm 3D
 * - Quản lý Lôi Đài 3D Three.js
 * - Bảng Xếp Hạng Võ Lâm Minh Chủ & Ngũ Tuyệt
 * - Bảng Điều Khiển Thiết Lập Hình Ảnh 3D & Âm Thanh Kiếm Hiệp
 * - WebSocket JSON-RPC 2.0 đồng bộ thời gian thực
 */
import { Wuxia3DEngine } from '/js/wuxia3d.js';

(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('obs') === '1') {
    document.body.classList.add('obs-mode');
  }

  // 1. Khởi tạo 3D Engine & Audio Engine
  const wuxia3d = new Wuxia3DEngine('stage3D');
  const audio = new window.WuxiaAudioEngine();

  // Mở khóa âm thanh lần đầu người dùng click bất kỳ đâu
  function unlockAudioOnce() {
    audio.ensureContext();
    const btnUnlock = document.getElementById('btnUnlockAudio');
    if (btnUnlock) {
      btnUnlock.textContent = '🔊 Âm Thanh Kiếm Hiệp: Sẵn Sàng';
      btnUnlock.classList.add('active');
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });

  // 2. WebSocket Kết nối tới Server
  let ws = null;
  let reconnectTimer = null;

  function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Đã kết nối lôi đài');
      updateConnStatus(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (err) {
        console.warn('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Mất kết nối, tự động thử lại sau 2.5s...');
      updateConnStatus(false);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWs, 2500);
    };

    ws.onerror = (err) => {
      console.error('[WS Error]', err);
    };
  }

  function sendRpc(method, params = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }));
    } else {
      fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
      }).catch((e) => console.warn('[RPC fallback failed]', e.message));
    }
  }

  function handleWsMessage(msg) {
    if (msg.method === 'wuxia.state') {
      renderState(msg.params);
    } else if (msg.method === 'wuxia.event') {
      const { event, state } = msg.params;
      handleWuxiaEvent(event);
      if (state) renderState(state);
    } else if (msg.method === 'tiktok.status') {
      updateTikTokBadge(msg.params);
    } else if (msg.method === 'tts.play') {
      audio.speak(msg.params.text);
    }
  }

  // 3. Xử lý Sự Kiện Trận Đấu (Sound & 3D VFX)
  function handleWuxiaEvent(evt) {
    if (!evt) return;

    if (evt.type === 'attack') {
      if (evt.isCrit) {
        audio.playCritHit();
      } else if (evt.attacker?.weaponType === 'con' || evt.attacker?.weaponType === 'bong') {
        audio.playBluntHit();
      } else {
        audio.playSwordClash();
      }
      wuxia3d.playAttackVfx(evt.attacker, evt.target, evt.isCrit, evt.skillName);

      if (evt.target) {
        const tMesh = wuxia3d.fighters.get(evt.target.uniqueId);
        const tPos = tMesh ? tMesh.position : new THREE.Vector3(0, 3, 0);
        wuxia3d.spawnDamageNumber(tPos, `-${evt.damage}`, evt.isCrit);
      }

      pushKillFeed(evt);
    } else if (evt.type === 'heal') {
      const fMesh = wuxia3d.fighters.get(evt.fighter?.uniqueId);
      const pos = fMesh ? fMesh.position : new THREE.Vector3(0, 3, 0);
      wuxia3d.spawnDamageNumber(pos, `+${evt.healAmount} HP`, false, true);
    } else if (evt.type === 'ultimate') {
      audio.playUltimateVfx();
      wuxia3d.playUltimateVfx(evt.fighter, evt.ultimateSkill);
      pushKillFeed(evt);
    } else if (evt.type === 'coronation') {
      audio.playCoronation();
      pushAnnouncement(`👑 THIÊN HẠ QUY TÂM! ${evt.champion.user} ĐĂNG QUANG VÕ LÂM MINH CHỦ!`);
    } else if (evt.type === 'join') {
      pushKillFeed(evt);
    }

    if (evt.ttsText) {
      audio.speak(evt.ttsText);
    }
  }

  // 4. Render Bảng Xếp Hạng & HUD
  function renderState(state) {
    if (!state) return;

    // Đồng bộ vào 3D
    wuxia3d.syncState(state);

    // Cập nhật thẻ VÕ LÂM MINH CHỦ Top 1
    const champ = state.champion;
    const champCard = document.getElementById('championCard');
    if (champCard) {
      if (champ) {
        document.getElementById('champAvatar').innerText = champ.user.slice(0, 1).toUpperCase();
        document.getElementById('champName').innerText = champ.user;
        document.getElementById('champSect').innerText = `${getSectName(champ.sect)} • ${champ.weapon}`;
        document.getElementById('champStats').innerText = `🏆 Điểm: ${champ.score.toLocaleString()} | ⚔️ Hạ gục: ${champ.kills}`;
      } else {
        document.getElementById('champName').innerText = 'Chờ Đương Kim Minh Chủ...';
        document.getElementById('champSect').innerText = 'Gõ "chiến" hoặc tên binh khí để tham chiến!';
      }
    }

    // Cập nhật Top 2 - 6 (Ngũ Tuyệt)
    const listEl = document.getElementById('leaderboardList');
    if (listEl && state.leaderboard) {
      const runners = state.leaderboard.slice(1, 6);
      listEl.innerHTML = runners
        .map(
          (f, idx) => `
        <div class="lb-row">
          <span class="lb-rank">#${idx + 2}</span>
          <span class="lb-sect-badge" style="color: ${getSectColor(f.sect)}">${getSectBadge(f.sect)}</span>
          <span class="lb-name">${f.user}</span>
          <span class="lb-score">${f.score}đ</span>
        </div>
      `
        )
        .join('');
    }

    // Cập nhật Tỉ lệ Sức Mạnh 6 Môn Phái
    renderSectPowerBar(state.sectStats);

    // Cập nhật Top Header Stats
    const statKills = document.getElementById('statKills');
    const statFighters = document.getElementById('statFighters');
    if (statKills) statKills.innerText = state.totalKills || 0;
    if (statFighters) statFighters.innerText = state.activeFighters ? state.activeFighters.length : 0;

    // Cập nhật cài đặt nếu server gửi về
    if (state.settings?.graphics3D) {
      wuxia3d.applySettings(state.settings.graphics3D);
      syncSettingFormValues(state.settings.graphics3D);
    }
  }

  function renderSectPowerBar(sectStats) {
    const barEl = document.getElementById('sectPowerBar');
    if (!barEl || !sectStats) return;

    let total = 0;
    const sects = ['thieulam', 'vodang', 'caibang', 'ngami', 'minhgiao', 'duongmon'];
    sects.forEach((k) => (total += (sectStats[k]?.power || 10)));

    barEl.innerHTML = sects
      .map((k) => {
        const pct = Math.max(8, Math.round(((sectStats[k]?.power || 10) / total) * 100));
        return `<div class="sect-bar-seg" style="width: ${pct}%; background: ${getSectColor(k)}" title="${getSectName(k)}: ${pct}%"></div>`;
      })
      .join('');
  }

  function pushKillFeed(evt) {
    const feed = document.getElementById('killFeed');
    if (!feed) return;

    const item = document.createElement('div');
    item.className = 'kill-feed-item';

    if (evt.type === 'attack' && evt.isKill) {
      item.innerHTML = `⚔️ <strong style="color: ${getSectColor(evt.attacker.sect)}">${evt.attacker.user}</strong> [${evt.attacker.weapon}] đã trảm <span style="color: #ef4444">${evt.target.user}</span>!`;
    } else if (evt.type === 'ultimate') {
      item.innerHTML = `💥 <strong style="color: #fbbf24">${evt.fighter.user}</strong> tung tuyệt kỹ <span style="color: #f59e0b">${evt.ultimateSkill}</span>!`;
    } else if (evt.type === 'join') {
      item.innerHTML = `⚡ <strong style="color: ${getSectColor(evt.sect)}">${evt.user}</strong> cầm <em>${evt.weapon}</em> lên đài!`;
    } else {
      return;
    }

    feed.prepend(item);
    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 600);
    }, 4500);

    while (feed.children.length > 5) {
      feed.lastChild.remove();
    }
  }

  function pushAnnouncement(text) {
    const banner = document.getElementById('liveAnnouncement');
    if (!banner) return;
    banner.innerText = text;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 5000);
  }

  function updateConnStatus(connected) {
    const dot = document.getElementById('liveDot');
    if (dot) {
      dot.className = connected ? 'live-dot online' : 'live-dot offline';
    }
  }

  function updateTikTokBadge(tiktok) {
    const el = document.getElementById('tiktokStatusText');
    if (!el) return;
    if (tiktok?.connected) {
      el.innerText = `TIKTOK LIVE: @${tiktok.username} (${tiktok.viewerCount || 0} mắt xem)`;
    } else if (tiktok?.connecting) {
      el.innerText = `TIKTOK: Đang kết nối @${tiktok.username}...`;
    } else {
      el.innerText = `TIKTOK: Sẵn sàng kết nối`;
    }
  }

  // 5. CÀI ĐẶT THIẾT LẬP HÌNH ẢNH 3D (SETTINGS MODAL CONTROLLER)
  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', () => {
      settingsModal.classList.toggle('active');
    });
  }
  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });
  }

  // Lắng nghe thay đổi các trường trong Setting
  const settingFields = [
    'settingQuality',
    'settingCamera',
    'settingEnvironment',
    'settingAspect',
    'settingShadows',
    'settingKiAura',
    'settingSlashTrails',
    'settingDamageNumbers'
  ];

  settingFields.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      applyCurrentSettingsFromForm();
    });
  });

  function applyCurrentSettingsFromForm() {
    const quality = document.getElementById('settingQuality')?.value || 'high';
    const cameraMode = document.getElementById('settingCamera')?.value || 'cinematic';
    const environmentFx = document.getElementById('settingEnvironment')?.value || 'sakura';
    const aspectMode = document.getElementById('settingAspect')?.value || '9:16';
    const shadows = document.getElementById('settingShadows')?.checked ?? true;
    const kiAura = document.getElementById('settingKiAura')?.checked ?? true;
    const slashTrails = document.getElementById('settingSlashTrails')?.checked ?? true;
    const damageNumbers = document.getElementById('settingDamageNumbers')?.checked ?? true;

    const new3DSettings = {
      quality,
      cameraMode,
      environmentFx,
      aspectMode,
      shadows,
      kiAura,
      slashTrails,
      damageNumbers
    };

    // Áp dụng ngay cho 3D Engine
    wuxia3d.applySettings(new3DSettings);

    // Chuyển đổi tỷ lệ màn hình 9:16 vs 16:9
    const stageWrapper = document.getElementById('stageWrapper');
    if (stageWrapper) {
      if (aspectMode === '16:9') {
        stageWrapper.classList.add('aspect-16x9');
      } else {
        stageWrapper.classList.remove('aspect-16x9');
      }
      wuxia3d.onResize();
    }

    // Lưu và đồng bộ lên server
    sendRpc('wuxia.updateSettings', { graphics3D: new3DSettings });
  }

  function syncSettingFormValues(g3d) {
    if (!g3d) return;
    if (document.getElementById('settingQuality')) document.getElementById('settingQuality').value = g3d.quality;
    if (document.getElementById('settingCamera')) document.getElementById('settingCamera').value = g3d.cameraMode;
    if (document.getElementById('settingEnvironment')) document.getElementById('settingEnvironment').value = g3d.environmentFx;
    if (document.getElementById('settingAspect')) document.getElementById('settingAspect').value = g3d.aspectMode;
    if (document.getElementById('settingShadows')) document.getElementById('settingShadows').checked = g3d.shadows;
    if (document.getElementById('settingKiAura')) document.getElementById('settingKiAura').checked = g3d.kiAura;
    if (document.getElementById('settingSlashTrails')) document.getElementById('settingSlashTrails').checked = g3d.slashTrails;
    if (document.getElementById('settingDamageNumbers')) document.getElementById('settingDamageNumbers').checked = g3d.damageNumbers;
  }

  // Audio volume slider
  const sfxSlider = document.getElementById('sfxVolumeSlider');
  if (sfxSlider) {
    sfxSlider.addEventListener('input', (e) => {
      audio.sfxVolume = parseFloat(e.target.value);
    });
  }

  // Tiện ích môn phái
  function getSectColor(s) {
    const map = {
      thieulam: '#f59e0b',
      vodang: '#06b6d4',
      caibang: '#10b981',
      ngami: '#ec4899',
      minhgiao: '#ef4444',
      duongmon: '#8b5cf6'
    };
    return map[s] || '#f59e0b';
  }

  function getSectName(s) {
    const map = {
      thieulam: 'Thiếu Lâm',
      vodang: 'Võ Đang',
      caibang: 'Cái Bang',
      ngami: 'Nga Mi',
      minhgiao: 'Minh Giáo',
      duongmon: 'Đường Môn'
    };
    return map[s] || 'Võ Lâm';
  }

  function getSectBadge(s) {
    const map = {
      thieulam: '📿',
      vodang: '☯️',
      caibang: '🐉',
      ngami: '🌸',
      minhgiao: '🔥',
      duongmon: '⚡'
    };
    return map[s] || '⚔️';
  }

  // Bắt đầu kết nối
  connectWs();
})();
