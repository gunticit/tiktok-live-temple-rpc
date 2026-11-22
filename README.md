# HOA SƠN LUẬN KIẾM 3D — ĐẠI HỘI VÕ LÂM MINH CHỦ (TIKTOK LIVE RPC)

Trò chơi chiến đấu kiếm hiệp 3D tương tác thời gian thực dành cho **TikTok Live** & **OBS Studio** (chuẩn khung hình 9:16 dọc và 16:9 ngang), xây dựng trên nền tảng **Node.js / Bun.js + Express + Three.js 3D Engine + WebSocket JSON-RPC 2.0**.

---

## 🌟 TÍNH NĂNG NỔI BẬT

### 1. 6 Đại Môn Phái & Binh Khí Tương Xứng
Người xem livestream tham gia thi đấu và gia nhập một trong 6 môn phái kinh điển với vũ khí 3D đặc trưng:
- **Thiếu Lâm Tự**: Binh khí **Hàng Ma Côn / Thiền Trượng** (Vàng Kim `#f59e0b`) • Đại tuyệt kỹ: *Như Lai Thần Chưởng, Kim Cang Bất Hoại Thể*.
- **Võ Đang Phái**: Binh khí **Thái Cực Kiếm** (Xanh Lam `#06b6d4`) • Đại tuyệt kỹ: *Thái Cực Kiếm Trận, Thuần Dương Vô Cực*.
- **Cái Bang**: Binh khí **Đả Cẩu Bổng** (Xanh Ngọc Lục Bảo `#10b981`) • Đại tuyệt kỹ: *Giáng Long Thập Bát Chưởng, Đả Cẩu Bổng Pháp*.
- **Nga Mi Phái**: Binh khí **Ỷ Thiên Kiếm / Song Kiếm** (Hồng Phấn `#ec4899`) • Đại tuyệt kỹ: *Ỷ Thiên Trảm Nguyệt, Cửu Âm Thần Trảo*.
- **Minh Giáo (Ma Giáo)**: Binh khí **Huyết Long Đao / Thánh Hỏa Lệnh** (Đỏ Rực Lửa `#ef4444`) • Đại tuyệt kỹ: *Càn Khôn Đại Na Di, Thánh Hỏa Liệt Diễm*.
- **Đường Môn**: Binh khí **Ám Khí / Phi Tiêu** (Tím Dạ Quang `#8b5cf6`) • Đại tuyệt kỹ: *Bão Vũ Lê Hoa Châm, Mạn Thiên Hoa Vũ*.

---

### 2. Cách Người Xem Tham Gia Qua TikTok Live Chat
Người xem tương tác trực tiếp bằng cách gõ bình luận vào livestream:
- **Gõ `"chiến"` hoặc `"pk"`**: Tự động bước lên lôi đài với môn phái ngẫu nhiên (hệ thống tự cân bằng môn phái ít người).
- **Gõ tên binh khí**:
  - `"kiếm"` ➔ Gia nhập Võ Đang (hoặc Nga Mi) với Thái Cực Kiếm.
  - `"đao"` ➔ Gia nhập Minh Giáo với Huyết Long Đao.
  - `"côn"` hoặc `"trượng"` ➔ Gia nhập Thiếu Lâm với Hàng Ma Côn.
  - `"bổng"` hoặc `"đả cẩu"` ➔ Gia nhập Cái Bang với Đả Cẩu Bổng.
  - `"ám khí"` hoặc `"tiêu"` ➔ Gia nhập Đường Môn với Ám Khí Phi Tiêu.
- **Gõ tên môn phái**: `"thiếu lâm"`, `"võ đang"`, `"cái bang"`, `"nga mi"`, `"minh giáo"`, `"đường môn"`.
- **Lệnh chiến đấu khi đã ở trên lôi đài**:
  - Gõ `"đánh"`, `"chém"`, `"chưởng"`, `"tấn công"`, `"bạo kích"` ➔ Kích hoạt đòn đánh liên hoàn, lướt tới đối thủ và bạo kích!
  - Gõ `"hồi máu"`, `"né"`, `"hộ thể"` ➔ Vận khí điều tức hồi phục sinh lực và khiên bảo hộ.
- **Thả tim (Like livestream)**: Buff Nội Lực và Khí Công cho đấu sĩ cùng môn phái.
- **Tặng quà (Gift livestream)**: Triệu hồi Thần Binh Tối Thượng & kích hoạt Đại Tuyệt Kỹ Trấn Phái quét sạch đối thủ trên lôi đài.

---

### 3. Tranh Đoạt Ngôi Vị "VÕ LÂM MINH CHỦ"
- Đấu sĩ trụ vững trên lôi đài, có số lần hạ gục (Kills) và điểm chiến tích cao nhất sẽ đăng quang **VÕ LÂM MINH CHỦ**.
- Trên lôi đài 3D, Minh Chủ sẽ được:
  - Đội **Vương Miện Hoàng Kim** trên đầu.
  - **Rồng Vàng 3D** lượn vòng quanh thân thể.
  - Hào quang Chân Khí hoàng kim chói lọi.
  - Thẻ tên vàng kim trên đỉnh Bảng Phong Thần Võ Lâm.
  - Phát thanh viên TTS xướng danh ca ngợi thiên hạ quy tâm!

---

### 4. Hệ Thống Đồ Họa 3D Tùy Chỉnh (3D Settings)
Trong menu Cài Đặt (icon ⚙️ trên màn hình chính và trong trang `/admin`), có thể tùy chỉnh:
- **Preset Đồ Họa**:
  - ⚡ **Tiết kiệm (Low)**: Tắt đổ bóng, 30 FPS, tối ưu tuyệt đối cho máy stream yếu.
  - 🌟 **Tiêu chuẩn (Medium)**: Đổ bóng cơ bản, hiệu năng cân bằng 60 FPS.
  - 💎 **Tuyệt Đẹp (Ultra 3D)**: Đổ bóng mềm Soft Shadows, Full FPS, Anti-aliasing.
- **Góc Nhìn Camera 3D**:
  - 🎥 **Cinematic**: Camera lướt vòng quanh lôi đài kịch tính.
  - 🎥 **Action**: Tự động zoom theo cặp đấu thủ đang giao tranh khốc liệt nhất.
  - 🎥 **Minh Chủ**: Khóa camera theo sát Đương Kim Võ Lâm Minh Chủ.
  - 🎥 **Top-Down**: Góc nhìn từ trên cao bao quát toàn bộ trận hỗn chiến.
  - 🎥 **Orbit (Tự do)**: Dùng chuột kéo xoay 360 độ và phóng to thu nhỏ tự do.
- **Hiệu Ứng Thời Tiết Môi Trường**:
  - 🌸 Cánh hoa đào rơi (Hoa Sơn Phấn Đào).
  - ❄️ Bão tuyết sơn đỉnh (Hoa Sơn Tuyết Cảnh).
  - 🔥 Hỏa diễm tro tàn (Quang Minh Đỉnh Hỏa).
  - 🌫️ Sương mù mây ngàn huyền bí.
- **Toggles Chi Tiết**:
  - Đổ bóng thời gian thực (Real-time Shadows).
  - Hào quang Chân Khí (Ki Aura).
  - Vệt chém Đao Quang Kiếm Ảnh (Slash Trails).
  - Số sát thương 3D nảy (Floating Damage Numbers).
- **Tỉ lệ khung hình**:
  - 📱 **Dọc 9:16** (1080x1920 cho TikTok Live / OBS Browser Source).
  - 🖥️ **Ngang 16:9** (Màn hình rộng / Toàn màn hình).

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY

```bash
# Cài đặt thư viện (nếu chưa có)
bun install
# hoặc: npm install

# Khởi chạy server
bun run server.js
# hoặc: node server.js
```

Sau khi khởi chạy:
- 📺 **Màn hình Lôi Đài 3D (dùng add vào OBS)**: `http://localhost:3000`
- 🎛️ **Bảng Điều Khiển Admin & TikTok**: `http://localhost:3000/admin`
- 🔌 **JSON-RPC 2.0 Endpoint**: `http://localhost:3000/rpc` & `ws://localhost:3000/ws`
