# Báo Cáo Thay Đổi (Changelog & Migration Summary)

Tài liệu này ghi nhận toàn bộ quá trình chuyển đổi và nâng cấp dự án từ **Chùa Linh Ứng Online (2.5D TikTok Live Temple RPC)** thành **VÕ ĐÀI 3D — Đi Tìm Võ Lâm Minh Chủ (3D Martial Arts Arena Livestream Game)** chuẩn bố cục dọc **9:16** (TikTok / Douyin Live & OBS Studio).

---

## 1. Tổng Quan Kiến Trúc Trước & Sau Chuyển Đổi

| Hạng mục | Phiên bản cũ (Temple RPC) | Phiên bản mới (VÕ ĐÀI 3D — Võ Lâm Minh Chủ) |
| --- | --- | --- |
| **Chủ đề & Gameplay** | Nghi thức Chùa Online (thắp hương, gõ mõ, thỉnh chuông, xin xăm, bảng công đức) | Game chiến đấu kiếm hiệp **3D thời gian thực** theo 7 môn phái/binh khí tranh ngôi **Võ Lâm Minh Chủ** |
| **Đồ họa & Engine** | Ảnh tĩnh 2D + Canvas 2.5D (`particles.js`) + sprite nhân vật quỳ bái | **Three.js 3D Engine (`wuxia3d.js`)** dựng Võ Đài hoàng hôn 3D, đồ hình Bát Quái đỏ-vàng, cột trụ đền cổ, đài lửa bập bùng, khán giả 3D cổ vũ, nhân vật có khớp cử động |
| **Chu kỳ trận đấu** | Tương tác rời rạc từng sự kiện | **3 pha tự động 10Hz**: `Ghi danh` (xếp vòng tròn chọn binh khí) ➔ `Đang giao đấu` (AI + Chat + Quà thực chiến 2:30) ➔ `Vinh danh Võ Lâm Minh Chủ` (+1 👑 Bảng Vàng) |
| **Tương tác Chat TikTok** | `xin xăm`, `thắp hương`, `gõ mõ`, `thỉnh chuông` | `chiến`, `đánh`, `join`, chọn 7 binh khí (`kiếm`, `thương`, `đao`, `côn`, `cung`, `tiêu`, `quyền`), tên môn phái, lệnh `chạy` (né đòn), `hồi máu`, bong bóng thoại 3D |
| **Hệ thống Quà tặng (Gift)** | Hoa sen, ngũ quả, đèn lưu ly, kim long | **7 Kỹ Năng Chiến Đấu Trực Tiếp**: 🌹 Vào đấu/+20 máu, 🫰 Hồi máu, 🎁 Kim Chung Tráo, 👻 Hồi sinh, 🍩 Cuồng nộ, 💎 Khổng lồ (1.65x), 🕶️ Thần Võ (AoE) + 🎂 Bánh sinh nhật CTA |
| **Mục tiêu Thả Tim (Like)** | Gõ mõ tích công đức | Thanh tiến độ **Ma Đấu (`Ma Đấu: còn X tim`)** — đủ tim triệu hồi Boss 3D **Ma Đấu Tôn Giả** vào tâm Bát Quái (+3 hạ gục cho người kết liễu) |
| **Bố cục UI/UX 9:16** | Khung 1080×1920 tĩnh | Chuẩn **Livestream Mobile 9:16**: Top Live Header & Event Badges (`LIVE FEST 26`), Ornate `VÕ ĐÀI` Status Board, 2 Side Panels động (`TOP HẠ GỤC`/`TRẬN VỪA RỒI` & `TẶNG QUÀ`/`BẢNG VÀNG`), Achievement Flame Card, Lower 30% Translucent Chat Feed + Celebratory CTA + Footer Input |
| **Cài đặt 3D (Settings)** | Chỉ có mật độ khói & âm lượng | Modal `<dialog>` tùy chỉnh toàn diện **Chất lượng 3D**, **6 Góc Camera**, **Thời tiết Võ Đài**, **Tỉ lệ 9:16 / 16:9**, **Chế độ OBS sạch**, Đổ bóng, Khán giả 3D, Đài lửa, Ki Aura, Vệt kiếm, Số sát thương Comic |

---

## 2. Chi Tiết Thay Đổi Theo Từng Tệp Tin

### 2.1. Backend & Engine Chiến Đấu — [`server.js`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/server.js)
- **Hệ thống 7 Môn Phái & 7 Binh Khí** (hỗ trợ cận chiến & tầm xa):
  1. **Võ Đang** — *Thái Cực Kiếm* (`kiếm`)
  2. **Dương Gia / Thiên Vương** — *Phá Quân Thương* (`thương`)
  3. **Minh Giáo** — *Đồ Long Đao* (`đao`)
  4. **Thiếu Lâm** — *Hàng Ma Côn* (`côn`)
  5. **Tiêu Dao** — *Lạc Nhật Cung* (`cung` — bắn tên tầm xa + giữ khoảng cách)
  6. **Đường Môn** — *Bão Vũ Phi Tiêu* (`tiêu` — phóng phi tiêu tầm xa tốc độ cao)
  7. **Cái Bang** — *Giáng Long Quyền* (`quyền` — cận chiến tốc độ cao)
- **Vòng lặp chiến đấu Authoritative 10Hz (`WuxiaArena.tick`)**:
  - Tự động điều phối 3 pha: `registration` (`Ghi danh`) ➔ `fighting` (`Đang giao đấu`) ➔ `coronation` (`Vinh danh`).
  - Xử lý AI di chuyển, né chồng lấn, tấn công theo tầm vũ khí, đẩy lùi (knockback), hấp thụ giáp `Kim Chung Tráo`, hàng chờ trận sau (`waitingQueue`), Boss `Ma Đấu Tôn Giả`, lưu bảng vàng `hallOfFame` & `lastRoundTopKills` vào `data/wuxia-arena-state.json`.
- **Phục vụ Three.js nội bộ**: Mount `/vendor/three` và `/vendor/three/examples/jsm` trực tiếp từ `node_modules/three` không phụ thuộc CDN ngoài.
- **Mở rộng JSON-RPC 2.0 & WebSocket**:
  - RPC Methods mới: `wuxia.getState`, `wuxia.comment`, `wuxia.join`, `wuxia.giftSkill`, `wuxia.buffLike`, `wuxia.spawnBoss`, `wuxia.startMatchNow`, `wuxia.resetRound`, `wuxia.updateSettings`, `live.connect`, `live.disconnect`, `live.setAutoSim`.
  - Push notifications: `wuxia.state`, `wuxia.tick` (10Hz), `wuxia.event`, `wuxia.chat`, `tiktok.status`, `tts.play`.

### 2.2. Engine Đồ Họa 3D — [`public/js/wuxia3d.js`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/public/js/wuxia3d.js) *(Tệp mới)*
- **Bối cảnh Võ Đài Hoàng Hôn 3D**:
  - Bầu trời hoàng hôn chuyển sắc cam-đỏ-tím sẫm (`SkyDome`) kèm ánh sáng `HemisphereLight`, `DirectionalLight` đổ bóng mềm `PCFSoftShadowMap` và ánh sáng viền cam.
  - Sân tròn đá sa thạch tích hợp texture 2048×2048 **Đồ hình Bát Quái Đỏ - Vàng Kim & Thái Cực Âm Dương** sắc nét, viền phát quang cam-đỏ, hàng rào gỗ đỏ, 6 cột trụ đền cổ lớn, 4 đài lửa bập bùng lập lòe (`PointLight` động), khán đài 3 bậc cùng **27 khán giả 3D** biết reo hò khi có hạ gục/tuyệt kỹ.
- **Nhân vật 3D Cel-Shaded viền mực & 7 Môn Phái ([`public/js/wuxia_characters.js`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/public/js/wuxia_characters.js))**:
  - Đổ bóng hoạt họa 4 tầng (`MeshToonMaterial`) + nét viền mực đen bao quanh hình khối (tự ẩn ở chế độ Low để tối ưu FPS).
  - Tạo hình chuẩn khung xương võ hiệp (quần phồng, **xà cạp quấn bắp chân**, giày vải đế trắng, áo vạt chéo cổ áo vẽ chi tiết, đai lưng vải 3 tầng có nút thắt, tà áo xẻ trước/sau bay phấp phới, tay áo phồng + **băng quấn cổ tay**, khuôn mặt vẽ biểu cảm).
  - Thiết kế riêng cho **Thiếu Lâm** (đầu trọc 6 chấm giới điệp, tăng y vàng-cam vạt chéo, **tràng hạt gỗ 16 hạt 3D**, tư thế dựng đơn chưởng tay trái, **Hàng Ma Côn gỗ mun 2 đầu bịt thép đinh tán**, hiệu ứng bộc phát chân khí tia vàng nhọn) và đồng bộ cùng phong cách cho 6 môn phái còn lại: **Võ Đang** (Đạo quan, áo trắng-lam Thái Cực, Thái Cực Kiếm), **Dương Gia** (giáp vai đồng, áo choàng đỏ, Trường Thương tua đỏ), **Minh Giáo** (khăn lửa, tóc dựng, Đồ Long Đao), **Tiêu Dao** (ống tên sau lưng, Lạc Nhật Cung), **Đường Môn** (khăn bịt mặt, khăn tím, Phi Tiêu 4 cánh), **Cái Bang** (hồ lô rượu đeo hông, Giáng Long Quyền).
- **Combat VFX & UI trong không gian 3D**:
  - Vệt kiếm quang định hướng (`Slash Arc`), mũi tên & phi tiêu bay vật lý theo đường vòng cung, tia lửa va chạm, sóng chấn động mặt đất, cột sáng hồi máu/hồi sinh.
  - Bảng tên 3D sắc nét kèm danh hiệu (`Vô Danh Tiểu Tốt`, `Thiếu Hiệp`, `Đại Hiệp`, `Võ Lâm Minh Chủ`), thanh HP & khiên, bong bóng thoại 3D khi chat, và số sát thương phong cách Comic viền đen nổi bật (`-12`, `-15`, `-27`, `-39`).
- **Hệ thống 6 Góc nhìn Camera & Cấu hình 3D**:
  - `broadcast` (góc Võ Đài 9:16 chuẩn livestream), `cinematic`, `action`, `champion`, `topdown`, `orbit` (OrbitControls xoay 360°), kèm rung màn hình nhẹ khi bạo kích.

### 2.3. Giao Diện Live 9:16 Sạch & Cân Đối — [`public/index.html`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/public/index.html) & [`public/css/live.css`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/public/css/live.css)
- **Tối ưu cho phát trực tiếp TikTok Live / OBS (loại bỏ toàn bộ khung giả lập TikTok)**: Không hiển thị các thành phần trùng lặp với app TikTok gốc (header Host/+Follow/Viewers, badge sự kiện top, khung chat giả lập, thẻ CTA bánh sinh nhật, thanh nhập chat dưới đáy), giúp sân Võ Đài 3D thoáng rộng toàn khung **9:16**.
- **Central Game Status Board (`VÕ ĐÀI`)**: Đặt cân đối phía trên trung tâm (`top: 22px`) với viền vát cạnh vàng kim & đỏ thẫm: `TRẬN X • Đang giao đấu / Ghi danh • Đồng hồ`, `Còn X / Y anh hùng`, thanh tiến độ `Ma Đấu: còn X tim`, thẻ đương kim Minh Chủ `👑` và thanh hướng dẫn `Gõ đánh để lên võ đài trận sau • Đang chờ X`.
- **Symmetrical Side Panels (`width: 154px` đều 2 bên)**:
  - Trái: `TOP HẠ GỤC` (khi giao đấu) ⇄ `TRẬN VỪA RỒI` (khi ghi danh).
  - Phải: `TẶNG QUÀ` tinh gọn còn **4 quà TikTok chuẩn** với icon tách nền sắc nét (`🌹 Hoa hồng` giữ nguyên → `Vào đấu / +20 máu`, `GG` → `Hồi máu`, `Hộp quà bóng bay` → `Khổng lồ`, `Thả tim` → `Hồi sinh / Thần Võ`) ⇄ `BẢNG VÀNG` (khi ghi danh).
- **Arena Alerts không che tâm Bát Quái**: Thẻ thành tích rực lửa (`x4 CHIẾN TÍCH VÕ ĐÀI`) căn thẳng gọn ngay dưới panel trái; thẻ Gift Combo gọn ở góc dưới trái; banner trung tâm `Gõ đánh để lên võ đài` chỉ xuất hiện khi `Ghi danh`.
- **Nút Cài Đặt ⚙️ & Modal Native `<dialog>`**: Nút ⚙️ tinh gọn góc trên phải (tự ẩn trong `/?obs=1`), mở modal 2 cột tùy chỉnh chất lượng 3D, 6 góc camera, thời tiết, tỉ lệ `9:16` / `16:9` tức thì.

### 2.4. Bộ Điều Khiển Client, Âm Thanh & Trang Quản Trị
- [`public/js/live.js`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/public/js/live.js): Đồng bộ WebSocket 10Hz, xử lý toàn bộ tương tác chat/quà trực tiếp, xây dựng DOM an toàn bằng `textContent` (chống XSS từ tên/bình luận người xem), điều khiển modal thiết lập 3D.
- [`public/js/audio.js`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/public/js/audio.js): Chuyển từ pháp khí chùa sang bộ âm thanh Web Audio kiếm hiệp (kiếm chạm, chém gió, côn gõ, dây cung bắn tên, bạo kích, chuông Kim Chung Tráo, hồi máu, rồng gầm tuyệt kỹ, nhạc đăng quang Minh Chủ + TTS bình luận viên).
- [`public/admin.html`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/public/admin.html): Làm mới bảng quản trị RPC với đầy đủ nút test 7 binh khí, 7 kỹ năng quà tặng, triệu hồi Ma Đấu Boss, chuyển pha trận đấu, kết nối TikTok Live và đồng bộ cài đặt 3D từ xa.
- [`README.md`](file:///Users/hwg/Desktop/tiktok-live-temple-rpc/README.md): Cập nhật tài liệu hướng dẫn cài đặt, lệnh chat, kỹ năng quà tặng và thiết lập 3D.
