# VÕ ĐÀI 3D — ĐI TÌM VÕ LÂM MINH CHỦ (TIKTOK LIVE 9:16 RPC)

Game chiến đấu kiếm hiệp **3D thời gian thực** chuẩn bố cục dọc **9:16** (TikTok / Douyin Live & OBS Studio), kết hợp Three.js 3D Arena + Express + WebSocket JSON-RPC 2.0 + âm thanh kiếm hiệp Web Audio & bình luận viên TTS.

---

## 🌟 TÍNH NĂNG NỔI BẬT

### 1. 7 Môn Phái & 7 Binh Khí Kiếm Hiệp
Người xem gõ lệnh chat để gia nhập võ đài và chọn binh khí tương xứng:
- **Võ Đang** — `kiếm` (**Thái Cực Kiếm**) • Cận chiến linh hoạt, kiếm quang sắc bén.
- **Dương Gia / Thiên Vương** — `thương` (**Phá Quân Thương**) • Tầm đánh dài, thương pháp đẩy lùi.
- **Minh Giáo** — `đao` (**Đồ Long Đao**) • Sát thương bạo kích cực mạnh.
- **Thiếu Lâm** — `côn` (**Hàng Ma Côn**) • Sinh lực cao, côn pháp quét ngang uy lực.
- **Tiêu Dao** — `cung` (**Lạc Nhật Cung**) • Xạ thủ tầm xa bắn tên vòng cung có vệt sáng.
- **Đường Môn** — `tiêu` (**Bão Vũ Phi Tiêu**) • Phóng phi tiêu tầm xa tốc độ cao.
- **Cái Bang** — `quyền` (**Giáng Long Quyền**) • Tốc độ ra đòn nhanh, chưởng pháp cận chiến.

---

### 2. Chu Kỳ Trận Đấu & Tương Tác Trực Tiếp
- **Pha 1 — Ghi Danh (`Ghi danh`)**: Các anh hùng xếp vòng tròn quanh đồ hình Bát Quái đỏ-vàng, hiển thị `TRẬN VỪA RỒI` & `BẢNG VÀNG`. Người xem gõ `"chiến"`, `"đánh"`, `"join"` hoặc tên binh khí (`kiếm · thương · đao · côn · cung · tiêu · quyền`) để lên võ đài.
- **Pha 2 — Đang Giao Đấu (`Đang giao đấu`)**: Các đấu sĩ tự động di chuyển, áp sát, né đòn, bắn tên/phi tiêu và tung chiêu trong 2:30.
  - Người xem mới gõ `"chiến"` / `"đánh"` sẽ vào hàng chờ trận sau (`đang chờ X`) hoặc gửi **Hoa hồng 🌹** để nhảy thẳng vào trận!
  - Người đang đấu gõ `"chạy"` để tăng tốc né đòn, hoặc chat bất kỳ để hiển thị **bong bóng thoại 3D** trên đầu nhân vật.
  - **Mục tiêu Thả Tim (`Ma Đấu`)**: Lượt thích livestream giảm dần bộ đếm `Ma Đấu: còn X tim`. Về 0 sẽ triệu hồi **Ma Đấu Tôn Giả** khổng lồ vào giữa sân (+3 hạ gục cho người kết liễu).
- **Pha 3 — Vinh Danh (`Vinh danh Võ Lâm Minh Chủ`)**: Người trụ vững cuối cùng hoặc hạ gục nhiều nhất đoạt ngôi **Võ Lâm Minh Chủ**, nhận vương miện vàng 3D và +1 👑 trên **BẢNG VÀNG**.

---

### 3. 4 Kỹ Năng Tặng Quà (TẶNG QUÀ)
- 🌹 **Hoa hồng** (1 xu) ➔ **Vào đấu / +20 máu**: Nhảy thẳng lên võ đài giữa trận hoặc cộng +20 máu tối đa.
- **GG** (1 xu — `/assets/gifts/gg.png`) ➔ **Hồi máu**: Hồi +120 HP kèm cột sáng lục bảo & tăng tốc đánh ngắn.
- **Hộp quà bóng bay** (100 xu — `/assets/gifts/giftbox.png`) ➔ **Khổng lồ**: Hóa thân khổng lồ 1.65× + Kim Chung Tráo hộ thể + chấn địa AoE.
- **Thả tim** (100 xu — `/assets/gifts/heart_hands.png`) ➔ **Hồi sinh / Thần Võ**: Hồi sinh lập tức 100% HP + kích hoạt luân quang Thần Võ & tung Đại Tuyệt Kỹ môn phái diện rộng.

---

### 4. Thiết Lập Hình Ảnh 3D (Settings ⚙️)
Bấm icon **⚙️** trên màn hình Live hoặc chỉnh từ xa tại `/admin`:
- **Chất lượng đồ họa 3D**: `Tuyệt Đẹp (Ultra)` / `Tiêu Chuẩn (Medium)` / `Tiết Kiệm (Low)`.
- **6 Góc Camera 3D**: `Chuẩn Võ Đài Live (9:16)`, `Cinematic`, `Hành Động`, `Võ Lâm Minh Chủ`, `Top-Down`, `Tự Do Orbit 360°`.
- **Hiệu ứng không khí**: Tro tàn hoàng hôn, Hoa đào rơi, Tuyết sơn đỉnh, Sương mù, hoặc Tắt.
- **Tùy chỉnh chi tiết**: Đổ bóng thực, Khán giả 3D cổ vũ, Đài lửa động, Ki Aura, Vệt kiếm quang, Số sát thương Comic, Khung tỉ lệ `9:16` / `16:9` (dùng `/?obs=1` để ẩn cả nút ⚙️ khi phát OBS).

---

## 🚀 KHỞI CHẠY

```bash
bun run server.js
# hoặc
node server.js
```

- 📺 **Màn hình Võ Đài 3D (9:16 Live)**: `http://localhost:3000`
- 🎥 **Màn hình OBS Studio (ẩn nút ⚙️)**: `http://localhost:3000/?obs=1`
- 🎛️ **Bảng Điều Khiển Admin & Kết Nối TikTok**: `http://localhost:3000/admin`
- 📄 **Chi tiết các thay đổi**: Xem [CHANGES.md](./CHANGES.md)
