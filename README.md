# 🪩 Sàn Quẩy Vũ Trường — TikTok Live RPC (9:16 Game Đi Bar Tương Tác)

Hệ thống phát trực tiếp tương tác (**Interactive TikTok Live Stream & JSON-RPC 2.0**) chuẩn khung dọc **9:16 (`1080×1920`)** dành cho **OBS Studio / TikTok Live Studio**, chạy siêu nhẹ trên **Bun.js** và tích hợp giọng đọc AI tiếng Việt **ZeroTTS (`zeroweight-ai/ZeroTTS`)**.

Mỗi người xem trên TikTok Live là một **nhân vật mascot 3D** (Koala, Kangaroo, Gấu B-boy, Thỏ hồng, Hổ, Rùa, Bạch tuộc DJ...) cùng nhún nhảy trên sàn disco đa sắc:
- 🏃 **Lên Sàn Nhảy (Bình luận bất kỳ hoặc vào phòng)**: Tự động xếp chỗ trên sàn nhảy với bảng tên `Khách thứ X` hoặc tên TikTok của người xem.
- 💃 **Đổi Điệu Nhảy (Bình luận `nhảy`, `hiphop`, `xoay đầu`, `lộn`, `catwalk`, `robot`...)**: Nhân vật của người xem lập tức biểu diễn điệu nhảy tương ứng trên sàn!
- ❤️ **Tăng Nhiệt Sàn (Thả tim / Like)**: Thả tim tăng điểm thanh `⚡ Nhiệt sàn 0 / 200`. Khi đạt 200/200, kích hoạt chế độ **🔥 SÀN CHÁY RỒI! 🔥** với hiệu ứng laser, pháo sáng và giọng đọc thông báo bùng nổ!
- 🎁 **Hiệu Ứng Quà Tặng Đặc Biệt & Xướng Tên Đại Gia**:
  - 🌹 **CAMERA / ĐỔI NV / NHẢY SOLO (1–4 xu)**: Soi đèn sân khấu, nhảy solo nổi bật.
  - 🎆 **PHÁO HOA (10 xu)**: Bắn pháo hoa rực sáng cả vũ trường.
  - 🫧 **MƯA BONG BÓNG (20 xu)**: Mưa bong bóng bay lấp lánh khắp sàn nhảy.
  - 🦾 **KHỔNG LỒ (40 xu)**: Nhân vật hóa khổng lồ dẫm nát sàn nhảy.
  - 🎧 **LÊN DJ (50 xu)**: Bước lên bục DJ chỉ đạo âm thanh vũ trường.
  - 🚀 **TÊN LỬA / 🦆 VỊT VÀNG (100–150 xu)**: Phóng tên lửa hoặc vịt vàng khổng lồ qua sàn.
  - 🐉 **CƯỠI RỒNG KIM LONG (≥ 199 xu)**: **Rồng Vàng khổng lồ xuất hiện chở đại gia bay qua sàn quẩy**, bảng vương miện cánh vàng `👑 VUA - [Tên Đại Gia]`, `PERFECT x27` và giọng đọc AI ZeroTTS xướng tên chúc mừng hoành tráng!
- 💎 **Bảng TOP ĐẠI GIA (Hạng 1, 2, 3)**: Tự động vinh danh 3 đại gia có điểm cống hiến xu cao nhất ở góc trên màn hình.

---

## ⚡ Kiến Trúc & Tối Ưu Hóa Hiệu Suất

- **Runtime**: Chạy trực tiếp trên **Bun.js** (`~0.1% CPU` khi chờ).
- **Canvas FX Engine (`public/js/particles.js`)**:
  - Khóa tốc độ vẽ ở **30 FPS** ổn định, tự động tạm dừng khi ẩn tab (`document.hidden`).
  - Tia laser vũ trường đa sắc quét sàn, đốm sáng disco, pháo hoa và confetti.
- **Audio Engine (`public/js/audio.js`)**:
  - Nhạc nền EDM / Vinahouse 128 BPM tổng hợp bằng Web Audio API, tự động hạ nhỏ âm lượng (ducking) khi giọng đọc ZeroTTS xướng tên đại gia.
  - Hiệu ứng âm thanh: DJ Air Horn (pew-pew-pew), Bass drop, Laser zaps, Pháo hoa.
- **ZeroTTS Worker (`tts_worker.py`)**:
  - Tiến trình Python thường trú nạp sẵn model `zeroweight-ai/ZeroTTS` giọng Mai Chi hào sảng.
- **Bảo Vệ WebSocket**:
  - Bắt lỗi toàn cục `process.on('uncaughtException')` và bảo vệ WebSocket client không bị sập khi TikTok Live ngắt kết nối.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Nhanh

### 1. Cài đặt thư viện
```bash
bun install
```

### 2. Khởi chạy Server
```bash
bun start
# Hoặc chế độ dev:
bun run dev
```

Mặc định server chạy tại cổng `3000`:
- **Màn hình Live 9:16 + Điều khiển nhanh**: [http://localhost:3000](http://localhost:3000)
- **Màn hình OBS Browser Source (Sạch 9:16)**: [http://localhost:3000/?obs=1](http://localhost:3000/?obs=1) *(Kích thước OBS: `1080 × 1920`)*
- **Bảng điều khiển Admin & RPC**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🔌 Giao Thức JSON-RPC 2.0 (`POST /rpc` & `ws://localhost:3000/ws`)

### 1. Tặng quà Cưỡi Rồng
```bash
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "bar.gift",
    "params": {
      "user": "Đại Gia Khách 20",
      "giftName": "Cưỡi Rồng Kim Long",
      "coins": 199
    }
  }'
```

### 2. Thả tim tăng nhiệt sàn
```bash
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "bar.addHeat",
    "params": {
      "user": "Bé Thỏ Quẩy",
      "count": 25
    }
  }'
```
