/**
 * Club3DEngine - Real 3D Nightclub & Dance Floor Engine using Three.js
 * Tối ưu hóa chuẩn xác tuyệt đối theo game Sàn Quẩy (vn-tool.online/tool/san-quay):
 * - Sàn nhảy 3D LED 8x8 ô tỉ lệ nhỏ chuẩn xác (8 cột x 8 hàng = 64 ô LED phát sáng nhảy theo nhạc)
 * - Nền vũ trường 9:16 giữ trọn vẹn Bàn đĩa DJ, Bục SÀN QUẨY, Cầu Disco, Dàn loa (không xung đột)
 * - Nhân vật Mascot 3D đứng vững trên ô gạch, chân chạm mặt sàn, bóng tiếp xúc chân thực, vòng hào quang
 * - 2 Mâm đĩa than DJ phát sáng xoay tròn theo nhạc tại đúng vị trí bàn DJ
 * - Chùm tia sáng 3D (Volumetric God Rays) & Tia Laser quét sàn từ tâm quả cầu disco
 * - Bảng tên người xem dạng capsule tím neon nổi bật trên đầu
 */
import * as THREE from './vendor/three.module.js';

export class Club3DEngine {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || 1080;
    this.height = container.clientHeight || 1920;

    // 1. Scene & Renderer (alpha: true để nền vũ trường 9:16 hiển thị sắc nét)
    this.scene = new THREE.Scene();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // 2. Camera cố định chuẩn phối cảnh 9:16
    // pos: (0, 3.4, 7.5), look: (0, 0.6, 1.8), FOV: 46 độ
    this.camera = new THREE.PerspectiveCamera(46, this.width / this.height, 0.1, 100);
    this.camCurrentPos = new THREE.Vector3(0, 3.4, 7.5);
    this.camTargetPos = new THREE.Vector3(0, 3.4, 7.5);
    this.lookCurrent = new THREE.Vector3(0, 0.6, 1.8);
    this.lookTarget = new THREE.Vector3(0, 0.6, 1.8);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.lookCurrent);

    this.camPresets = [
      { name: 'overview', pos: new THREE.Vector3(0, 3.4, 7.5), look: new THREE.Vector3(0, 0.6, 1.8) },
      { name: 'closeup_dancers', pos: new THREE.Vector3(0, 2.3, 5.8), look: new THREE.Vector3(0, 0.45, 2.9) },
      { name: 'side_left', pos: new THREE.Vector3(-0.65, 2.2, 5.6), look: new THREE.Vector3(0.05, 0.45, 2.9) },
      { name: 'side_right', pos: new THREE.Vector3(0.65, 2.2, 5.6), look: new THREE.Vector3(-0.05, 0.45, 2.9) },
      { name: 'low_hero', pos: new THREE.Vector3(0, 1.75, 5.2), look: new THREE.Vector3(0, 0.45, 3.1) }
    ];
    this.currentPresetIndex = 0;
    this.zoomCountdown = 12;
    this.zoomCountdownTimer = 0;
    this.onZoomCountdownUpdate = null;

    // Zoom cận cảnh nhân vật khi Donate
    this.donorZoomActive = false;
    this.donorZoomTimer = 0;
    this.donorZoomDuration = 4.5;

    // 3. Texture Loader & Textures
    this.texLoader = new THREE.TextureLoader();
    this.mascotTextures = [];
    this.loadMascotTextures();

    // 4. Scene Groups
    this.floorGroup = new THREE.Group();
    this.raysGroup = new THREE.Group();
    this.dancersGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();

    this.scene.add(this.floorGroup);
    this.scene.add(this.raysGroup);
    this.scene.add(this.dancersGroup);
    this.scene.add(this.fxGroup);

    // 5. Build 8x8 LED Dance Floor & Dance Slots
    this.build8x8LedFloor();

    // 6. Build Environment (Ánh sáng, Tia sáng, Rồng Kim Long)
    this.buildLighting();
    this.buildVolumetricLightRays();
    this.buildGoldenDragon();

    // 7. Dancers Management
    this.dancersMap = new Map(); // uniqueId -> DancerObject

    // 8. Loop & Timing
    this.clock = new THREE.Clock();
    this.feverActive = false;
    this.bpm = 128;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    // Window resize
    window.addEventListener('resize', () => this.onResize());
  }

  loadMascotTextures() {
    for (let i = 1; i <= 9; i++) {
      const tex = this.texLoader.load(`/assets/mascots/mascot_${i}.png`);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.mascotTextures.push(tex);
    }
    this.shadowTex = this.createShadowTexture();
    this.ringTex = this.createFloorRingTexture();
  }

  createShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 58);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
    grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.40)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  createFloorRingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 14;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(128, 128, 105, 0, Math.PI * 2);
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
  }

  onResize() {
    this.width = this.container.clientWidth || 1080;
    this.height = this.container.clientHeight || 1920;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  buildLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.3);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(0, 8, 4);
    this.scene.add(dirLight);
  }

  // --------------------------------------------------------------------------
  // SÀN NHẢY 3D LED 8x8 Ô TỈ LỆ NHỎ CHUẨN XÁC (8 CỘT x 8 HÀNG = 64 Ô)
  // Khớp hoàn hảo phối cảnh từ chân bục DJ (Z=2.30) đến đáy màn hình (Z=3.90)
  // --------------------------------------------------------------------------
  build8x8LedFloor() {
    this.danceTiles = [];
    this.danceSlots = [];
    this.slotPriorityOrder = [];

    const numCols = 8;
    const numRows = 8;
    const zStart = 2.30;
    const zEnd = 3.90;

    // Bảng màu LED vũ trường neon rực rỡ
    const ledColors = [
      0x00f0ff, // Neon Cyan
      0xff007f, // Neon Magenta
      0xffdd00, // Neon Gold
      0x9d00ff, // Electric Purple
      0x00ff88, // Emerald Green
      0xff6600, // Sunset Orange
      0x00b0ff, // Sky Blue
      0xf72585  // Vivid Pink
    ];

    // Tạo 64 ô LED (8 hàng x 8 cột)
    for (let r = 0; r < numRows; r++) {
      const tRow = r / (numRows - 1); // 0 (xa nhất) -> 1 (gần nhất)
      const z = zStart + tRow * (zEnd - zStart);

      // Độ rộng sàn mở rộng theo phối cảnh (Perspective Trapezoid)
      const halfWidth = 0.98 + tRow * 0.36; // từ 0.98 (ở bục DJ) đến 1.34 (ở đáy)
      const tileWidth = (halfWidth * 2) / numCols;
      const tileDepth = ((zEnd - zStart) / numRows) * 0.88; // chừa khe hở 12% giữa các hàng
      const scale = 0.70 + tRow * 0.45; // scale từ 0.70 (hàng sau) đến 1.15 (hàng trước)

      for (let c = 0; c < numCols; c++) {
        const tCol = (c + 0.5) / numCols; // 0..1
        const x = -halfWidth + tCol * (halfWidth * 2);

        // Vị trí slot nhảy cho Mascot
        const slotIdx = this.danceSlots.length;
        this.danceSlots.push({ x, z, scale, row: r, col: c });

        // Tạo Mesh ô gạch LED phát sáng nằm phẳng trên mặt sàn (Y = 0.003)
        // Ô gạch có kích thước nhỏ tỉ lệ tinh tế (tileWidth * 0.88, tileDepth)
        const geo = new THREE.PlaneGeometry(tileWidth * 0.88, tileDepth);
        const baseColor = ledColors[(r * 3 + c * 2) % ledColors.length];

        const mat = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide
        });

        const tileMesh = new THREE.Mesh(geo, mat);
        tileMesh.rotation.x = -Math.PI / 2;
        tileMesh.position.set(x, 0.003, z);
        this.floorGroup.add(tileMesh);

        this.danceTiles.push({
          mesh: tileMesh,
          row: r,
          col: c,
          baseColor: baseColor,
          phase: (r * 0.45 + c * 0.35)
        });
      }
    }

    // Viền khung sàn LED phát sáng bao quanh 8x8 ô
    const borderPoints = [
      new THREE.Vector3(-0.98, 0.004, zStart),
      new THREE.Vector3(0.98, 0.004, zStart),
      new THREE.Vector3(1.34, 0.004, zEnd),
      new THREE.Vector3(-1.34, 0.004, zEnd),
      new THREE.Vector3(-0.98, 0.004, zStart)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      linewidth: 3
    });
    const borderLine = new THREE.Line(borderGeo, borderMat);
    this.floorGroup.add(borderLine);

    // Thứ tự ưu tiên phân bổ vị trí Dancers:
    // Bắt đầu từ tâm sân khấu (cột 3 & 4 hàng 5) để 1 nhân vật mặc định nhảy ngay chính giữa
    const rowOrder = [5, 4, 6, 3, 7, 2, 1, 0];
    const centerCols = [3, 4, 2, 5, 1, 6, 0, 7];
    for (const r of rowOrder) {
      for (const c of centerCols) {
        const idx = r * numCols + c;
        this.slotPriorityOrder.push(idx);
      }
    }
  }

  // --------------------------------------------------------------------------
  // CHÙM TIA SÁNG THỂ TÍCH 3D CỐ ĐỊNH GÓC ĐỘ (RỌI TỪ CẦU DISCO XUỐNG SÀN NHẢY)
  // --------------------------------------------------------------------------
  buildVolumetricLightRays() {
    this.volumetricRays = [];
    const rayColors = [
      0x00e5ff, 0xff007f, 0xffd600, 0x9d00ff,
      0x00e676, 0xff3d00, 0x00f5d4, 0xf72585
    ];

    // Tọa độ 3D khớp đúng tâm quả cầu disco ở đỉnh giữa màn hình (0.0, 2.367, -0.5)
    const discoOrigin = new THREE.Vector3(0.0, 2.367, -0.5);

    // 12 Chùm tia sáng hình nón rọi xuống sàn ở các góc cố định (không bị quay vòng vòng)
    for (let i = 0; i < 12; i++) {
      const fanAngle = ((i - 5.5) / 5.5) * 0.75; // góc quạt tỏa từ trái sang phải
      const depthAngle = 0.42 + (i % 3) * 0.08;
      const rayLen = 9.2;
      const coneGeo = new THREE.ConeGeometry(0.24, rayLen, 16, 1, true);
      coneGeo.translate(0, -rayLen / 2, 0);

      const color = rayColors[i % rayColors.length];
      const coneMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const rayMesh = new THREE.Mesh(coneGeo, coneMat);
      rayMesh.position.copy(discoOrigin);
      rayMesh.rotation.z = fanAngle;
      rayMesh.rotation.x = depthAngle;

      this.raysGroup.add(rayMesh);
      this.volumetricRays.push({
        mesh: rayMesh,
        baseAngle: i,
        baseOpacity: 0.28
      });
    }

    // 6 Chùm tia Laser sắc nét rọi xuống các vị trí cố định trên sàn nhảy
    this.laserLines = [];
    for (let i = 0; i < 6; i++) {
      const floorTarget = new THREE.Vector3((i - 2.5) * 0.48, 0.01, 3.1);
      const geo = new THREE.BufferGeometry().setFromPoints([
        discoOrigin,
        floorTarget
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: rayColors[i % rayColors.length],
        transparent: true,
        opacity: 0.80,
        linewidth: 2
      });
      const line = new THREE.Line(geo, mat);
      this.fxGroup.add(line);
      this.laserLines.push({
        line,
        origin: discoOrigin,
        target: floorTarget,
        baseX: (i - 2.5) * 0.48,
        speed: 1.0 + (i % 3) * 0.3,
        phase: i * 0.8
      });
    }
  }



  // --------------------------------------------------------------------------
  // RỒNG KIM LONG 3D ("CƯỠI RỒNG" SỰ KIỆN QUÀ VIP)
  // --------------------------------------------------------------------------
  buildGoldenDragon() {
    this.dragonGroup = new THREE.Group();
    const dragonTex = this.texLoader.load('/assets/golden_dragon.png');
    dragonTex.colorSpace = THREE.SRGBColorSpace;

    const dragonGeo = new THREE.PlaneGeometry(3.6, 2.2);
    const dragonMat = new THREE.MeshBasicMaterial({
      map: dragonTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.dragonMesh = new THREE.Mesh(dragonGeo, dragonMat);
    this.dragonGroup.add(this.dragonMesh);

    const auraGeo = new THREE.RingGeometry(0.7, 1.5, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffd600,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    });
    this.dragonAura = new THREE.Mesh(auraGeo, auraMat);
    this.dragonAura.rotation.x = -Math.PI / 2;
    this.dragonAura.position.y = -0.7;
    this.dragonGroup.add(this.dragonAura);

    this.dragonGroup.position.set(0, -10, 0);
    this.scene.add(this.dragonGroup);
    this.dragonActive = false;
    this.dragonTime = 0;
  }

  triggerDragonRide(userName = 'Khách VIP') {
    this.dragonActive = true;
    this.dragonTime = 0;
    this.dragonGroup.position.set(-4.5, 1.6, 1.2);
    this.setCameraPresetByName('side_sweep_left');

    setTimeout(() => {
      this.dragonActive = false;
      this.dragonGroup.position.set(0, -10, 0);
      this.setCameraPresetByName('overview');
    }, 9500);
  }

  // --------------------------------------------------------------------------
  // ĐỒNG BỘ NHÂN VẬT DANCERS 3D VÀO 64 Ô NHẢY TRÊN SÀN LED 8x8
  // --------------------------------------------------------------------------
  syncDancers(dancersData) {
    const activeIds = new Set();

    dancersData.forEach((d, idx) => {
      const id = d.id || d.uniqueId || d.name || `dancer_${idx}`;
      activeIds.add(id);

      // Phân bổ vào 64 vị trí theo thứ tự ưu tiên (Hàng giữa & trước lấp trước)
      const slotIdx = this.slotPriorityOrder[idx % this.slotPriorityOrder.length];
      const slot = this.danceSlots[slotIdx];

      let dancerObj = this.dancersMap.get(id);
      if (!dancerObj) {
        dancerObj = this.createDancerMesh(d, slot, id);
        this.dancersMap.set(id, dancerObj);
      } else {
        dancerObj.danceMove = d.danceMove || 'bounce';
        dancerObj.isGiant = !!d.isGiant;
        dancerObj.targetX = slot.x;
        dancerObj.targetZ = slot.z;
        dancerObj.slotScale = slot.scale;
      }
    });

    for (const [id, dancerObj] of this.dancersMap.entries()) {
      if (!activeIds.has(id)) {
        this.dancersGroup.remove(dancerObj.group);
        this.dancersMap.delete(id);
      }
    }
  }

  createDancerMesh(d, slot, id) {
    const group = new THREE.Group();
    group.position.set(slot.x, 0, slot.z);
    group.scale.setScalar(slot.scale);

    // 1. Bóng tiếp xúc mặt gạch (Contact Shadow) tại Y = 0.005
    const shadowGeo = new THREE.PlaneGeometry(0.44, 0.26);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      opacity: 0.85
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    group.add(shadow);

    // 2. Vòng hào quang neon phát sáng dưới chân (Neon Floor Ring) tại Y = 0.008
    const ringGeo = new THREE.PlaneGeometry(0.50, 0.50);
    const ringMat = new THREE.MeshBasicMaterial({
      map: this.ringTex,
      transparent: true,
      opacity: 0.75
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.008;
    group.add(ringMesh);

    // 3. Nhân vật Mascot 3D (Đế giày chạm sát mặt sàn Y = 0)
    const mascotIdx = ((d.mascotId || 1) - 1) % this.mascotTextures.length;
    const tex = this.mascotTextures[mascotIdx];

    const charGeo = new THREE.PlaneGeometry(0.54, 0.64);
    const charMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.10,
      side: THREE.DoubleSide
    });
    const charMesh = new THREE.Mesh(charGeo, charMat);
    charMesh.position.y = 0.32; // Đúng nửa chiều cao, đế giày nằm sát mặt gạch Y = 0
    group.add(charMesh);

    // 4. Bảng tên người xem trên đầu dạng capsule tím neon
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 256;
    badgeCanvas.height = 64;
    const bCtx = badgeCanvas.getContext('2d');

    // Nền gradient tím neon sang trọng
    const grad = bCtx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#7b2cbf');
    grad.addColorStop(1, '#c77dff');
    bCtx.fillStyle = grad;

    if (typeof bCtx.roundRect === 'function') {
      bCtx.roundRect(10, 8, 236, 48, 24);
    } else {
      bCtx.rect(10, 8, 236, 48);
    }
    bCtx.fill();
    bCtx.strokeStyle = '#ffffff';
    bCtx.lineWidth = 3;
    bCtx.stroke();

    bCtx.fillStyle = '#ffffff';
    bCtx.font = 'bold 23px sans-serif';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText(d.name || 'Khách VIP', 128, 32);

    const badgeTex = new THREE.CanvasTexture(badgeCanvas);
    const badgeGeo = new THREE.PlaneGeometry(0.58, 0.15);
    const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true });
    const badgeMesh = new THREE.Mesh(badgeGeo, badgeMat);
    badgeMesh.position.y = 0.76;
    group.add(badgeMesh);

    this.dancersGroup.add(group);

    return {
      id,
      name: d.name || id,
      group,
      charMesh,
      shadow,
      ringMesh,
      badgeMesh,
      danceMove: d.danceMove || 'bounce',
      isGiant: !!d.isGiant,
      targetX: slot.x,
      targetZ: slot.z,
      slotScale: slot.scale,
      phase: Math.random() * Math.PI * 2
    };
  }

  // --------------------------------------------------------------------------
  // LIA & ZOOM CẬN CẢNH TRỰC TIẾP VÀO NHÂN VẬT VỪA DONATE
  // --------------------------------------------------------------------------
  zoomToDonor(idOrName) {
    let targetDancer = null;
    if (idOrName) {
      targetDancer = this.dancersMap.get(idOrName);
      if (!targetDancer) {
        const needle = String(idOrName).toLowerCase().trim();
        for (const [id, d] of this.dancersMap.entries()) {
          const dName = String(d.name || '').toLowerCase();
          const dId = String(id).toLowerCase();
          if (dName === needle || dId === needle || dName.includes(needle) || needle.includes(dName)) {
            targetDancer = d;
            break;
          }
        }
      }
    }

    if (!targetDancer && this.dancersMap.size > 0) {
      targetDancer = this.dancersMap.values().next().value;
    }

    if (targetDancer) {
      const pos = targetDancer.group.position;
      // Lia góc và zoom cận cảnh trực tiếp vào nhân vật vừa donate
      this.camTargetPos.set(pos.x * 0.65, 1.40, pos.z + 1.55);
      this.lookTarget.set(pos.x, 0.42, pos.z);
      this.donorZoomActive = true;
      this.donorZoomTimer = 0;
      this.donorZoomDuration = 4.5; // Giữ 4.5s rồi tự quay về góc quay toàn cảnh

      // Hiệu ứng hào quang vàng rực dưới chân nhân vật vừa donate
      if (targetDancer.ringMesh) {
        targetDancer.ringMesh.material.color?.setHex?.(0xffd600);
        targetDancer.ringMesh.scale.set(1.4, 1.4, 1.4);
        setTimeout(() => {
          if (targetDancer.ringMesh) {
            targetDancer.ringMesh.material.color?.setHex?.(0x00e5ff);
            targetDancer.ringMesh.scale.set(1.0, 1.0, 1.0);
          }
        }, 4500);
      }
    }
  }

  // --------------------------------------------------------------------------
  // CAMERA DIRECTING SYSTEM (LIA GÓC MÁY ĐIỆN ẢNH)
  // --------------------------------------------------------------------------
  setCameraPreset(index) {
    this.currentPresetIndex = index % this.camPresets.length;
    const p = this.camPresets[this.currentPresetIndex];
    this.camTargetPos.copy(p.pos);
    this.lookTarget.copy(p.look);
    this.zoomCountdown = 12;
    if (this.onZoomCountdownUpdate) {
      this.onZoomCountdownUpdate(this.zoomCountdown);
    }
  }

  setCameraPresetByName(name) {
    const idx = this.camPresets.findIndex((p) => p.name === name);
    if (idx !== -1) {
      this.setCameraPreset(idx);
    }
  }

  nextCameraPreset() {
    this.setCameraPreset(this.currentPresetIndex + 1);
  }

  // --------------------------------------------------------------------------
  // MAIN ANIMATION LOOP
  // --------------------------------------------------------------------------
  animate() {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // 1. Quản lý lia & zoom nhân vật vừa donate hoặc đếm ngược chuyển góc máy
    if (this.donorZoomActive) {
      this.donorZoomTimer += delta;
      if (this.donorZoomTimer >= this.donorZoomDuration) {
        this.donorZoomActive = false;
        this.setCameraPresetByName('overview');
      }
    } else {
      this.zoomCountdownTimer += delta;
      if (this.zoomCountdownTimer >= 1.0) {
        this.zoomCountdownTimer = 0;
        this.zoomCountdown = Math.max(0, this.zoomCountdown - 1);
        if (this.onZoomCountdownUpdate) {
          this.onZoomCountdownUpdate(this.zoomCountdown);
        }
        if (this.zoomCountdown === 0) {
          this.nextCameraPreset();
        }
      }
    }

    // Camera lướt mượt mà (lerp) + dao động thở nhẹ (steadycam)
    const camSwayX = Math.sin(time * 0.7) * 0.015;
    const camSwayY = Math.cos(time * 0.5) * 0.010;
    this.camCurrentPos.lerp(this.camTargetPos, delta * 3.0);
    this.lookCurrent.lerp(this.lookTarget, delta * 3.5);

    this.camera.position.set(
      this.camCurrentPos.x + camSwayX,
      this.camCurrentPos.y + camSwayY,
      this.camCurrentPos.z
    );
    this.camera.lookAt(this.lookCurrent);

    // 2. Nhịp điệu EDM (128 BPM)
    const beatPhase = (time * (this.bpm / 60)) * Math.PI * 2;
    const feverMult = this.feverActive ? 2.5 : 1.0;

    // 3. Hiệu ứng 64 ô LED Dance Floor nhấp nháy theo nhịp điệu
    this.danceTiles.forEach((tile) => {
      const pulse = Math.sin(beatPhase + tile.phase * 1.5);
      if (this.feverActive) {
        // Chế độ Sàn Cháy: Chớp strobe rực lửa
        const feverStrobe = (Math.sin(time * 24 + tile.phase * 3.0) + 1.0) * 0.5;
        tile.mesh.material.opacity = 0.50 + feverStrobe * 0.45;
      } else {
        // Nhấp nháy êm dịu theo nhịp bass
        tile.mesh.material.opacity = 0.30 + Math.abs(pulse) * 0.38;
      }
    });

    // 5. Chùm tia sáng cố định góc độ, nhấp nháy êm dịu theo beat nhạc
    this.volumetricRays.forEach((r) => {
      const pulse = 0.22 + Math.sin(beatPhase + r.baseAngle * 0.8) * 0.16 * feverMult;
      r.mesh.material.opacity = Math.min(0.65, Math.max(0.10, pulse));
    });

    // 6. Tia laser quét sàn nhẹ nhàng quanh góc cố định
    this.laserLines.forEach((l) => {
      const curSweep = Math.sin(time * l.speed + l.phase) * 0.22;
      const pos = l.line.geometry.attributes.position;
      pos.setXYZ(1, l.baseX + curSweep, 0.01, 3.1);
      pos.needsUpdate = true;
    });

    // 7. Cập nhật nhân vật Dancers 3D đứng vững chắc trên sàn
    for (const d of this.dancersMap.values()) {
      d.group.position.x += (d.targetX - d.group.position.x) * delta * 5;
      d.group.position.z += (d.targetZ - d.group.position.z) * delta * 5;

      // Cylindrical Y-billboard: Xoay quanh trục Y hướng về camera, luôn vuông góc 90 độ với sàn gạch
      const angleY = Math.atan2(
        this.camera.position.x - d.group.position.x,
        this.camera.position.z - d.group.position.z
      );
      d.group.rotation.y = angleY;

      // Bước nhảy theo nhịp
      const bounce = Math.abs(Math.sin(beatPhase + d.phase));
      const targetScale = (d.isGiant ? 1.8 : 1.0) * d.slotScale;
      d.group.scale.setScalar(targetScale);

      d.charMesh.rotation.set(0, 0, 0);
      d.charMesh.position.x = 0;
      d.charMesh.position.z = 0;

      const move = d.danceMove;
      if (move === 'spin' || move === 'xoay_dau' || move === 'xoay') {
        d.charMesh.rotation.z = time * 14;
        d.charMesh.position.y = 0.32 + bounce * 0.22;
        d.shadow.scale.setScalar(0.85);
      } else if (move === 'flip' || move === 'lon_vong' || move === 'lon') {
        d.charMesh.rotation.x = time * 12;
        d.charMesh.position.y = 0.32 + bounce * 0.38;
        d.shadow.scale.setScalar(0.70);
      } else if (move === 'hiphop' || move === 'breakdance') {
        const sway = Math.sin(beatPhase * 2 + d.phase) * 0.08;
        d.charMesh.position.x = sway;
        d.charMesh.rotation.z = Math.sin(beatPhase + d.phase) * 0.08;
        d.charMesh.position.y = 0.32 + bounce * 0.16;
        d.shadow.scale.setScalar(1.0 - bounce * 0.15);
      } else if (move === 'wave' || move === 'shuffle') {
        const waveSway = Math.cos(beatPhase + d.phase) * 0.10;
        d.charMesh.position.x = waveSway;
        d.charMesh.position.y = 0.32 + bounce * 0.12;
        d.shadow.scale.setScalar(1.0 - bounce * 0.10);
      } else if (move === 'catwalk') {
        d.charMesh.position.z = Math.sin(beatPhase + d.phase) * 0.15;
        d.charMesh.position.y = 0.32 + bounce * 0.14;
        d.shadow.scale.setScalar(0.95);
      } else {
        // Nhảy nhún tự do
        d.charMesh.position.y = 0.32 + bounce * 0.20;
        d.shadow.scale.setScalar(1.0 - bounce * 0.18);
      }

      // Xoay nhẹ vòng hào quang chân
      d.ringMesh.rotation.z += delta * 1.5;
      d.badgeMesh.position.y = 0.76 + bounce * 0.08;
    }

    // 8. Bay Rồng Kim Long nếu đang kích hoạt
    if (this.dragonActive) {
      this.dragonTime += delta;
      const prog = this.dragonTime / 9.0;
      const x = -4.5 + prog * 9.0;
      const y = 1.6 + Math.sin(this.dragonTime * 2.5) * 0.35;
      const z = 1.2 + Math.cos(this.dragonTime * 1.5) * 0.8;
      this.dragonGroup.position.set(x, y, z);
      this.dragonAura.rotation.z += delta * 3.0;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
