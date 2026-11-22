/**
 * Wuxia3D — 3D Martial Arts Arena Engine (Three.js)
 * Hoa Sơn Luận Kiếm • Lôi Đài Bát Quái • 6 Đại Môn Phái & Võ Lâm Minh Chủ
 */
import * as THREE from '/vendor/three/three.module.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';

class Wuxia3DEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container #${containerId} not found`);

    // Cài đặt đồ họa 3D mặc định
    this.settings = {
      quality: 'high',
      shadows: true,
      kiAura: true,
      slashTrails: true,
      damageNumbers: true,
      environmentFx: 'sakura',
      cameraMode: 'cinematic',
      aspectMode: '9:16'
    };

    this.fighters = new Map(); // key: uniqueId -> Fighter3D
    this.championId = null;
    this.vfxList = [];
    this.floatingTexts = [];
    this.clock = new THREE.Clock();

    this.initScene();
    this.initArena();
    this.initEnvironment();
    this.initControls();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // --------------------------------------------------------------------------
  // 1. SCENE, CAMERA, LIGHTING & RENDERER
  // --------------------------------------------------------------------------
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a060d');
    this.scene.fog = new THREE.FogExp2('#140b1c', 0.015);

    this.camera = new THREE.PerspectiveCamera(50, 1080 / 1920, 0.5, 500);
    this.camera.position.set(0, 18, 32);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.container.appendChild(this.renderer.domElement);

    // Ánh sáng lôi đài hoàng hôn kiếm hiệp
    this.ambientLight = new THREE.AmbientLight('#b8a5d4', 0.85);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight('#ffe194', 2.2);
    this.sunLight.position.set(25, 45, 20);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 30;
    this.sunLight.shadow.camera.bottom = -30;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Đèn màu tím lam kịch tính phản chiếu từ đỉnh núi
    this.rimLight = new THREE.DirectionalLight('#6366f1', 1.2);
    this.rimLight.position.set(-25, 20, -25);
    this.scene.add(this.rimLight);
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 65;
    this.controls.target.set(0, 3, 0);
    this.controls.enabled = false; // Mặc định dùng Camera Modes tự động
  }

  // --------------------------------------------------------------------------
  // 2. DỰNG LÔI ĐÀI BÁT QUÁI HOA SƠN 3D (WUXIA BAGUA ARENA)
  // --------------------------------------------------------------------------
  initArena() {
    this.arenaGroup = new THREE.Group();
    this.scene.add(this.arenaGroup);

    // 1. Sàn Lôi Đài Bát Giác Bát Quái
    const stageRadius = 18;
    const stageGeo = new THREE.CylinderGeometry(stageRadius, stageRadius + 1.5, 2.5, 8);
    const stageMat = new THREE.MeshStandardMaterial({
      color: '#2a1e2f',
      roughness: 0.7,
      metalness: 0.15
    });
    const stageMesh = new THREE.Mesh(stageGeo, stageMat);
    stageMesh.position.y = 1.25;
    stageMesh.receiveShadow = true;
    this.arenaGroup.add(stageMesh);

    // 2. Vòng Thái Cực Bát Quái trên mặt sàn
    const baguaCanvas = document.createElement('canvas');
    baguaCanvas.width = 1024;
    baguaCanvas.height = 1024;
    const bctx = baguaCanvas.getContext('2d');

    // Nền đá cổ
    bctx.fillStyle = '#221526';
    bctx.fillRect(0, 0, 1024, 1024);

    // Vòng tròn ngoài viền vàng kim
    bctx.strokeStyle = '#d4af37';
    bctx.lineWidth = 14;
    bctx.beginPath();
    bctx.arc(512, 512, 480, 0, Math.PI * 2);
    bctx.stroke();

    bctx.lineWidth = 6;
    bctx.beginPath();
    bctx.arc(512, 512, 440, 0, Math.PI * 2);
    bctx.stroke();

    // 8 Quẻ Bát Quái (Càn, Khảm, Cấn, Chấn, Tốn, Ly, Khôn, Đoài)
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      bctx.save();
      bctx.translate(512, 512);
      bctx.rotate(angle);
      bctx.fillStyle = '#f4c150';
      bctx.fillRect(-35, -460, 70, 10);
      bctx.fillRect(-35, -440, 70, 10);
      bctx.fillRect(-35, -420, 70, 10);
      bctx.restore();
    }

    // Đồ hình Thái Cực Âm Dương trung tâm
    bctx.save();
    bctx.translate(512, 512);
    bctx.fillStyle = '#ffffff';
    bctx.beginPath();
    bctx.arc(0, 0, 240, -Math.PI / 2, Math.PI / 2, false);
    bctx.fill();

    bctx.fillStyle = '#110b14';
    bctx.beginPath();
    bctx.arc(0, 0, 240, Math.PI / 2, -Math.PI / 2, false);
    bctx.fill();

    bctx.fillStyle = '#ffffff';
    bctx.beginPath();
    bctx.arc(0, 120, 120, 0, Math.PI * 2);
    bctx.fill();

    bctx.fillStyle = '#110b14';
    bctx.beginPath();
    bctx.arc(0, -120, 120, 0, Math.PI * 2);
    bctx.fill();

    // Mắt Thái Cực
    bctx.fillStyle = '#110b14';
    bctx.beginPath();
    bctx.arc(0, 120, 36, 0, Math.PI * 2);
    bctx.fill();

    bctx.fillStyle = '#ffffff';
    bctx.beginPath();
    bctx.arc(0, -120, 36, 0, Math.PI * 2);
    bctx.fill();
    bctx.restore();

    const baguaTex = new THREE.CanvasTexture(baguaCanvas);
    const ringGeo = new THREE.CircleGeometry(stageRadius - 0.2, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      map: baguaTex,
      roughness: 0.65,
      metalness: 0.25
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 2.52;
    ringMesh.receiveShadow = true;
    this.arenaGroup.add(ringMesh);

    // 3. 4 Cột Trụ Rồng Thần Uy Nghi ở 4 góc
    const pillarAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const pillarDist = stageRadius - 2;

    pillarAngles.forEach((ang) => {
      const px = Math.cos(ang) * pillarDist;
      const pz = Math.sin(ang) * pillarDist;

      // Trụ đá đỏ son
      const colGeo = new THREE.CylinderGeometry(0.7, 0.9, 10, 12);
      const colMat = new THREE.MeshStandardMaterial({ color: '#7a1c1c', roughness: 0.5 });
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(px, 7.5, pz);
      col.castShadow = true;
      col.receiveShadow = true;
      this.arenaGroup.add(col);

      // Đỉnh trụ rồng dát vàng
      const topGeo = new THREE.ConeGeometry(1.3, 1.8, 12);
      const topMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.8, roughness: 0.3 });
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.set(px, 13.2, pz);
      this.arenaGroup.add(top);

      // Đèn lồng / Chân hỏa trên đỉnh cột
      const fireLight = new THREE.PointLight('#f97316', 1.2, 16);
      fireLight.position.set(px, 12.5, pz);
      this.arenaGroup.add(fireLight);
    });

    // 4. Dãy Núi Hoa Sơn Hùng Vĩ bao quanh phía xa
    this.initMountains();
  }

  initMountains() {
    const mountainGroup = new THREE.Group();
    const mtnMat = new THREE.MeshStandardMaterial({
      color: '#1a1024',
      roughness: 0.95
    });

    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const dist = 75 + Math.random() * 30;
      const height = 45 + Math.random() * 35;
      const mGeo = new THREE.ConeGeometry(18 + Math.random() * 12, height, 5);
      const mMesh = new THREE.Mesh(mGeo, mtnMat);
      mMesh.position.set(Math.cos(angle) * dist, height / 2 - 10, Math.sin(angle) * dist);
      mountainGroup.add(mMesh);
    }
    this.scene.add(mountainGroup);
  }

  // --------------------------------------------------------------------------
  // 3. MÔI TRƯỜNG & HẠT PARTICLES (SAKURA / SNOW / FIRE / FOG)
  // --------------------------------------------------------------------------
  initEnvironment() {
    this.envParticlesGroup = new THREE.Group();
    this.scene.add(this.envParticlesGroup);
    this.rebuildEnvironmentParticles();
  }

  rebuildEnvironmentParticles() {
    // Xóa hạt cũ
    while (this.envParticlesGroup.children.length > 0) {
      const obj = this.envParticlesGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      this.envParticlesGroup.remove(obj);
    }

    const type = this.settings.environmentFx;
    if (type === 'none') return;

    const count = this.settings.quality === 'low' ? 80 : this.settings.quality === 'medium' ? 200 : 450;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count * 3);

    let color = '#f472b6'; // Mặc định Sakura hồng phấn
    let size = 0.55;

    if (type === 'snow') {
      color = '#e2e8f0';
      size = 0.4;
    } else if (type === 'fire') {
      color = '#f97316';
      size = 0.6;
    } else if (type === 'fog') {
      color = '#94a3b8';
      size = 1.2;
    }

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = Math.random() * 30 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      speeds[i * 3] = (Math.random() - 0.5) * 0.05;
      speeds[i * 3 + 1] = type === 'fire' ? 0.04 + Math.random() * 0.06 : -(0.03 + Math.random() * 0.05);
      speeds[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData.speeds = speeds;

    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });

    this.envPoints = new THREE.Points(geo, mat);
    this.envParticlesGroup.add(this.envPoints);
  }

  updateEnvironmentParticles(dt) {
    if (!this.envPoints) return;
    const pos = this.envPoints.geometry.attributes.position;
    const speeds = this.envPoints.geometry.userData.speeds;
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      pos.array[i * 3] += speeds[i * 3];
      pos.array[i * 3 + 1] += speeds[i * 3 + 1];
      pos.array[i * 3 + 2] += speeds[i * 3 + 2];

      if (pos.array[i * 3 + 1] < 1.5) {
        pos.array[i * 3 + 1] = 28;
      } else if (pos.array[i * 3 + 1] > 30) {
        pos.array[i * 3 + 1] = 1.6;
      }
    }
    pos.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // 4. MÔ HÌNH ĐẤU SĨ 3D (3D FIGHTER CHARACTER)
  // --------------------------------------------------------------------------
  createFighter3D(data) {
    const group = new THREE.Group();
    group.userData.id = data.id;
    group.userData.uniqueId = data.uniqueId;
    group.userData.sect = data.sect;
    group.userData.weaponType = data.weaponType;

    const sectColor = new THREE.Color(this.getSectColor(data.sect));

    // 1. Thân áo Đạo phục / Võ phục
    const bodyGeo = new THREE.CylinderGeometry(0.55, 0.4, 1.8, 10);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: sectColor,
      roughness: 0.6,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.9;
    body.castShadow = this.settings.shadows;
    body.receiveShadow = true;
    group.add(body);
    group.userData.bodyMesh = body;

    // 2. Đầu nhân vật
    const headGeo = new THREE.SphereGeometry(0.48, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: '#fcd34d', roughness: 0.5 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 3.2;
    head.castShadow = this.settings.shadows;
    group.add(head);

    // Dải khăn buộc đầu môn phái
    const bandGeo = new THREE.TorusGeometry(0.49, 0.08, 8, 16);
    const bandMat = new THREE.MeshStandardMaterial({ color: sectColor });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 3.25;
    group.add(band);

    // 3. Hai tay cầm binh khí
    const armGeo = new THREE.CylinderGeometry(0.18, 0.15, 1.2, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: sectColor });

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.7, 2.0, 0);
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = this.settings.shadows;
    group.add(rightArm);
    group.userData.rightArm = rightArm;

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.7, 2.0, 0);
    leftArm.rotation.z = Math.PI / 6;
    leftArm.castShadow = this.settings.shadows;
    group.add(leftArm);
    group.userData.leftArm = leftArm;

    // 4. Binh Khí 3D tương xứng Môn Phái trên tay phải
    const weaponMesh = this.buildWeapon3D(data.sect, data.weaponType);
    weaponMesh.position.set(0, -0.6, 0.4);
    weaponMesh.rotation.x = Math.PI / 3;
    rightArm.add(weaponMesh);
    group.userData.weaponMesh = weaponMesh;

    // 5. Hào quang Chân Khí dưới chân (Ki Aura)
    const auraCanvas = document.createElement('canvas');
    auraCanvas.width = 128;
    auraCanvas.height = 128;
    const actx = auraCanvas.getContext('2d');
    const agrad = actx.createRadialGradient(64, 64, 10, 64, 64, 60);
    agrad.addColorStop(0, this.getSectColor(data.sect));
    agrad.addColorStop(0.8, 'rgba(0,0,0,0)');
    actx.fillStyle = agrad;
    actx.fillRect(0, 0, 128, 128);

    const auraTex = new THREE.CanvasTexture(auraCanvas);
    const auraGeo = new THREE.PlaneGeometry(3.2, 3.2);
    const auraMat = new THREE.MeshBasicMaterial({
      map: auraTex,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.rotation.x = -Math.PI / 2;
    auraMesh.position.y = 0.05;
    group.add(auraMesh);
    group.userData.auraMesh = auraMesh;

    // 6. Vương Miện & Rồng Vàng cho VÕ LÂM MINH CHỦ
    const crown = this.buildCrown();
    crown.position.y = 3.8;
    crown.visible = false;
    group.add(crown);
    group.userData.crown = crown;

    const miniDragon = this.buildOrbitDragon();
    miniDragon.visible = false;
    group.add(miniDragon);
    group.userData.miniDragon = miniDragon;

    // 7. Bảng Tên & Thanh Máu 3D (3D Nameplate Billboard)
    const nameplate = this.buildNameplateSprite(data);
    nameplate.position.y = 4.5;
    group.add(nameplate);
    group.userData.nameplate = nameplate;

    // Vị trí xuất hiện ngẫu nhiên trên lôi đài
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = 4 + Math.random() * 10;
    group.position.set(Math.cos(spawnAngle) * spawnDist, 2.5, Math.sin(spawnAngle) * spawnDist);

    group.userData.targetPos = group.position.clone();
    group.userData.state = 'idle';
    group.userData.actionTime = 0;
    group.userData.hp = data.hp || 1000;
    group.userData.maxHp = data.maxHp || 1000;

    this.scene.add(group);
    return group;
  }

  buildWeapon3D(sect, weaponType) {
    const weaponGroup = new THREE.Group();

    if (weaponType === 'kiem' || sect === 'vodang') {
      // Thái Cực Kiếm: Lưỡi kiếm mảnh sắc bén, chuôi kiếm có tua kiếm
      const bladeGeo = new THREE.BoxGeometry(0.12, 2.6, 0.04);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: '#e0f2fe',
        metalness: 0.95,
        roughness: 0.15
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 1.3;
      weaponGroup.add(blade);

      const guardGeo = new THREE.BoxGeometry(0.6, 0.1, 0.15);
      const guardMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.8 });
      const guard = new THREE.Mesh(guardGeo, guardMat);
      weaponGroup.add(guard);
    } else if (weaponType === 'dao' || sect === 'minhgiao') {
      // Huyết Long Đao: Bản đao rộng cong vút, rực lửa đỏ
      const bladeGeo = new THREE.BoxGeometry(0.35, 2.4, 0.06);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: '#f87171',
        metalness: 0.85,
        roughness: 0.2
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 1.2;
      weaponGroup.add(blade);

      const hiltGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8);
      const hiltMat = new THREE.MeshStandardMaterial({ color: '#7f1d1d' });
      const hilt = new THREE.Mesh(hiltGeo, hiltMat);
      hilt.position.y = -0.4;
      weaponGroup.add(hilt);
    } else if (weaponType === 'con' || sect === 'thieulam') {
      // Hàng Ma Côn: Hai đầu bịt vàng hoàng kim, thân gỗ mun
      const staffGeo = new THREE.CylinderGeometry(0.09, 0.09, 3.2, 10);
      const staffMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        metalness: 0.7,
        roughness: 0.3
      });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      weaponGroup.add(staff);
    } else if (weaponType === 'bong' || sect === 'caibang') {
      // Đả Cẩu Bổng: Bằng ngọc lục bảo xanh biếc
      const staffGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 10);
      const staffMat = new THREE.MeshStandardMaterial({
        color: '#10b981',
        metalness: 0.4,
        roughness: 0.1
      });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      weaponGroup.add(staff);
    } else if (weaponType === 'songkiem' || sect === 'ngami') {
      // Ỷ Thiên Kiếm: Sắc tím hồng thanh tao
      const bladeGeo = new THREE.BoxGeometry(0.1, 2.4, 0.04);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: '#f472b6',
        metalness: 0.9,
        roughness: 0.2
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 1.2;
      weaponGroup.add(blade);
    } else {
      // Đường Môn: Phi Tiêu Bát Giác quay tít
      const starGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 8);
      const starMat = new THREE.MeshStandardMaterial({ color: '#a78bfa', metalness: 0.9 });
      const star = new THREE.Mesh(starGeo, starMat);
      weaponGroup.add(star);
    }

    return weaponGroup;
  }

  buildCrown() {
    const crownGroup = new THREE.Group();
    const circGeo = new THREE.TorusGeometry(0.35, 0.06, 8, 16);
    const goldMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.95, roughness: 0.1 });
    const ring = new THREE.Mesh(circGeo, goldMat);
    ring.rotation.x = Math.PI / 2;
    crownGroup.add(ring);

    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const spikeGeo = new THREE.ConeGeometry(0.08, 0.3, 6);
      const spike = new THREE.Mesh(spikeGeo, goldMat);
      spike.position.set(Math.cos(ang) * 0.35, 0.15, Math.sin(ang) * 0.35);
      crownGroup.add(spike);
    }
    return crownGroup;
  }

  buildOrbitDragon() {
    const dragonGroup = new THREE.Group();
    const curvePoints = [];
    for (let i = 0; i <= 24; i++) {
      const theta = (i / 24) * Math.PI * 4;
      const r = 2.2;
      const y = (i / 24) * 3 - 0.5;
      curvePoints.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
    }
    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.15, 8, false);
    const dragonMat = new THREE.MeshStandardMaterial({
      color: '#f59e0b',
      emissive: '#d97706',
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.8
    });
    const dragon = new THREE.Mesh(tubeGeo, dragonMat);
    dragonGroup.add(dragon);
    return dragonGroup;
  }

  buildNameplateSprite(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');

    const sectColor = this.getSectColor(data.sect);
    const isChamp = data.isChampion;

    // Nền thẻ tên bo góc
    ctx.fillStyle = isChamp ? 'rgba(55, 30, 5, 0.88)' : 'rgba(15, 10, 20, 0.82)';
    ctx.strokeStyle = isChamp ? '#fbbf24' : sectColor;
    ctx.lineWidth = isChamp ? 6 : 3;

    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 120, 16);
    ctx.fill();
    ctx.stroke();

    // Tên & Danh hiệu
    ctx.font = isChamp ? 'bold 36px sans-serif' : 'bold 30px sans-serif';
    ctx.fillStyle = isChamp ? '#fef08a' : '#ffffff';
    ctx.textAlign = 'center';
    const titleText = isChamp ? `👑 VÕ LÂM MINH CHỦ: ${data.user}` : `${data.user} [${this.getSectName(data.sect)}]`;
    ctx.fillText(titleText, 256, 52);

    // Thanh máu HP (Green -> Red)
    const hp = data.hp != null ? data.hp : 1000;
    const maxHp = data.maxHp || 1000;
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(40, 72, 432, 22);

    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#eab308' : '#ef4444';
    ctx.fillRect(40, 72, 432 * hpRatio, 22);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 72, 432, 22);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.round(hp)} / ${maxHp}`, 256, 90);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.2, 1.15, 1);
    sprite.userData.canvas = canvas;
    sprite.userData.ctx = ctx;
    sprite.userData.texture = texture;
    return sprite;
  }

  updateNameplate(fighterMesh, data) {
    const sprite = fighterMesh.userData.nameplate;
    if (!sprite) return;
    const { canvas, ctx, texture } = sprite.userData;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sectColor = this.getSectColor(data.sect);
    const isChamp = data.isChampion;

    ctx.fillStyle = isChamp ? 'rgba(55, 30, 5, 0.88)' : 'rgba(15, 10, 20, 0.82)';
    ctx.strokeStyle = isChamp ? '#fbbf24' : sectColor;
    ctx.lineWidth = isChamp ? 6 : 3;

    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 120, 16);
    ctx.fill();
    ctx.stroke();

    ctx.font = isChamp ? 'bold 36px sans-serif' : 'bold 30px sans-serif';
    ctx.fillStyle = isChamp ? '#fef08a' : '#ffffff';
    ctx.textAlign = 'center';
    const titleText = isChamp ? `👑 VÕ LÂM MINH CHỦ: ${data.user}` : `${data.user} [${this.getSectName(data.sect)}]`;
    ctx.fillText(titleText, 256, 52);

    const hp = data.hp != null ? data.hp : 1000;
    const maxHp = data.maxHp || 1000;
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(40, 72, 432, 22);

    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#eab308' : '#ef4444';
    ctx.fillRect(40, 72, 432 * hpRatio, 22);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 72, 432, 22);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.round(hp)} / ${maxHp}`, 256, 90);

    texture.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // 5. HIỆU ỨNG CHIẾN ĐẤU & ĐẠI TUYỆT KỸ (3D VFX)
  // --------------------------------------------------------------------------
  playAttackVfx(attacker, target, isCrit, skillName) {
    const aMesh = this.fighters.get(attacker.uniqueId);
    const tMesh = target ? this.fighters.get(target.uniqueId) : null;
    if (!aMesh) return;

    // 1. Hoạt họa vung kiếm chém
    aMesh.userData.state = 'attack';
    aMesh.userData.actionTime = 0.45;

    if (tMesh) {
      // Xoay mặt về phía đối thủ
      aMesh.lookAt(tMesh.position.x, aMesh.position.y, tMesh.position.z);

      // Lướt nhẹ tới tấn công
      const dir = new THREE.Vector3().subVectors(tMesh.position, aMesh.position).normalize();
      aMesh.position.addScaledVector(dir, 1.2);

      // Hiệu ứng tia lửa va chạm binh khí (Hit Sparks)
      this.spawnHitSparks(tMesh.position.clone().add(new THREE.Vector3(0, 2, 0)), isCrit);

      // Rung lắc khi bị trúng đòn
      tMesh.userData.state = 'hit';
      tMesh.userData.actionTime = 0.3;
      tMesh.position.addScaledVector(dir, 0.8);
    }

    // 2. Vệt chém đao quang kiếm ảnh (Slash Arc Trail)
    if (this.settings.slashTrails) {
      this.spawnSlashArc(aMesh.position.clone().add(new THREE.Vector3(0, 2, 0)), attacker.sect, isCrit);
    }
  }

  spawnSlashArc(pos, sect, isCrit) {
    const radius = isCrit ? 3.5 : 2.4;
    const arcGeo = new THREE.RingGeometry(radius - 0.4, radius, 16, 1, 0, Math.PI * 0.8);
    const color = isCrit ? '#fef08a' : this.getSectColor(sect);
    const arcMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    const arc = new THREE.Mesh(arcGeo, arcMat);
    arc.position.copy(pos);
    arc.rotation.x = Math.PI / 4 + Math.random() * 0.4;
    arc.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(arc);

    this.vfxList.push({
      mesh: arc,
      life: 0.25,
      maxLife: 0.25,
      update: (dt, item) => {
        item.mesh.scale.multiplyScalar(1 + dt * 2);
        item.mesh.material.opacity = item.life / item.maxLife;
      }
    });
  }

  spawnHitSparks(pos, isCrit) {
    const count = isCrit ? 35 : 18;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      velocities[i * 3] = (Math.random() - 0.5) * 8;
      velocities[i * 3 + 1] = Math.random() * 6 + 1;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: isCrit ? '#fef08a' : '#f97316',
      size: isCrit ? 0.45 : 0.3,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.vfxList.push({
      mesh: points,
      velocities,
      life: 0.4,
      maxLife: 0.4,
      update: (dt, item) => {
        const p = item.mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          p.array[i * 3] += item.velocities[i * 3] * dt;
          p.array[i * 3 + 1] += item.velocities[i * 3 + 1] * dt - 9.8 * dt * dt;
          p.array[i * 3 + 2] += item.velocities[i * 3 + 2] * dt;
        }
        p.needsUpdate = true;
        item.mesh.material.opacity = item.life / item.maxLife;
      }
    });
  }

  spawnDamageNumber(pos, text, isCrit = false, isHeal = false) {
    if (!this.settings.damageNumbers) return;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    ctx.font = isCrit ? 'bold 44px sans-serif' : 'bold 36px sans-serif';
    ctx.textAlign = 'center';

    if (isHeal) {
      ctx.fillStyle = '#4ade80';
      ctx.strokeStyle = '#052e16';
    } else if (isCrit) {
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#854d0e';
    } else {
      ctx.fillStyle = '#f87171';
      ctx.strokeStyle = '#450a0a';
    }
    ctx.lineWidth = 5;
    ctx.strokeText(text, 128, 54);
    ctx.fillText(text, 128, 54);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3, 1, 1);
    sprite.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 3.2, (Math.random() - 0.5) * 1.5));
    this.scene.add(sprite);

    this.floatingTexts.push({
      sprite,
      life: 0.8,
      maxLife: 0.8,
      update: (dt, item) => {
        item.sprite.position.y += dt * 2.5;
        item.sprite.material.opacity = item.life / item.maxLife;
      }
    });
  }

  // Đại Tuyệt Kỹ Môn Phái (Rồng Vàng Giáng Long / Kiếm Trận Thái Cực / Như Lai Thần Chưởng)
  playUltimateVfx(fighterData, skillName) {
    const fMesh = this.fighters.get(fighterData.uniqueId);
    const center = fMesh ? fMesh.position.clone() : new THREE.Vector3(0, 2.5, 0);

    // Vòng sóng khí công bùng nổ khổng lồ trên mặt sàn
    const shockGeo = new THREE.RingGeometry(1, 14, 32);
    const shockMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.getSectColor(fighterData.sect)),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const shock = new THREE.Mesh(shockGeo, shockMat);
    shock.rotation.x = -Math.PI / 2;
    shock.position.set(center.x, 2.6, center.z);
    this.scene.add(shock);

    this.vfxList.push({
      mesh: shock,
      life: 0.9,
      maxLife: 0.9,
      update: (dt, item) => {
        item.mesh.scale.multiplyScalar(1 + dt * 3);
        item.mesh.material.opacity = (item.life / item.maxLife) * 0.9;
      }
    });

    // Cột sáng chân khí bắn thẳng lên trời
    const beamGeo = new THREE.CylinderGeometry(2.5, 3.5, 35, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fbbf24'),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(center.x, 18, center.z);
    this.scene.add(beam);

    this.vfxList.push({
      mesh: beam,
      life: 1.2,
      maxLife: 1.2,
      update: (dt, item) => {
        item.mesh.rotation.y += dt * 5;
        item.mesh.material.opacity = (item.life / item.maxLife) * 0.85;
      }
    });

    this.spawnDamageNumber(center, `🌟 ${skillName}!`, true);
  }

  // --------------------------------------------------------------------------
  // 6. ĐỒNG BỘ TRẠNG THÁI TỪ SERVER
  // --------------------------------------------------------------------------
  syncState(state) {
    if (!state) return;

    this.championId = state.champion ? state.champion.uniqueId : null;

    // Cập nhật hoặc thêm đấu sĩ mới
    const activeIds = new Set();
    const fightersList = state.activeFighters || [];

    fightersList.forEach((data) => {
      activeIds.add(data.uniqueId);
      let fMesh = this.fighters.get(data.uniqueId);

      if (!fMesh) {
        fMesh = this.createFighter3D(data);
        this.fighters.set(data.uniqueId, fMesh);
      }

      // Cập nhật HP và Nameplate
      fMesh.userData.hp = data.hp;
      fMesh.userData.maxHp = data.maxHp;
      this.updateNameplate(fMesh, data);

      // Bật hiệu ứng Minh Chủ
      const isChamp = data.uniqueId === this.championId;
      if (fMesh.userData.crown) fMesh.userData.crown.visible = isChamp;
      if (fMesh.userData.miniDragon) fMesh.userData.miniDragon.visible = isChamp;
    });

    // Ẩn đấu sĩ không còn active
    for (const [id, fMesh] of this.fighters.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(fMesh);
        this.fighters.delete(id);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 7. CÀI ĐẶT HÌNH ẢNH 3D & CAMERA MODES (SETTING MENU DISPATCHER)
  // --------------------------------------------------------------------------
  applySettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };

    // 1. Chất lượng đồ họa
    if (this.settings.quality === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1.0);
    } else if (this.settings.quality === 'medium') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.setPixelRatio(1.2);
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    }

    // 2. Đổ bóng
    this.sunLight.castShadow = this.settings.shadows && this.settings.quality !== 'low';

    // 3. Hào quang Ki Aura
    for (const fMesh of this.fighters.values()) {
      if (fMesh.userData.auraMesh) {
        fMesh.userData.auraMesh.visible = this.settings.kiAura;
      }
    }

    // 4. Môi trường (Sakura / Snow / Fire / Fog)
    this.rebuildEnvironmentParticles();

    // 5. Camera mode
    this.controls.enabled = this.settings.cameraMode === 'orbit';
  }

  updateCamera(dt, time) {
    const mode = this.settings.cameraMode;

    if (mode === 'orbit') {
      this.controls.update();
      return;
    }

    if (mode === 'cinematic') {
      // Xoay tròn cinematic quanh lôi đài
      const r = 32;
      const speed = 0.15;
      this.camera.position.x = Math.cos(time * speed) * r;
      this.camera.position.z = Math.sin(time * speed) * r;
      this.camera.position.y = 16 + Math.sin(time * 0.4) * 3;
      this.camera.lookAt(0, 3, 0);
    } else if (mode === 'champion') {
      // Bám sát Võ Lâm Minh Chủ
      const champMesh = this.championId ? this.fighters.get(this.championId) : null;
      if (champMesh) {
        const targetPos = champMesh.position.clone().add(new THREE.Vector3(0, 4, 10));
        this.camera.position.lerp(targetPos, dt * 2.5);
        this.camera.lookAt(champMesh.position.x, champMesh.position.y + 2, champMesh.position.z);
      } else {
        this.camera.position.set(0, 18, 30);
        this.camera.lookAt(0, 3, 0);
      }
    } else if (mode === 'topdown') {
      // Góc nhìn từ trên cao bao quát
      this.camera.position.lerp(new THREE.Vector3(0, 38, 12), dt * 3);
      this.camera.lookAt(0, 2, 0);
    } else if (mode === 'action') {
      // Tự động zoom theo 2 đấu thủ đang đánh nhau
      let activePos = new THREE.Vector3(0, 2.5, 0);
      const list = Array.from(this.fighters.values());
      if (list.length > 0) {
        activePos.copy(list[0].position);
      }
      const camTarget = activePos.clone().add(new THREE.Vector3(0, 6, 12));
      this.camera.position.lerp(camTarget, dt * 3);
      this.camera.lookAt(activePos.x, activePos.y + 2, activePos.z);
    }
  }

  // --------------------------------------------------------------------------
  // 8. RENDER LOOP
  // --------------------------------------------------------------------------
  animate() {
    requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    this.updateCamera(dt, time);
    this.updateEnvironmentParticles(dt);

    // Cập nhật hoạt họa nhân vật
    for (const fMesh of this.fighters.values()) {
      // Xoay nhẹ Rồng Vàng Minh Chủ
      if (fMesh.userData.miniDragon && fMesh.userData.miniDragon.visible) {
        fMesh.userData.miniDragon.rotation.y += dt * 3;
      }

      // Thở nhẹ / Đung đưa y phục
      if (fMesh.userData.bodyMesh) {
        fMesh.userData.bodyMesh.scale.y = 1 + Math.sin(time * 3 + fMesh.position.x) * 0.03;
      }

      // Xử lý action time
      if (fMesh.userData.actionTime > 0) {
        fMesh.userData.actionTime -= dt;
        if (fMesh.userData.state === 'attack' && fMesh.userData.rightArm) {
          fMesh.userData.rightArm.rotation.x = Math.sin(time * 25) * 1.2;
        }
      } else {
        fMesh.userData.state = 'idle';
        if (fMesh.userData.rightArm) fMesh.userData.rightArm.rotation.x = 0;
      }
    }

    // Cập nhật VFX
    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const v = this.vfxList[i];
      v.life -= dt;
      v.update(dt, v);
      if (v.life <= 0) {
        this.scene.remove(v.mesh);
        if (v.mesh.geometry) v.mesh.geometry.dispose();
        if (v.mesh.material) v.mesh.material.dispose();
        this.vfxList.splice(i, 1);
      }
    }

    // Cập nhật Floating Damage Numbers
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.update(dt, ft);
      if (ft.life <= 0) {
        this.scene.remove(ft.sprite);
        if (ft.sprite.material.map) ft.sprite.material.map.dispose();
        if (ft.sprite.material) ft.sprite.material.dispose();
        this.floatingTexts.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    if (!this.container) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // Tiện ích lấy màu và tên môn phái
  getSectColor(sect) {
    const map = {
      thieulam: '#f59e0b',
      vodang: '#06b6d4',
      caibang: '#10b981',
      ngami: '#ec4899',
      minhgiao: '#ef4444',
      duongmon: '#8b5cf6'
    };
    return map[sect] || '#f59e0b';
  }

  getSectName(sect) {
    const map = {
      thieulam: 'Thiếu Lâm',
      vodang: 'Võ Đang',
      caibang: 'Cái Bang',
      ngami: 'Nga Mi',
      minhgiao: 'Minh Giáo',
      duongmon: 'Đường Môn'
    };
    return map[sect] || 'Giang Hồ';
  }
}

window.Wuxia3DEngine = Wuxia3DEngine;
export { Wuxia3DEngine };
