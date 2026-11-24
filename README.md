# ♟️ Kỳ Đài Cờ Tướng TikTok Live (Gift-Gated Interactive Xiangqi Stream)

Hệ thống phát trực tiếp **Cờ Tướng tương tác với người xem TikTok Live** chuẩn khung dọc **9:16 (`1080×1920`)** dành cho **OBS Studio / TikTok Live Studio**, chạy siêu nhẹ trên **Bun.js**, tích hợp **AI Đại Kiện Tướng Cờ Tướng** và **Bình Luận Viên AI tiếng Việt ZeroTTS**.

## 🎁 Cơ Chế Độc Quyền: Chỉ Người Tặng Quà Mới Được Đi Nước Tiếp Theo

1. **Khóa Quyền Đi Cờ Theo Quà Tặng (Strict Gift-Gated Move Queue)**:
   - Khi đến lượt Phe Người Xem, **chỉ kỳ thủ đã tặng quà TikTok** (đạt mức xu tối thiểu cấu hình, mặc định `1🪙`) và đang giữ **Lượt Cầm Quân (Active Turn)** mới được quyền bình luận nước đi.
   - Mọi bình luận tọa độ từ người xem chưa tặng quà sẽ tự động bị chặn kèm thông báo nhắc tặng quà ngay trên màn hình Live.
2. **Hàng Đợi Ưu Tiên VIP Theo Giá Trị Quà (VIP Priority Queue)**:
   - **Quà 1–4 xu** (`Hoa hồng`, `TikTok`, `GG`, `Đỉnh`, `Yêu bạn`, `Hiểu ý`): `+1 Lượt Đi`.
   - **Quà 5–29 xu** (`Bắn tim 5🪙`, `Chú heo may mắn 10🪙`): `+1 Lượt VIP Ưu Tiên` (nhảy lên trước vé 1 xu, cộng thêm `+5s`, mở khóa lệnh `gợi ý`).
   - **Quà 30–99 xu** (`Bánh Donut 30🪙`): `+2 Lượt Siêu VIP` (`+10s`, tự động hiện **TOP 3 mũi tên gợi ý AI** trên bàn cờ).
   - **Quà ≥ 100 xu** (`Tay cầm chơi game 100🪙`): `+3 Lượt Đại Tướng VIP #1` (`+15s`, ưu tiên cao nhất, tự hiện gợi ý AI, mở khóa lệnh `đi lại` / `undo`, banner vinh danh Kim Long).
   - **Bảo Toàn Vé Qua Ván Mới**: Nếu ván cờ kết thúc chiếu bí khi vẫn còn người chờ trong hàng đợi, toàn bộ vé đã tặng quà được giữ nguyên sang ván tiếp theo.
3. **Không Bao Giờ Treo Livestream**:
   - Người giữ lượt có đồng hồ đếm ngược (mặc định `30s`, tùy chỉnh trong Admin/Dock).
   - Có thể gõ `auto` / `ai` / `máy đi` để AI đi hộ ngay; khi hết giờ, hệ thống mặc định cho **AI Kỳ Sư đi hộ nước mạnh nhất dưới tên kỳ thủ** (hoặc chuyển sang người kế tiếp tùy cài đặt).

## 🧭 Hỗ Trợ Song Song 2 Cách Bình Luận Nước Đi

Bàn cờ hiển thị rõ **tọa độ lưới 4 cạnh (`A–I`, `0–9`)** và **số lộ truyền thống (`1–9`)**:
- **Tọa độ ô lưới (Dễ nhất cho mọi người xem)**: `H2 E2`, `h2e2`, `h2-e2`, `b2 -> e2`, `e3 e4`.
- **Ký hiệu Cờ Tướng chuẩn Việt Nam**: `P2-5`, `Pháo 2 bình 5`, `M2.3`, `Mã 2 tấn 3`, `B7+1`, `Tốt 7 tấn 1`, `X1+1`, `P5/1`, `Xt.1`.
- **Lệnh nhanh**: `auto` (AI đi hộ), `gợi ý` / `hint` (VIP ≥ 5🪙), `đi lại` / `undo` (Đại Tướng ≥ 100🪙).

## ⚔️ Luật Cờ Tướng Chuẩn 100% & AI Đại Kiện Tướng

- **Luật đầy đủ (`lib/xiangqi-core.cjs`)**: Cản chân Mã, Cản mắt Tượng, Tượng không qua sông, Pháo ăn qua đúng 1 ngòi, Tốt qua sông đi ngang, **Lộ Mặt Tướng (Flying General)**, Chiếu tướng, **Chiếu bí & Khốn bí (hết nước đi = thua)**, Hòa cờ 60 nước không ăn quân / lặp thế 3 lần / không đủ quân.
- **AI Engine (`lib/xiangqi-ai.cjs`)**: Sách khai cuộc kinh điển (Pháo Đầu, Bình Phong Mã, Thuận Pháo, Phi Tượng, Tiên Nhân Chỉ Lộ), Iterative Deepening Alpha-Beta + Quiescence Search (MVV-LVA) + Zobrist Transposition Table + Killer/History Heuristic + 4 cấp độ (`Nghiệp Dư`, `Kỳ Thủ CLB`, `Kiện Tướng`, `Đại Kiện Tướng`) + Thanh đánh giá thế trận trực tiếp (Eval Bar).
- **2 Chế Độ Thi Đấu Linh Hoạt**:
  - `Host / AI vs Người Xem` (mặc định: Host bật AI tự đánh hoặc tự bấm quân cờ đánh tay trực tiếp trên màn hình).
  - `Người Xem Đỏ vs Người Xem Đen`.

## 🚀 Chạy Nhanh

```bash
bun install
bun start
```

- **Màn hình Live 9:16 + Bảng điều khiển Host**: `http://localhost:3000`
- **OBS Browser Source sạch 9:16 (`1080×1920`)**: `http://localhost:3000/?obs=1`
- **Trang Quản trị Admin**: `http://localhost:3000/admin`
- **Chạy kiểm thử tự động**: `bun test`
