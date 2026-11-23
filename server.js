const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

// Bắt lỗi toàn cục để tránh sập server khi WebSocket hoặc kết nối bên ngoài bị ngắt đột ngột
process.on('uncaughtException', (err) => {
  console.warn('[Process UncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Process UnhandledRejection]', reason?.message || reason);
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'fishing-state.json');
const LEGACY_STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. BÁCH KHOA CÁ & THỦY QUÁI (FISH CATALOG)
// ============================================================================
const FISH_CATALOG = [
  // Tier 1: Phổ Thông (Common - Tỉ lệ xuất hiện cao)
  {
    id: 'bong_cat',
    name: 'Cá Bống Cát',
    species: 'Glossogobius giuris',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 0.2,
    maxWeight: 0.6,
    points: 10,
    badgeColor: '#546e7a',
    gradient: 'linear-gradient(135deg, #78909c 0%, #455a64 100%)',
    quote: 'Bống bống bang bang, bé hạt tiêu nhưng thịt thơm ngọt lịm!',
    icon: '🐟',
    ttsSummary: 'Cá Bống Cát tươi rói! Bé hạt tiêu nhưng mở hàng siêu may mắn!'
  },
  {
    id: 'ro_dong',
    name: 'Cá Rô Đồng',
    species: 'Anabas testudineus',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 0.3,
    maxWeight: 0.9,
    points: 12,
    badgeColor: '#558b2f',
    gradient: 'linear-gradient(135deg, #7cb342 0%, #33691e 100%)',
    quote: 'Rô đồng béo múp, vây giương oai vệ, đặc sản đồng quê!',
    icon: '🐟',
    ttsSummary: 'Cá Rô Đồng béo mầm, vây giương oai vệ đặc sản đồng quê!'
  },
  {
    id: 'me_hoa',
    name: 'Cá Mè Hoa',
    species: 'Hypophthalmichthys nobilis',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.2,
    maxWeight: 2.8,
    points: 15,
    badgeColor: '#00838f',
    gradient: 'linear-gradient(135deg, #00acc1 0%, #006064 100%)',
    quote: 'Mè hoa lượn sóng đầm lầy, đầu to béo ngậy!',
    icon: '🐟',
    ttsSummary: 'Cá Mè Hoa lượn sóng đầm lầy, kéo máy câu ríu rít!'
  },
  {
    id: 'troi_den',
    name: 'Cá Trôi Đen',
    species: 'Cirrhinus microlepis',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.5,
    maxWeight: 3.5,
    points: 18,
    badgeColor: '#37474f',
    gradient: 'linear-gradient(135deg, #607d8b 0%, #263238 100%)',
    quote: 'Trôi cắn câu phóng như tàu lượn, ghì máy câu kêu ràn rạt!',
    icon: '🐟',
    ttsSummary: 'Cá Trôi Đen lực lưỡng phóng như tàu lượn xé toạc mặt nước!'
  },
  {
    id: 'tai_tuong',
    name: 'Cá Tai Tượng',
    species: 'Osphronemus goramy',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.0,
    maxWeight: 2.6,
    points: 16,
    badgeColor: '#6d4c41',
    gradient: 'linear-gradient(135deg, #8d6e63 0%, #4e342e 100%)',
    quote: 'Tai tượng vảy xòe như quạt ba tiêu, giật cực đã tay!',
    icon: '🐟',
    ttsSummary: 'Cá Tai Tượng vảy xòe như cánh quạt, giật cực đã tay!'
  },

  // Tier 2: Quý Hiếm (Rare)
  {
    id: 'chep_vang',
    name: 'Cá Chép Vàng Cát Tường',
    species: 'Cyprinus carpio aureate',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 2.5,
    maxWeight: 5.8,
    points: 35,
    badgeColor: '#f9a825',
    gradient: 'linear-gradient(135deg, #ffd54f 0%, #f57f17 100%)',
    quote: 'Chép vàng vượt vũ môn hóa rồng, rước đại cát đại lợi về nhà!',
    icon: '🐠',
    ttsSummary: 'Cá Chép Vàng Cát Tường! Vượt vũ môn hóa rồng mang đại cát đại lợi!'
  },
  {
    id: 'tra_khung',
    name: 'Cá Tra Khủng',
    species: 'Pangasius hypophthalmus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 4.0,
    maxWeight: 9.8,
    points: 42,
    badgeColor: '#0277bd',
    gradient: 'linear-gradient(135deg, #29b6f6 0%, #01579b 100%)',
    quote: 'Cá tra béo tròn lủn cũn, quẫy đuôi làm sóng dạt đôi bờ!',
    icon: '🐟',
    ttsSummary: 'Cá Tra Khủng béo tròn, quẫy đuôi làm sóng dạt đôi bờ hồ câu!'
  },
  {
    id: 'lang_hoa',
    name: 'Cá Lăng Đốm Hoa',
    species: 'Hemibagrus guttatus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 3.2,
    maxWeight: 7.5,
    points: 48,
    badgeColor: '#6a1b9a',
    gradient: 'linear-gradient(135deg, #ab47bc 0%, #4a148c 100%)',
    quote: 'Đặc sản ghềnh thác sông sâu, kéo máy câu rít từng hồi!',
    icon: '🐡',
    ttsSummary: 'Cá Lăng Đốm Hoa quý hiếm, đặc sản ghềnh thác ghì cong ngọn cần!'
  },
  {
    id: 'chim_trang',
    name: 'Cá Chim Trắng Lưỡi Kiếm',
    species: 'Piaractus brachypomus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 2.8,
    maxWeight: 6.2,
    points: 40,
    badgeColor: '#00838f',
    gradient: 'linear-gradient(135deg, #26c6da 0%, #006064 100%)',
    quote: 'Tốc độ xé nước như tia chớp, hàm răng sắc bén như thép!',
    icon: '🐠',
    ttsSummary: 'Cá Chim Trắng tốc độ xé nước như tia chớp, giằng co gay cấn!'
  },

  // Tier 3: Cực Phẩm (Epic / Sát Thủ Đầm Lầy)
  {
    id: 'koi_cam_thach',
    name: 'Cá Koi Ngũ Sắc Hoàng Gia',
    species: 'Cyprinus rubrofuscus var.',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 5.5,
    maxWeight: 13.5,
    points: 85,
    badgeColor: '#d84315',
    gradient: 'linear-gradient(135deg, #ff7043 0%, #bf360c 100%)',
    quote: 'Tuyệt tác tạo hóa! Vảy ngũ sắc lấp lánh như ngọc lục bảo!',
    icon: '🪸',
    ttsSummary: 'Cực phẩm Cá Koi Ngũ Sắc Hoàng Gia! Vảy ngọc lung linh tuyệt mỹ!'
  },
  {
    id: 'tre_hoang_kim',
    name: 'Cá Trê Hoàng Kim Phát Quang',
    species: 'Clarias gariepinus albino',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 6.5,
    maxWeight: 15.0,
    points: 95,
    badgeColor: '#ef6c00',
    gradient: 'linear-gradient(135deg, #ffa726 0%, #e65100 100%)',
    quote: 'Trê vàng toàn thân rực ánh hoàng kim, vạn người ao ước!',
    icon: '✨',
    ttsSummary: 'Cực phẩm Cá Trê Hoàng Kim Đột Biến! Toàn thân phát quang lấp lánh!'
  },
  {
    id: 'tam_hoang_gia',
    name: 'Cá Tầm Hoàng Gia Hắc Ngự',
    species: 'Acipenser baerii',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 8.5,
    maxWeight: 19.5,
    points: 110,
    badgeColor: '#283593',
    gradient: 'linear-gradient(135deg, #5c6bc0 0%, #1a237e 100%)',
    quote: 'Hóa thạch sống sông Danube, vương giả của thế giới thủy sinh!',
    icon: '🦈',
    ttsSummary: 'Cực phẩm Cá Tầm Hoàng Gia Hắc Ngự! Vương giả uy phong ngời ngời!'
  },
  {
    id: 'channa_hoang_de',
    name: 'Cá Chuối Hoàng Đế (Channa)',
    species: 'Channa marulioides',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 4.8,
    maxWeight: 12.0,
    points: 90,
    badgeColor: '#ad1457',
    gradient: 'linear-gradient(135deg, #ec407a 0%, #880e4f 100%)',
    quote: 'Chúa tể săn mồi đầm lầy, mắt rực lửa hoa văn rồng cuộn!',
    icon: '🐊',
    ttsSummary: 'Cực phẩm Cá Chuối Hoàng Đế! Chúa tể đầm lầy với hoa văn rồng cuộn!'
  },

  // Tier 4: Huyền Thoại (Mythic / Leviathan - Thủy Quái)
  {
    id: 'rong_kim_long',
    name: 'Cá Rồng Bối Đầu Vàng (Kim Long Quá Bối)',
    species: 'Scleropages formosus',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 18.0,
    maxWeight: 38.5,
    points: 280,
    badgeColor: '#ffb300',
    gradient: 'linear-gradient(135deg, #ffe082 0%, #ff8f00 100%)',
    quote: 'BẬC THẦY PHONG THỦY! Kim Long xuất hải, tài lộc vượng khí cuộn trào!',
    icon: '🐉',
    ttsSummary: 'HUYỀN THOẠI XUẤT HIỆN! Cá Rồng Kim Long Quá Bối xuất hải, tài lộc vượng khí ngập tràn!'
  },
  {
    id: 'thuy_quai_ho_sau',
    name: 'Thủy Quái Hồ Sâu (Cá Hô Khổng Lồ)',
    species: 'Catlocarpio siamensis',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 42.0,
    maxWeight: 96.0,
    points: 380,
    badgeColor: '#c62828',
    gradient: 'linear-gradient(135deg, #ef5350 0%, #b71c1c 100%)',
    quote: 'VUA CỦA CÁC LOÀI CÁ NƯỚC NGỌT! Cần câu cong vút cực hạn, bọt nước tung trời!',
    icon: '🐋',
    ttsSummary: 'THỦY QUÁI HỒ SÂU! Cá Hô Khổng Lồ kéo cong cần titan, cả bến thuyền cùng hò reo!'
  },
  {
    id: 'rua_than_ngoc',
    name: 'Cụ Rùa Vàng Thần Long',
    species: 'Cuora amboinensis aurea',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 55.0,
    maxWeight: 99.9,
    points: 500,
    badgeColor: '#e65100',
    gradient: 'linear-gradient(135deg, #ffb74d 0%, #bf360c 100%)',
    quote: 'RÙA VÀNG BÁCH NIÊN! Ban phúc trường thọ trăm tuổi, gia đạo bình an phát tài!',
    icon: '🐢',
    ttsSummary: 'ĐẠI CÁT TƯỜNG! Cụ Rùa Vàng Thần Long nổi lên ban phúc trường thọ gia đạo an khang!'
  }
];

// ============================================================================
// 1.1. DANH SÁCH QUÀ TẶNG TIKTOK LIVE CHUẨN (TIKTOK GIFTS CATALOG)
// Cập nhật chuẩn theo khay quà tặng TikTok Live thực tế
// ============================================================================
const TIKTOK_GIFTS = [
  {
    id: 'hoa_hong',
    name: 'Hoa hồng',
    aliases: ['hoa hong', 'rose', 'hoa hồng'],
    coins: 1,
    icon: '🌹',
    badge: '1 🪙',
    tier: 2,
    quote: 'Mưa hoa hồng rực rỡ mặt hồ, cá thơm bén mồi!',
    ttsAction: 'thả đóa Hoa Hồng thơm ngát dụ đàn cá tụ lại!'
  },
  {
    id: 'dinh',
    name: 'Đỉnh',
    aliases: ['dinh', 'đỉnh', 'top', 'thumbs up'],
    coins: 1,
    icon: '🐱👍',
    badge: '1 🪙',
    tier: 2,
    quote: 'Mèo Đỉnh giơ ngón cái, chúc buông cần là dính cá to!',
    ttsAction: 'tặng biểu tượng Đỉnh chóp, mèo thần tài trợ lực!'
  },
  {
    id: 'gg',
    name: 'GG',
    aliases: ['gg', 'good game'],
    coins: 1,
    icon: '🎮',
    badge: '1 🪙',
    tier: 2,
    quote: 'Good Game! Tinh thần cần thủ bất diệt!',
    ttsAction: 'gửi lời chúc Good Game, khuấy động hồ câu!'
  },
  {
    id: 'tay_cam',
    name: 'Tay cầm chơi game',
    aliases: ['tay cam choi game', 'tay cam', 'gamepad', 'controller', 'tay cầm', 'tay cầm chơi ...', 'tay cầm chơi'],
    coins: 100,
    icon: '🕹️',
    badge: '100 🪙',
    tier: 4,
    isLeviathan: true,
    quote: 'ĐẠI CHIẾN THỦY QUÁI! Cần titan uốn cong xé toạc mặt nước!',
    ttsAction: 'dâng Tay Cầm Chơi Game triệu hồi Thủy Quái Hồ Sâu!'
  },
  {
    id: 'yeu_ban',
    name: 'Yêu bạn',
    aliases: ['yeu ban', 'yêu bạn', 'love you', 'hug heart'],
    coins: 1,
    icon: '🥰',
    badge: '1 🪙',
    tier: 2,
    quote: 'Trao gửi yêu thương, đàn cá bơi quây quần ấm áp!',
    ttsAction: 'tặng Yêu Bạn ấm áp, đàn cá rủ nhau cắn câu!'
  },
  {
    id: 'chu_heo',
    name: 'Chú heo may mắn',
    aliases: ['chu heo may man', 'chu heo', 'chú heo may mắn', 'chú heo', 'lucky pig', 'pig', 'chú heo may ...', 'chú heo may'],
    coins: 10,
    icon: '🐷🎃',
    badge: '10 🪙',
    tier: 3,
    quote: 'Heo vàng đội bí ngô mang tài lộc, bắt ngay Cá Cực Phẩm!',
    ttsAction: 'thả Chú Heo May Mắn rước lộc, bắt trọn Cá Cực Phẩm!'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    aliases: ['tiktok', 'tik tok', 'tiktok logo'],
    coins: 1,
    icon: '🎵',
    badge: '1 🪙',
    tier: 2,
    quote: 'Giai điệu TikTok bùng nổ, hồ câu rộn rã tưng bừng!',
    ttsAction: 'bật tung giai điệu TikTok sôi động cả mặt hồ!'
  },
  {
    id: 'ban_tim',
    name: 'Bắn tim',
    aliases: ['ban tim', 'bắn tim', 'finger heart', 'heart'],
    coins: 5,
    icon: '🫰❤️',
    badge: '5 🪙',
    tier: 3,
    quote: 'Bắn tim siêu cấp, dâng mồi thượng hạng câu cá quý hiếm!',
    ttsAction: 'Bắn Tim siêu ngọt ngào, giật mẻ cá Quý Hiếm tuyệt đẹp!'
  },
  {
    id: 'hieu_y',
    name: 'Hiểu ý tôi chứ',
    aliases: ['hieu y toi chu', 'hieu y', 'hiểu ý tôi chứ', 'hiểu ý', 'wink'],
    coins: 1,
    icon: '😉💖',
    badge: '1 🪙',
    tier: 2,
    quote: 'Nháy mắt hiểu ý, cá to mắc câu trong tích tắc!',
    ttsAction: 'nháy mắt Hiểu Ý Tôi Chứ, vận đỏ ngập tràn bến câu!'
  }
];

function findMatchingGift(rawName, defaultCoins = 1) {
  if (!rawName) return TIKTOK_GIFTS[0];
  const lower = String(rawName).toLowerCase().trim();
  for (const g of TIKTOK_GIFTS) {
    if (g.name.toLowerCase() === lower || g.id === lower) return g;
    for (const alias of g.aliases) {
      if (lower.includes(alias) || alias.includes(lower)) return g;
    }
  }
  const byCoin = TIKTOK_GIFTS.find(g => g.coins === defaultCoins);
  if (byCoin) return byCoin;
  return {
    id: 'custom_gift',
    name: rawName,
    aliases: [],
    coins: defaultCoins,
    icon: defaultCoins >= 100 ? '🐉' : defaultCoins >= 10 ? '👑' : defaultCoins >= 5 ? '🎁' : '✨',
    badge: `${defaultCoins} 🪙`,
    tier: defaultCoins >= 100 ? 4 : defaultCoins >= 10 ? 3 : defaultCoins >= 5 ? 3 : 2,
    quote: 'Tấm lòng vàng của đại gia làm chấn động hồ câu!',
    ttsAction: `gửi tặng ${rawName} (${defaultCoins} xu)!`
  };
}

// ============================================================================
// 1.2. HỆ THỐNG ĐA CẦN THỦ NGỒI QUANH BỜ HỒ (SHORE ANGLERS RING SYSTEM)
// Tọa độ 16 vị trí chuẩn xác ôm trọn lòng hồ, bảo đảm 100% người câu nằm trọn trong khung hình
// ============================================================================
const SHORE_SLOTS = [
  // 1. Bờ Phía Bắc / Bờ Xa (4 cần thủ ngắm non nước hữu tình, buông cần xuống hồ)
  // Đặt tại y = 660-675 (mép nước xa), x rải từ 280 đến 790, hoàn toàn thoáng đãng
  { id: 0, shoreX: 280, shoreY: 670, waterX: 340, waterY: 790, dir: 'down', scale: 0.68, zIndex: 6 },
  { id: 1, shoreX: 450, shoreY: 655, waterX: 470, waterY: 785, dir: 'down', scale: 0.68, zIndex: 6 },
  { id: 2, shoreX: 620, shoreY: 655, waterX: 610, waterY: 785, dir: 'down', scale: 0.68, zIndex: 6 },
  { id: 3, shoreX: 790, shoreY: 670, waterX: 740, waterY: 790, dir: 'down', scale: 0.68, zIndex: 6 },

  // 2. Bờ Cỏ Phía Tây / Trái (4 cần thủ ngồi ven đầm sen, buông cần sang phải vào hồ)
  // Đặt tại x = 125-145 (cách mép trái màn hình 65-75px an toàn), y rải từ 830 đến 1340
  { id: 4, shoreX: 130, shoreY: 830,  waterX: 300, waterY: 880,  dir: 'right', scale: 0.82, zIndex: 8 },
  { id: 5, shoreX: 125, shoreY: 1000, waterX: 290, waterY: 1030, dir: 'right', scale: 0.86, zIndex: 8 },
  { id: 6, shoreX: 130, shoreY: 1170, waterX: 300, waterY: 1180, dir: 'right', scale: 0.90, zIndex: 9 },
  { id: 7, shoreX: 145, shoreY: 1340, waterX: 320, waterY: 1320, dir: 'right', scale: 0.95, zIndex: 10 },

  // 3. Bờ Phía Đông / Phải (4 cần thủ ngồi ven bến gỗ trên, buông cần sang trái vào hồ)
  // Đặt tại x = 910-935 (cách mép phải màn hình 85-95px an toàn), y rải từ 830 đến 1330
  { id: 8,  shoreX: 930, shoreY: 830,  waterX: 760, waterY: 880,  dir: 'left', scale: 0.82, zIndex: 8 },
  { id: 9,  shoreX: 935, shoreY: 1000, waterX: 770, waterY: 1030, dir: 'left', scale: 0.86, zIndex: 8 },
  { id: 10, shoreX: 925, shoreY: 1170, waterX: 760, waterY: 1180, dir: 'left', scale: 0.90, zIndex: 9 },
  { id: 11, shoreX: 910, shoreY: 1330, waterX: 750, waterY: 1320, dir: 'left', scale: 0.95, zIndex: 10 },

  // 4. Bờ Tiền Cảnh / Bến Gỗ Dưới (4 cần thủ VIP ngồi bến gỗ & bờ cỏ, buông cần lên mặt hồ)
  // Đặt tại y = 1475-1495, cách chat popup & HUD đáy >120px, khoảng cách ngang rộng rãi 210px
  { id: 12, shoreX: 230, shoreY: 1475, waterX: 350, waterY: 1390, dir: 'up', scale: 1.02, zIndex: 14 },
  { id: 13, shoreX: 440, shoreY: 1490, waterX: 470, waterY: 1400, dir: 'up', scale: 1.05, zIndex: 14 },
  { id: 14, shoreX: 650, shoreY: 1495, waterX: 620, waterY: 1405, dir: 'up', scale: 1.08, zIndex: 14 }, // Ghế VIP trung tâm bến
  { id: 15, shoreX: 850, shoreY: 1480, waterX: 730, waterY: 1395, dir: 'up', scale: 1.05, zIndex: 14 }
];

const activeLakeAnglers = new Map();

function registerLakeAngler(user, uniqueId, avatar, action = 'idle', fish = null, wish = '') {
  const key = uniqueId || user || `angler_${Date.now()}`;
  let slotIndex = -1;
  if (activeLakeAnglers.has(key)) {
    slotIndex = activeLakeAnglers.get(key).slotIndex;
  } else {
    const usedSlots = new Set();
    activeLakeAnglers.forEach(a => usedSlots.add(a.slotIndex));
    for (let i = 0; i < SHORE_SLOTS.length; i++) {
      if (!usedSlots.has(i)) {
        slotIndex = i;
        break;
      }
    }
    if (slotIndex === -1) {
      let oldestKey = null;
      let oldestTs = Infinity;
      activeLakeAnglers.forEach((val, k) => {
        if (val.lastActive < oldestTs) {
          oldestTs = val.lastActive;
          oldestKey = k;
        }
      });
      if (oldestKey) {
        slotIndex = activeLakeAnglers.get(oldestKey).slotIndex;
        activeLakeAnglers.delete(oldestKey);
      } else {
        slotIndex = 0;
      }
    }
  }

  const slotDef = SHORE_SLOTS[slotIndex] || SHORE_SLOTS[0];
  const safeAvatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(key)}`;
  const anglerRec = (state && state.anglers && state.anglers[key]) || {};

  const anglerObj = {
    slotIndex,
    user,
    uniqueId: key,
    avatar: safeAvatar,
    shoreX: slotDef.shoreX,
    shoreY: slotDef.shoreY,
    waterX: slotDef.waterX,
    waterY: slotDef.waterY,
    dir: slotDef.dir,
    scale: slotDef.scale,
    zIndex: slotDef.zIndex,
    action,
    wish: wish || anglerRec.lastWish || '',
    fish: fish || null,
    totalWeightKg: anglerRec.totalWeightKg || 0,
    catchesCount: anglerRec.catchesCount || 0,
    rank: 0,
    lastActive: Date.now()
  };
  activeLakeAnglers.set(key, anglerObj);
  return anglerObj;
}

const SIM_ANGLERS = [
  { user: 'Hải Đăng Cần Thủ', uniqueId: 'haidang.angler', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=haidang', wish: 'Thả mồi trùn quế, săn cá chép vàng 5 ký!' },
  { user: 'Trần Tuấn Sát Cá', uniqueId: 'tuancauca_99', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=tuancauca', wish: 'Quyết tâm giật con cá tra khủng phá kỷ lục!' },
  { user: 'Bích Thảo Thư Thái', uniqueId: 'thao.lotus', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=thao', wish: 'Em mới tập câu, xin một chú cá rô đồng lấy may ạ' },
  { user: 'Hoàng Long Cần Titan', uniqueId: 'long_titan_88', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=longtitan', wish: 'Săn thủy quái hồ sâu, kéo cong vút cần titan!' },
  { user: 'Minh Quân Bến Thuyền', uniqueId: 'quan.river', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=quan', wish: 'Chúc anh em cần thủ một ngày giỏ đầy ắp cá béo!' },
  { user: 'Diệu Hương Thư Giãn', uniqueId: 'huong_healing', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=huong', wish: 'Ngồi câu cá ngắm mây trời thanh thản, chúc cả nhà bình an!' },
  { user: 'Thanh Tùng Bến Sông', uniqueId: 'tung.angler', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=tung', wish: 'Vung cần bờ cỏ, săn cá lăng hoa ghềnh đá!' },
  { user: 'Phương Linh Câu Cá', uniqueId: 'linh.fishing', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=linh', wish: 'Chúc bến câu hôm nay tôm cá đầy khoang!' },
  { user: 'Bảo Nam Hồ Tây', uniqueId: 'nam.hotay', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=nam', wish: 'Đợi 1 phút cá cắn câu, kiên nhẫn ắt có quà to!' },
  { user: 'Thùy Dương Bờ Sen', uniqueId: 'duong.lotus', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=duong', wish: 'Hồ nước thanh tịnh ngắm hoa sen nở rực rỡ!' },
  { user: 'Quốc Việt Titan', uniqueId: 'viet.pro', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=viet', wish: 'Hôm nay trời đẹp cá đi ăn mạnh, kéo đã tay!' },
  { user: 'Mai Chi Cát Tường', uniqueId: 'maichi.lucky', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=maichi', wish: 'Gửi lời chúc đại cát đại lợi đến toàn thể anh em!' },
  { user: 'Anh Dũng Sông Sâu', uniqueId: 'dung.river', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=dung', wish: 'Cần thủ kiên trì ắt gặt hái mẻ cá rồng!' },
  { user: 'Khánh Toàn Bến Cũ', uniqueId: 'toan.dock', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=toan', wish: 'Bến gỗ đón bình minh, thả thính dụ cá to!' },
  { user: 'Ngọc Hân Cần Trúc', uniqueId: 'han.bamboo', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=han', wish: 'Mồi thơm phao đỏ, giỏ cá đầy ắp!' },
  { user: 'Hữu Phước Bến Hồ', uniqueId: 'phuoc.lake', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=phuoc', wish: 'Buông cần thanh tịnh, tâm an vạn sự lành!' }
];

function initShoreAnglers() {
  activeLakeAnglers.clear();
  const sortedAnglers = (state && state.anglers) 
    ? Object.values(state.anglers).sort((a, b) => (b.totalWeightKg || 0) - (a.totalWeightKg || 0))
    : [];

  let assignedCount = 0;
  for (const a of sortedAnglers) {
    if (assignedCount >= SHORE_SLOTS.length) break;
    registerLakeAngler(a.name, a.uniqueId, a.avatar, 'idle', null, a.lastWish || '');
    assignedCount++;
  }

  // Nếu còn ghế trống quanh hồ, nạp các cần thủ giả lập để luôn có không khí hồ câu nhộn nhịp
  if (Array.isArray(SIM_ANGLERS)) {
    for (const s of SIM_ANGLERS) {
      if (assignedCount >= SHORE_SLOTS.length) break;
      if (!activeLakeAnglers.has(s.uniqueId)) {
        registerLakeAngler(s.user, s.uniqueId, s.avatar, 'idle', null, s.wish);
        assignedCount++;
      }
    }
  }
}

const freeFishingSessions = new Map();

function getActiveLakeAnglersList() {
  const list = Array.from(activeLakeAnglers.values());
  const now = Date.now();
  list.sort((a, b) => (b.totalWeightKg || 0) - (a.totalWeightKg || 0));
  list.forEach((a, idx) => {
    a.rank = idx + 1;
    const session = freeFishingSessions.get(a.uniqueId) || freeFishingSessions.get(a.user);
    if (session && now < session.endsAt) {
      a.isFishing = true;
      a.fishingEndsAt = session.endsAt;
      a.remainingSec = Math.max(1, Math.ceil((session.endsAt - now) / 1000));
    } else {
      a.isFishing = false;
      a.remainingSec = 0;
    }
  });
  return list;
}

function addCommunityPoints(pts = 1) {
  if (!state.communityGoal) {
    state.communityGoal = { target: 500, current: 0, frenzyActive: false, frenzyEndsAt: 0 };
  }
  const now = Date.now();
  if (state.communityGoal.frenzyActive && now > state.communityGoal.frenzyEndsAt) {
    state.communityGoal.frenzyActive = false;
    state.communityGoal.current = 0;
    state.lakeCondition = 'Cá Đi Ăn Mạnh 🐟';
  }

  if (!state.communityGoal.frenzyActive) {
    state.communityGoal.current = Math.min(state.communityGoal.target, state.communityGoal.current + pts);
    if (state.communityGoal.current >= state.communityGoal.target) {
      state.communityGoal.frenzyActive = true;
      state.communityGoal.frenzyEndsAt = now + 60000; // 60s Bão Cá
      state.lakeCondition = '🔥 ĐẠI TIỆC BÃO CÁ GIỜ VÀNG (X2) 🔥';
      broadcastNotification('fishing.frenzy', {
        active: true,
        endsAt: state.communityGoal.frenzyEndsAt,
        msg: 'BÃO CÁ HỒ SÂU ĐÃ ĐƯỢC KÍCH HOẠT! TẤT CẢ CẦN THỦ NHẬN X2 ĐIỂM & TỈ LỆ CÁ TO!'
      });
    }
  }
}

// ============================================================================
// 2. QUẢN LÝ TIẾN TRÌNH ZEROTTS (WORKER DAEMON)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    this.startWorker();
  }

  resolvePythonBin() {
    const venvPy = path.join(__dirname, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    try {
      this.proc = spawn(pyBin, [scriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.proc.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString('utf8');
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleWorkerLine(line.trim());
        }
      });

      this.proc.stderr.on('data', (chunk) => {
        const msg = chunk.toString('utf8').trim();
        if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
      });

      this.proc.on('exit', (code) => {
        console.warn(`[ZeroTTS] Worker thoát với mã ${code}`);
        this.ready = false;
        this.status = 'stopped';
        for (const [, item] of this.pending) {
          clearTimeout(item.timer);
          item.resolve({ ok: false, error: 'ZeroTTS worker exited' });
        }
        this.pending.clear();
      });

      this.proc.on('error', (err) => {
        console.warn('[ZeroTTS Spawn Error]', err.message);
      });
    } catch (e) {
      console.warn('[ZeroTTS] Không khởi chạy được:', e.message);
    }
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'maichi';
        this.voices = msg.voices || ['maichi'];
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] Sẵn sàng! Giọng: ${this.voice}`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          pending.resolve({
            ok: true,
            url: `/data/tts-cache/${msg.filename}`,
            duration: msg.duration,
            elapsed: msg.elapsed,
            cached: !!msg.cached,
            voice: msg.voice || this.voice
          });
        }
      } else if (msg.type === 'error') {
        console.warn(`[ZeroTTS Error] ${msg.error}`);
        if (msg.id != null) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.id);
            pending.resolve({ ok: false, error: msg.error });
          }
        }
      }
    } catch (_) {}
  }

  synthesize(text, voice = 'maichi') {
    const clean = String(text || '').trim();
    if (!clean) return Promise.resolve({ ok: false, error: 'Nội dung rỗng' });

    if (!this.ready || !this.proc || this.proc.killed) {
      return Promise.resolve({
        ok: false,
        error: `ZeroTTS chưa sẵn sàng (trạng thái: ${this.status})`
      });
    }

    const id = ++this.reqCounter;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS timeout (18s)' });
      }, 18000);

      this.pending.set(id, { resolve, timer });
      try {
        this.proc.stdin.write(
          JSON.stringify({
            cmd: 'synth',
            id,
            text: clean,
            voice: voice || this.voice
          }) + '\n'
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: err.message });
      }
    });
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      voice: this.voice,
      voices: this.voices,
      model: this.model,
      pendingCount: this.pending.size
    };
  }
}

// ============================================================================
// 3. TRẠNG THÁI HỒ CÂU & BẢNG VÀNG CẦN THỦ
// ============================================================================
const DEFAULT_STATE = {
  totalCatches: 48,
  totalWeightKg: 186.5,
  totalBait: 360,
  hornsBlown: 24,
  lakeCondition: 'Cá Đi Ăn Mạnh 🐟',
  activeFish: null,
  rodState: 'idle', // idle, casting, hooked, reeling, celebrating
  anglers: {},
  recentEvents: [],
  communityGoal: {
    target: 500,
    current: 185,
    frenzyActive: false,
    frenzyEndsAt: 0
  },
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    autoSim: false,
    autoSimIntervalMs: 8000,
    freeFishingDurationSec: 60
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'zenfacts_vn',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function calculateAnglerTitle(totalWeightKg, catchesCount) {
  if (totalWeightKg >= 60 || catchesCount >= 20) return 'Vua Sát Cá Đại Dương 👑';
  if (totalWeightKg >= 30 || catchesCount >= 12) return 'Bá Chủ Đầm Lầy 🦈';
  if (totalWeightKg >= 15 || catchesCount >= 6) return 'Cần Thủ Chuyên Nghiệp 🐠';
  if (totalWeightKg >= 5 || catchesCount >= 3) return 'Tay Câu Cừ Khôi 🐟';
  return 'Cần Thủ Nhập Môn 🎣';
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        anglers: saved.anglers || {},
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    } else if (fs.existsSync(LEGACY_STATE_FILE)) {
      // Migrate from legacy temple state
      const legacy = JSON.parse(fs.readFileSync(LEGACY_STATE_FILE, 'utf8'));
      const migratedAnglers = {};
      if (legacy.devotees) {
        for (const [id, d] of Object.entries(legacy.devotees)) {
          const catches = Math.max(1, Math.floor((d.incense || 1)));
          const weight = +(catches * 2.8).toFixed(1);
          migratedAnglers[id] = {
            name: d.name,
            uniqueId: d.uniqueId || id,
            avatar: d.avatar || '',
            catchesCount: catches,
            totalWeightKg: weight,
            points: d.merit || 50,
            title: calculateAnglerTitle(weight, catches),
            lastWish: d.lastWish || 'Chúc hội cần thủ may mắn lên cá to!',
            bestCatch: { fishName: 'Cá Chép Vàng', weightKg: 4.8 }
          };
        }
      }
      return {
        ...DEFAULT_STATE,
        anglers: migratedAnglers
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được state, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();
initShoreAnglers();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalCatches: state.totalCatches,
      totalWeightKg: state.totalWeightKg,
      totalBait: state.totalBait,
      hornsBlown: state.hornsBlown,
      lakeCondition: state.lakeCondition,
      communityGoal: state.communityGoal,
      anglers: state.anglers,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  }, 1200);
}

function getLeaderboard(limit = 6) {
  return Object.values(state.anglers)
    .sort((a, b) => (b.totalWeightKg || 0) - (a.totalWeightKg || 0) || (b.points || 0) - (a.points || 0))
    .slice(0, limit)
    .map((a, index) => ({
      rank: index + 1,
      name: a.name,
      uniqueId: a.uniqueId,
      avatar: a.avatar || '',
      totalWeightKg: a.totalWeightKg || 0,
      catchesCount: a.catchesCount || 0,
      points: a.points || 0,
      title: a.title || 'Cần Thủ Nhập Môn 🎣',
      bestCatch: a.bestCatch || null,
      lastWish: a.lastWish || ''
    }));
}

// Bộ lọc an toàn ký tự & spam
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|lừa đảo|lừa à|telegram)/i;

function isBlockedSpamOrToxic(rawText) {
  if (!rawText) return true;
  if (WEIRD_SPAM_RE.test(rawText)) return true;
  if (BAD_WORDS_RE.test(rawText)) return true;
  return false;
}

function sanitizeWishText(raw) {
  if (!raw) return '';
  let text = String(raw).normalize('NFKC').replace(BRACKET_EMOTE_RE, ' ').trim();
  text = text.replace(ALLOWED_VI_TEXT_RE, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > 95) text = text.slice(0, 95).trim();
  return text;
}

function sanitizeUserName(raw) {
  if (!raw) return 'Cần Thủ Vô Danh';
  let name = String(raw).normalize('NFKC').replace(BRACKET_EMOTE_RE, ' ').trim();
  name = name.replace(ALLOWED_VI_NAME_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return 'Cần Thủ Ẩn Danh';
  if (name.length > 24) name = name.slice(0, 24).trim();
  return name;
}

function recordAngler(user, uniqueId, avatar, pointsGained = 10, weightGained = 0, catchesGained = 0, wish = '', caughtFish = null) {
  const key = uniqueId || user || `angler_${Date.now()}`;
  const existing = state.anglers[key] || {
    name: user || 'Cần Thủ',
    uniqueId: key,
    avatar: avatar || '',
    catchesCount: 0,
    totalWeightKg: 0,
    points: 0,
    title: 'Cần Thủ Nhập Môn 🎣',
    bestCatch: null,
    lastWish: ''
  };

  existing.name = user || existing.name;
  if (avatar) existing.avatar = avatar;
  existing.points += pointsGained;
  existing.catchesCount += catchesGained;
  existing.totalWeightKg = +(existing.totalWeightKg + weightGained).toFixed(1);
  existing.title = calculateAnglerTitle(existing.totalWeightKg, existing.catchesCount);
  if (wish) existing.lastWish = wish;

  if (caughtFish) {
    if (!existing.bestCatch || (caughtFish.weightKg > (existing.bestCatch.weightKg || 0))) {
      existing.bestCatch = {
        fishName: caughtFish.name,
        weightKg: caughtFish.weightKg,
        rarity: caughtFish.rarity
      };
    }
  }

  state.anglers[key] = existing;
  return existing;
}

function pushEventLog(event) {
  const item = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...event
  };
  state.recentEvents.unshift(item);
  if (state.recentEvents.length > 40) {
    state.recentEvents.pop();
  }
  return item;
}

function getRandomFish(tierFilter = null) {
  let candidates = FISH_CATALOG;
  if (tierFilter != null) {
    candidates = FISH_CATALOG.filter((f) => f.tier === tierFilter);
  }
  if (!candidates.length) {
    // Weighted random distribution
    const roll = Math.random();
    if (roll < 0.60) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 1); // Common 60%
    } else if (roll < 0.85) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 2); // Rare 25%
    } else if (roll < 0.96) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 3); // Epic 11%
    } else {
      candidates = FISH_CATALOG.filter((f) => f.tier === 4); // Mythic 4%
    }
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const weight = +(chosen.minWeight + Math.random() * (chosen.maxWeight - chosen.minWeight)).toFixed(1);
  return {
    ...chosen,
    weightKg: weight
  };
}

function getPublicState() {
  const now = Date.now();
  if (state.communityGoal && state.communityGoal.frenzyActive && now > state.communityGoal.frenzyEndsAt) {
    state.communityGoal.frenzyActive = false;
    state.communityGoal.current = 0;
    state.lakeCondition = 'Cá Đi Ăn Mạnh 🐟';
  }

  return {
    totalCatches: state.totalCatches,
    totalWeightKg: state.totalWeightKg,
    totalBait: state.totalBait,
    hornsBlown: state.hornsBlown,
    lakeCondition: state.lakeCondition,
    activeFish: state.activeFish,
    rodState: state.rodState,
    leaderboard: getLeaderboard(6),
    recentEvents: state.recentEvents.slice(0, 15),
    communityGoal: state.communityGoal || { target: 500, current: 0, frenzyActive: false, frenzyEndsAt: 0 },
    activeAnglers: getActiveLakeAnglersList(),
    gifts: TIKTOK_GIFTS,
    settings: state.settings,
    tiktok: state.tiktok
  };
}

// ============================================================================
// 4. HÀNH ĐỘNG CÂU CÁ & TƯƠNG TÁC (FISHING ENGINE)
// ============================================================================
const FishingEngine = {
  // 1. Thả thính / Ném mồi dụ cá (Tương ứng Thả Tim)
  castBait(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const points = count;

    state.totalBait += count;
    addCommunityPoints(count);
    const angler = recordAngler(user, uniqueId, avatar, points, 0, 0);
    const lakeAngler = registerLakeAngler(angler.name, angler.uniqueId, angler.avatar, 'baiting');

    const event = pushEventLog({
      type: 'castBait',
      slotIndex: lakeAngler.slotIndex,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      count,
      points,
      title: angler.title,
      ttsText: params.readTts ? `Cần thủ ${angler.name} vừa thả ${count} nắm thính thơm dụ cá!` : ''
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 2. Quăng cần / Thả phao chờ cá cắn (Mặc định 1 phút đối với người xem không có quà)
  castRod(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Quăng cần thả phao, đợi 1 phút cá cắn!';
    const userKey = uniqueId || user || 'angler';
    const now = Date.now();

    // Nếu cần thủ đang trong phiên câu cá miễn phí (chưa hết 1 phút)
    if (freeFishingSessions.has(userKey)) {
      const session = freeFishingSessions.get(userKey);
      if (now < session.endsAt) {
        const remainingSec = Math.max(1, Math.ceil((session.endsAt - now) / 1000));
        const event = pushEventLog({
          type: 'waitingFish',
          slotIndex: session.slotIndex,
          user: session.user,
          uniqueId: session.uniqueId,
          avatar: session.avatar,
          wish: wish || session.wish,
          remainingSec,
          points: 1,
          ttsText: params.readTts ? `Cần thủ ${session.user} đang buông câu, còn ${remainingSec} giây cá sẽ cắn!` : ''
        });
        broadcastNotification('fishing.event', { event, state: getPublicState() });
        return { event, state: getPublicState(), waiting: true, remainingSec };
      } else {
        clearTimeout(session.timer);
        freeFishingSessions.delete(userKey);
      }
    }

    const durationSec = Math.max(5, Number(params.durationSec) || (state.settings?.freeFishingDurationSec ?? 60));
    const durationMs = durationSec * 1000;
    state.rodState = 'casting';
    addCommunityPoints(3);
    const angler = recordAngler(user, uniqueId, avatar, 5, 0, 0, wish);
    const lakeAngler = registerLakeAngler(angler.name, angler.uniqueId, angler.avatar, 'casting', null, wish);

    const event = pushEventLog({
      type: 'castRod',
      slotIndex: lakeAngler.slotIndex,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      wish,
      durationSec,
      remainingSec: durationSec,
      points: 5,
      title: angler.title,
      ttsText: params.readTts === false
        ? ''
        : `Cần thủ ${angler.name} vung cần buông câu giữa hồ! Đang đợi 1 phút cá cắn câu!`
    });

    // Đặt hẹn giờ đúng durationSec (1 phút) tự động câu trúng cá random
    const timer = setTimeout(() => {
      freeFishingSessions.delete(userKey);
      FishingEngine.hookFish({
        user: angler.name,
        uniqueId: angler.uniqueId,
        avatar: angler.avatar,
        wish: wish || 'Sau 1 phút kiên nhẫn câu cá, cá to đã cắn câu!',
        isFreeCatch: true,
        readTts: true
      });
    }, durationMs);

    freeFishingSessions.set(userKey, {
      timer,
      startedAt: now,
      endsAt: now + durationMs,
      durationSec,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      wish,
      slotIndex: lakeAngler.slotIndex
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 3. Giật cần / Bắt cá (Hook Fish)
  hookFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const userKey = uniqueId || user || 'angler';
    const now = Date.now();

    // Nếu người xem không có quà và chưa bấm force/donate:
    // Kiểm tra thời gian câu cá
    if (!params.force && !params.isFreeCatch) {
      if (freeFishingSessions.has(userKey)) {
        const session = freeFishingSessions.get(userKey);
        if (now < session.endsAt) {
          const remainingSec = Math.max(1, Math.ceil((session.endsAt - now) / 1000));
          const event = pushEventLog({
            type: 'waitingFish',
            slotIndex: session.slotIndex,
            user: session.user,
            uniqueId: session.uniqueId,
            avatar: session.avatar,
            wish: params.wish || session.wish,
            remainingSec,
            points: 1,
            ttsText: `Cần thủ ${session.user} đang buông câu, còn ${remainingSec} giây nữa cá mới cắn!`
          });
          broadcastNotification('fishing.event', { event, state: getPublicState() });
          return { event, state: getPublicState(), waiting: true, remainingSec };
        }
      } else {
        // Chưa buông cần câu: bắt đầu phiên câu 1 phút
        return this.castRod(params);
      }
    }

    // Xóa session nếu câu thành công
    if (freeFishingSessions.has(userKey)) {
      clearTimeout(freeFishingSessions.get(userKey).timer);
      freeFishingSessions.delete(userKey);
    }

    const wish = sanitizeWishText(params.wish) || 'Giật cần lên cá to!';
    const tierOverride = params.tierOverride != null ? Number(params.tierOverride) : null;
    const caughtFish = getRandomFish(tierOverride);

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'hooked';

    const points = caughtFish.points;
    addCommunityPoints(points >= 50 ? 10 : 5);
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, wish, caughtFish);
    const lakeAngler = registerLakeAngler(angler.name, angler.uniqueId, angler.avatar, 'hooked', caughtFish, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Chúc mừng cần thủ ${angler.name} vừa giật cần bắt được ${caughtFish.name} nặng ${caughtFish.weightKg} ký! ${caughtFish.quote}`;

    const event = pushEventLog({
      type: 'hookFish',
      slotIndex: lakeAngler.slotIndex,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      wish,
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      points,
      title: angler.title,
      isFreeCatch: !!params.isFreeCatch,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 4. Thổi còi bến thuyền / Báo cá cắn câu (Tương ứng Follow / Share)
  soundHorn(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Báo cá! Báo cá! Chúc cả bến thuyền cùng bội thu!';
    const points = 15;

    state.hornsBlown += 1;
    addCommunityPoints(8);
    const angler = recordAngler(user, uniqueId, avatar, points, 0, 0, wish);
    const lakeAngler = registerLakeAngler(angler.name, angler.uniqueId, angler.avatar, 'horning', null, wish);

    const ttsText = params.readTts
      ? `Cần thủ ${angler.name} thổi còi báo cá rộn rã toàn hồ: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'soundHorn',
      slotIndex: lakeAngler.slotIndex,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      points,
      wish,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 5. Mồi Thượng Hạng (Quà Vừa: 5-99 xu) -> Chắc chắn bắt cá Quý Hiếm hoặc Cực Phẩm
  catchBigFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const userKey = uniqueId || user || '';
    if (freeFishingSessions.has(userKey)) {
      clearTimeout(freeFishingSessions.get(userKey).timer);
      freeFishingSessions.delete(userKey);
    }
    const coins = Math.max(5, Number(params.coins) || 20);
    const tier = coins >= 30 ? 3 : 2;
    const caughtFish = getRandomFish(tier);

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'celebrating';

    const points = coins * 15;
    addCommunityPoints(coins * 4);
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, params.giftName || 'Dâng Mồi Thượng Hạng', caughtFish);
    const lakeAngler = registerLakeAngler(angler.name, angler.uniqueId, angler.avatar, 'celebrating', caughtFish, params.giftName || 'Dâng Mồi Thượng Hạng');

    const ttsText = params.readTts === false
      ? ''
      : `Đại cần thủ ${angler.name} dùng mồi câu thượng hạng, giật vút lên ${caughtFish.name} nặng ${caughtFish.weightKg} ký! Cả bến thuyền cùng chúc mừng!`;

    const event = pushEventLog({
      type: 'catchBigFish',
      slotIndex: lakeAngler.slotIndex,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      coins,
      giftName: params.giftName || 'Mồi Thượng Hạng',
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 6. Đại Chiến Thủy Quái (Quà Lớn: >= 100 xu) -> Cá Rồng Kim Long hoặc Thủy Quái Hồ Sâu
  catchLeviathan(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const userKey = uniqueId || user || '';
    if (freeFishingSessions.has(userKey)) {
      clearTimeout(freeFishingSessions.get(userKey).timer);
      freeFishingSessions.delete(userKey);
    }
    const coins = Math.max(100, Number(params.coins) || 199);
    const caughtFish = getRandomFish(4); // Mythic Tier 4

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'celebrating';
    state.lakeCondition = 'Đại Tiệc Thủy Quái 🐉';

    const points = coins * 30;
    addCommunityPoints(100);
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, params.giftName || 'Đại Lễ Săn Thủy Quái', caughtFish);
    const lakeAngler = registerLakeAngler(angler.name, angler.uniqueId, angler.avatar, 'celebrating', caughtFish, params.giftName || 'Đại Lễ Săn Thủy Quái');

    const ttsText = params.readTts === false
      ? ''
      : `CHẤN ĐỘNG HỒ CÂU! Đại cao thủ ${angler.name} vừa bắt được huyền thoại ${caughtFish.name} nặng ${caughtFish.weightKg} ký! ${caughtFish.quote}`;

    const event = pushEventLog({
      type: 'catchLeviathan',
      slotIndex: lakeAngler.slotIndex,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      coins,
      giftName: params.giftName || 'Cá Rồng Kim Long',
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 7. Tặng quà TikTok Live chuẩn danh mục (Send Gift Engine - Donate luôn bắt cá random ngay lập tức)
  sendGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const userKey = uniqueId || user || '';

    // Hủy bỏ thời gian đếm ngược 1 phút nếu người này đang chờ câu miễn phí
    if (freeFishingSessions.has(userKey)) {
      clearTimeout(freeFishingSessions.get(userKey).timer);
      freeFishingSessions.delete(userKey);
    }

    const giftInput = params.gift || params.giftId || params.giftName || 'hoa_hong';
    const matchedGift = typeof giftInput === 'object' && giftInput.name
      ? giftInput
      : findMatchingGift(giftInput, Number(params.coins) || 1);

    const coins = Math.max(1, Number(params.coins) || matchedGift.coins || 1);
    const repeatCount = Math.max(1, Number(params.repeatCount) || 1);
    const totalCoins = coins * repeatCount;

    // Tích điểm mục tiêu cộng đồng
    addCommunityPoints(totalCoins * 6);

    // Xác định độ hiếm cá (Donate luôn câu được cá random ngay lập tức)
    let tier = matchedGift.tier;
    if (totalCoins >= 100 || matchedGift.isLeviathan) tier = 4;
    else if (totalCoins >= 10) tier = 3;
    else if (totalCoins >= 5) tier = 3;
    else if (!tier || tier < 2) tier = Math.random() < 0.6 ? 2 : 1; // Quà 1 xu câu cá Quý Hiếm hoặc Phổ Thông

    const isFrenzy = state.communityGoal?.frenzyActive;
    const caughtFish = getRandomFish(tier);
    if (isFrenzy) {
      caughtFish.weightKg = +(caughtFish.weightKg * 1.5).toFixed(1);
      caughtFish.points = Math.round(caughtFish.points * 2);
    }

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'celebrating';

    const pointsGained = totalCoins * 25 + caughtFish.points;
    const angler = recordAngler(
      user,
      uniqueId,
      avatar,
      pointsGained,
      caughtFish.weightKg,
      1,
      `Tặng ${matchedGift.name} (${totalCoins} xu)`,
      caughtFish
    );

    const lakeAngler = registerLakeAngler(angler.name, angler.uniqueId, angler.avatar, 'celebrating', caughtFish, `Tặng ${matchedGift.name}`);

    const isLeviathan = totalCoins >= 100 || matchedGift.isLeviathan;
    if (isLeviathan) {
      state.lakeCondition = 'Đại Tiệc Thủy Quái 🐉';
    }

    const ttsText = params.readTts === false
      ? ''
      : isLeviathan
      ? `CHẤN ĐỘNG HỒ CÂU! Đại gia ${angler.name} tặng ${matchedGift.name}, kéo lên ${caughtFish.name} nặng ${caughtFish.weightKg} ký! ${caughtFish.quote}`
      : `Đại gia ${angler.name} vừa tặng ${matchedGift.name} ${matchedGift.icon}! Bắt ngay ${caughtFish.name} nặng ${caughtFish.weightKg} ký! Cả bến câu cùng chúc mừng!`;

    const event = pushEventLog({
      type: 'gift',
      slotIndex: lakeAngler.slotIndex,
      giftId: matchedGift.id,
      giftName: matchedGift.name,
      giftIcon: matchedGift.icon,
      coins: totalCoins,
      repeatCount,
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      points: pointsGained,
      title: angler.title,
      isLeviathan,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  updateSettings(params = {}) {
    state.settings = {
      ...state.settings,
      ...params
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  },

  resetState() {
    state.totalCatches = 0;
    state.totalWeightKg = 0;
    state.totalBait = 0;
    state.hornsBlown = 0;
    state.lakeCondition = 'Nước Tĩnh Lặng 🌊';
    state.activeFish = null;
    state.rodState = 'idle';
    state.anglers = {};
    state.recentEvents = [];
    saveState();
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;
const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) return null;

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 2) return null;

  // Chống spam (cooldown 3.5s / người)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) return null;
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

  // 1. Thả thính / Mồi
  if (lower.includes('thả thính') || lower.includes('tha thinh') || lower.includes('mồi') || lower.includes('moi') || lower.includes('thính')) {
    return FishingEngine.castBait({ user: cleanUser, uniqueId, avatar, count: 5 });
  }

  // 2. Thổi còi / Báo cá
  if (lower.includes('thổi còi') || lower.includes('thoi coi') || lower.includes('báo cá') || lower.includes('bao ca') || lower.includes('còi') || lower.includes('coi')) {
    return FishingEngine.soundHorn({ user: cleanUser, uniqueId, avatar, wish: cleanWish, readTts: true });
  }

  // 3. Mọi bình luận / câu cá / quăng cần của người xem không có quà:
  // Đều vào chế độ buông cần thả câu (mặc định 1 phút = 60s sau tự động câu trúng cá random)
  return FishingEngine.castRod({ user: cleanUser, uniqueId, avatar, wish: cleanWish, readTts: true });
}

function extractUserFromEvent(data) {
  const user = data?.nickname || data?.uniqueId || data?.user?.nickname || data?.user?.uniqueId || 'Cần Thủ';
  const uniqueId = data?.uniqueId || data?.user?.uniqueId || '';
  const avatar = data?.profilePictureUrl 
    || data?.user?.profilePictureUrls?.[0] 
    || data?.user?.avatarThumb?.urlList?.[0]
    || data?.userDetails?.profilePictureUrls?.[0]
    || data?.profilePictureUrls?.[0]
    || (uniqueId ? `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uniqueId)}` : '');
  return { user, uniqueId, avatar };
}

async function resolveTikTokUsername(input) {
  if (!input) return null;
  let str = String(input).trim();
  const atMatch = str.match(/@([a-zA-Z0-9_.-]+)/);
  if (atMatch) return atMatch[1];
  const urlMatch = str.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/);
  if (urlMatch) return urlMatch[1];
  return str.replace(/[^a-zA-Z0-9_.-]/g, '');
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('fishing.state', getPublicState());

  tiktokConn = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  // Bảo vệ wsClient khỏi emit error không có listener sau khi đóng kết nối
  tiktokConn.on(ControlEvent.WEBSOCKET_CONNECTED, (wsClient) => {
    if (wsClient && typeof wsClient.on === 'function') {
      wsClient.on('error', (err) => {
        console.warn('[TikTok Live WS Error]', err?.message || err);
      });
      const origRemoveAll = wsClient.removeAllListeners.bind(wsClient);
      wsClient.removeAllListeners = function (event) {
        origRemoveAll(event);
        this.on('error', () => {});
        return this;
      };
    }
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Đã kết nối hồ câu @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    const errMsg = err?.exception?.message || err?.info || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    state.tiktok.lastError = errMsg;
    console.warn('[TikTok Live Warning]', errMsg);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('fishing.viewerCount', { viewerCount });
    }
  });

  tiktokConn.on(WebcastEvent.MEMBER, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    recordAngler(user, uniqueId, avatar, 1, 0, 0, 'Đã vào hồ câu cá');
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);

    // Gửi sự kiện chat ra giao diện stream ngay lập tức để hiển thị comment pill với avatar
    broadcastNotification('fishing.chat', {
      user,
      uniqueId,
      avatar,
      comment: commentText,
      timestamp: Date.now()
    });

    const trimmedVote = String(commentText || '').trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(trimmedVote)) {
      if (gplxEngine) {
        gplxEngine.submitAnswer({ user, uniqueId, avatar, answer: trimmedVote });
      }
    }

    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    FishingEngine.castBait({ user, uniqueId, avatar, count: likeCount });
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    FishingEngine.soundHorn({
      user,
      uniqueId,
      avatar,
      wish: 'Hữu duyên tương ngộ nơi hồ câu, chúc buông cần thắng lợi!',
      readTts: false
    });
  };

  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const text = String(data?.label || '').toLowerCase();
    if (text.includes('follow') || text.includes('share')) {
      handleSocialEvent(data);
    }
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const rawGiftName = data?.giftName || data?.name || 'Quà Tặng Hồ Câu';
    const diamondCount = Number(data?.diamondCount || 0);
    const repeatCount = Number(data?.repeatCount || 1);
    const totalCoins = Math.max(1, diamondCount * repeatCount);

    console.log(`[TikTok Gift] ${user} tặng ${rawGiftName} (${totalCoins} xu) x${repeatCount}`);

    const matchedGift = findMatchingGift(rawGiftName, totalCoins);
    FishingEngine.sendGift({
      user,
      uniqueId,
      avatar,
      gift: matchedGift,
      coins: totalCoins,
      repeatCount,
      readTts: true
    });
  });

  try {
    const roomState = await tiktokConn.connect();
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('fishing.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    broadcastNotification('fishing.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('fishing.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (GIẢ LẬP CẦN THỦ TƯƠNG TÁC)
// ============================================================================
let autoSimTimer = null;

function runSingleSimulationStep() {
  const pick = SIM_ANGLERS[Math.floor(Math.random() * SIM_ANGLERS.length)];
  const roll = Math.random();

  // Phát sóng bình luận giả lập ra overlay chat
  broadcastNotification('fishing.chat', {
    user: pick.user,
    uniqueId: pick.uniqueId,
    avatar: pick.avatar,
    comment: pick.wish,
    timestamp: Date.now()
  });

  if (roll < 0.25) {
    FishingEngine.castBait({ user: pick.user, uniqueId: pick.uniqueId, avatar: pick.avatar, count: 5 });
  } else if (roll < 0.50) {
    FishingEngine.castRod({ user: pick.user, uniqueId: pick.uniqueId, avatar: pick.avatar, wish: pick.wish });
  } else if (roll < 0.70) {
    FishingEngine.hookFish({ user: pick.user, uniqueId: pick.uniqueId, avatar: pick.avatar, wish: pick.wish });
  } else if (roll < 0.88) {
    const randomGift = TIKTOK_GIFTS[Math.floor(Math.random() * TIKTOK_GIFTS.length)];
    FishingEngine.sendGift({
      user: pick.user,
      uniqueId: pick.uniqueId,
      avatar: pick.avatar,
      gift: randomGift,
      coins: randomGift.coins,
      readTts: randomGift.coins >= 5
    });
  } else {
    FishingEngine.soundHorn({ user: pick.user, uniqueId: pick.uniqueId, avatar: pick.avatar, wish: pick.wish });
  }
}

function configureAutoSim(enabled) {
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  state.settings.autoSim = !!enabled;
  if (enabled) {
    console.log('[AutoSim] Bật chế độ giả lập cần thủ tương tác...');
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 8000);
  } else {
    console.log('[AutoSim] Đã tắt chế độ giả lập.');
  }
}

// ============================================================================
// 7. BỘ ĐIỀU PHỐI JSON-RPC 2.0 (RPC DISPATCHER)
// ============================================================================
const GplxEngine = require('./gplx_engine');
let gplxEngine = null;

async function handleRpcCall(method, params = {}) {
  switch (method) {
    // GPLX Trivia Game Methods
    case 'gplx.getState':
      return gplxEngine ? gplxEngine.getState() : {};
    case 'gplx.submitAnswer':
      return gplxEngine ? gplxEngine.submitAnswer(params) : null;
    case 'gplx.nextQuestion':
      return gplxEngine ? gplxEngine.nextQuestion() : {};
    case 'gplx.prevQuestion':
      return gplxEngine ? gplxEngine.prevQuestion() : {};
    case 'gplx.jumpToQuestion':
      return gplxEngine ? gplxEngine.jumpToQuestion(params.id) : {};
    case 'gplx.restartTimer':
      return gplxEngine ? gplxEngine.restartTimer() : {};
    case 'gplx.toggleMultiplier':
      return gplxEngine ? gplxEngine.toggleMultiplier() : {};
    case 'gplx.simulateComment':
      return gplxEngine ? gplxEngine.simulateComment(params) : null;
    // Fishing Methods
    case 'fishing.castBait':
    case 'temple.incense': // Backward-compatible alias
      return FishingEngine.castBait(params);

    case 'fishing.castRod':
    case 'temple.prayer': // Backward-compatible alias
      return FishingEngine.castRod(params);

    case 'fishing.hookFish':
    case 'temple.fortune':
    case 'temple.drawFortune': // Backward-compatible alias
      return FishingEngine.hookFish(params);

    case 'fishing.soundHorn':
    case 'temple.bell': // Backward-compatible alias
      return FishingEngine.soundHorn(params);

    case 'fishing.catchBigFish':
    case 'temple.giftLotus': // Backward-compatible alias
      return FishingEngine.catchBigFish(params);

    case 'fishing.catchLeviathan':
    case 'temple.grandCeremony': // Backward-compatible alias
      return FishingEngine.catchLeviathan(params);

    case 'fishing.sendGift':
      return FishingEngine.sendGift(params);

    case 'fishing.getState':
    case 'temple.getState':
      return getPublicState();

    case 'fishing.getLeaderboard':
    case 'temple.getLeaderboard':
      return getLeaderboard(params.limit || 6);

    case 'fishing.resetState':
    case 'temple.resetMerit':
      return FishingEngine.resetState();

    case 'fishing.setSettings':
    case 'temple.setSettings':
      return FishingEngine.updateSettings(params);

    case 'fishing.connectTikTok':
    case 'temple.connectTikTok':
      return await connectTikTokLive(params.username);

    case 'fishing.disconnectTikTok':
    case 'temple.disconnectTikTok':
      return disconnectTikTokLive();

    case 'fishing.startAutoSim':
      configureAutoSim(true);
      return getPublicState();

    case 'fishing.stopAutoSim':
      configureAutoSim(false);
      return getPublicState();

    case 'tts.synthesize':
      return await zeroTts.synthesize(params.text, params.voice);

    case 'tts.status':
      return zeroTts.getStatus();

    default:
      throw new Error(`Method không tồn tại: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS SERVER & WEBSOCKET BROADCASTER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tĩnh tài nguyên
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/tts-cache', express.static(TTS_CACHE_DIR));

// JSON-RPC 2.0 HTTP Endpoint
app.post('/rpc', async (req, res) => {
  const body = req.body;
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' }
    });
  }

  try {
    const result = await handleRpcCall(body.method, body.params || {});
    return res.json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      result
    });
  } catch (err) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32000, message: err.message || 'Internal RPC Error' }
    });
  }
});

// Danh mục cá API
app.get('/api/fish-catalog', (_req, res) => {
  res.json({ ok: true, catalog: FISH_CATALOG });
});

// ZeroTTS HTTP Endpoint (Mai Chi default)
app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('error', (err) => {
  console.warn('[WebSocket Server Error]', err?.message || err);
});

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(payload);
      } catch (err) {
        console.warn('[WS Broadcast Error]', err?.message || err);
      }
    }
  }
}

gplxEngine = new GplxEngine(broadcastNotification);

wss.on('connection', (ws) => {
  ws.on('error', (err) => {
    console.warn('[WS Client Error]', err?.message || err);
  });

  // Gửi trạng thái ban đầu GPLX
  if (gplxEngine) {
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'gplx.state',
        params: gplxEngine.getState()
      })
    );
  }

  // Gửi trạng thái ban đầu
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'fishing.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🎣 HỒ CÂU CÁ GIẢI TRÍ TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'zenfacts_vn';
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
    });
  }
});
