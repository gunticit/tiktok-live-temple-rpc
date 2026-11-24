'use strict';

const { describe, test, expect } = require('bun:test');
const core = require('../lib/xiangqi-core.cjs');
const ai = require('../lib/xiangqi-ai.cjs');
const XiangqiLiveEngine = require('../xiangqi_engine');

describe('Xiangqi Core Rules (Cờ Tướng 9x10)', () => {
  test('starting position has exactly 44 legal moves for Red', () => {
    const { board, turn } = core.parseFen(core.INITIAL_FEN);
    expect(turn).toBe('r');
    const moves = core.generateLegalMoves(board, 'r');
    expect(moves.length).toBe(44);
  });

  test('Flying General (Lộ Mặt Tướng) rule forbids exposing Generals face-to-face', () => {
    // Red King at E0 (r=9,c=4), Black King at E9 (r=0,c=4), Red Rook at E5 (r=4,c=4) blocking them
    const { board } = core.parseFen('4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1');
    const moves = core.generateLegalMoves(board, 'r');
    // Rook CANNOT leave column E (c=4), only move along column E!
    const rookMoves = moves.filter((m) => m.piece === 'R');
    expect(rookMoves.length).toBeGreaterThan(0);
    expect(rookMoves.every((m) => m.toC === 4)).toBe(true);
    // Verify specific illegal description when trying to leave file E
    const reason = core.describeIllegalMove(board, 'r', 4, 4, 4, 3);
    expect(reason).toContain('Lộ Mặt Tướng');
  });

  test('Horse leg blocking (Cản chân Mã) is enforced with Vietnamese coaching', () => {
    // Red Horse at E4 (r=5,c=4) with a Red Pawn blocking north at E5 (r=4,c=4)
    const { board } = core.parseFen('4k4/9/9/9/4P4/4N4/9/9/9/4K4 w - - 0 1');
    const moves = core.generateLegalMoves(board, 'r').filter((m) => m.piece === 'N');
    // Cannot jump to D6 (r=3,c=3) or F6 (r=3,c=5) because leg at E5 is occupied
    expect(moves.some((m) => m.toR === 3 && (m.toC === 3 || m.toC === 5))).toBe(false);
    // Can still jump sideways/downward (6 moves left)
    expect(moves.length).toBe(6);
    expect(core.describeIllegalMove(board, 'r', 5, 4, 3, 5)).toContain('cản chân');
  });

  test('Elephant eye blocking & cannot cross river', () => {
    // Red Elephant at E4 (r=5,c=4) on river bank: cannot cross to r=3; blocked SE at (6,5); Black King on file D
    const { board } = core.parseFen('3k5/9/9/9/9/4B4/5P3/9/9/4K4 w - - 0 1');
    const bMoves = core.generateLegalMoves(board, 'r').filter((m) => m.piece === 'B');
    // Only SW (r=7,c=2) is legal! NW/NE cross river, SE eye blocked by Pawn at (6,5)
    expect(bMoves.length).toBe(1);
    expect(bMoves[0].toR).toBe(7);
    expect(bMoves[0].toC).toBe(2);
    expect(core.describeIllegalMove(board, 'r', 5, 4, 3, 2)).toContain('không được qua sông');
    expect(core.describeIllegalMove(board, 'r', 5, 4, 7, 6)).toContain('cản mắt');
  });

  test('Cannon captures only across exactly 1 screen (ngòi) and cannot jump on quiet move', () => {
    // Red Cannon at A5 (r=4,c=0), screen P at C5 (r=4,c=2), enemy r at F5 (r=4,c=5), enemy n at H5 (r=4,c=7); Black King on file D
    const { board } = core.parseFen('3k5/9/9/9/C1P2r1n1/9/9/9/9/4K4 w - - 0 1');
    const cMoves = core.generateLegalMoves(board, 'r').filter((m) => m.piece === 'C' && m.toR === 4);
    const destCols = cMoves.map((m) => m.toC).toSorted((a, b) => a - b);
    // Quiet to col 1 ONLY (cannot jump to 3 or 4); capture ONLY at col 5 (cannot jump 2 pieces to col 7)
    expect(destCols).toEqual([1, 5]);
  });

  test('Pawn moves forward before river and forward+sideways after crossing river', () => {
    // Red Pawn at E3 (before river) vs Red Pawn at C5 (crossed river)
    const { board } = core.parseFen('4k4/9/9/9/2P6/9/4P4/9/9/4K4 w - - 0 1');
    const beforeMoves = core.generateLegalMoves(board, 'r').filter((m) => m.fromR === 6 && m.fromC === 4);
    const afterMoves = core.generateLegalMoves(board, 'r').filter((m) => m.fromR === 4 && m.fromC === 2);
    expect(beforeMoves.length).toBe(1);
    expect(afterMoves.length).toBe(3); // up, left, right (never back)
  });

  test('Checkmate (Chiếu bí) and Stalemate (Khốn bí = thua trong Cờ Tướng) both declare winner', () => {
    // Classic Red Double-Rook checkmate on Black King at D9 (r=0,c=3)
    const matePos = core.parseFen('3kR4/4R4/9/9/9/9/9/9/9/4K4 b - - 0 1');
    const mateStatus = core.evaluateGameStatus(matePos.board, 'b');
    expect(mateStatus.isOver).toBe(true);
    expect(mateStatus.status).toBe('checkmate');
    expect(mateStatus.winner).toBe('r');

    // Stalemate (Khốn bí): Black King at D9 (r=0,c=3) NOT in check, but E-file blocked by Red King & rank 1 guarded by Red Rook at I8 (r=1,c=8)
    const stalePos = core.parseFen('3k5/8R/9/9/9/9/9/9/9/4K4 b - - 0 1');
    const staleStatus = core.evaluateGameStatus(stalePos.board, 'b');
    expect(staleStatus.inCheck).toBe(false);
    expect(staleStatus.isOver).toBe(true);
    expect(staleStatus.status).toBe('stalemate');
    expect(staleStatus.winner).toBe('r');
  });

  test('Dual Comment Parser handles Grid Coords, Vietnamese Standard Notation, Commands & ignores normal chat', () => {
    const { board } = core.parseFen(core.INITIAL_FEN);
    const moves = core.generateLegalMoves(board, 'r');

    expect(core.parseMoveFromComment('H2 E2', board, 'r', moves)?.move && core.moveToUcci(core.parseMoveFromComment('H2 E2', board, 'r', moves).move)).toBe('h2e2');
    expect(core.moveToUcci(core.parseMoveFromComment('h2-e2', board, 'r', moves).move)).toBe('h2e2');
    expect(core.moveToUcci(core.parseMoveFromComment('P2-5', board, 'r', moves).move)).toBe('h2e2');
    expect(core.moveToUcci(core.parseMoveFromComment('Pháo 2 bình 5', board, 'r', moves).move)).toBe('h2e2');
    expect(core.moveToUcci(core.parseMoveFromComment('M2.3', board, 'r', moves).move)).toBe('h0g2');
    expect(core.moveToUcci(core.parseMoveFromComment('Mã 8 tấn 7', board, 'r', moves).move)).toBe('b0c2');
    expect(core.moveToUcci(core.parseMoveFromComment('B7+1', board, 'r', moves).move)).toBe('c3c4');
    expect(core.parseMoveFromComment('auto', board, 'r', moves)?.command).toBe('auto');
    expect(core.parseMoveFromComment('gợi ý', board, 'r', moves)?.command).toBe('hint');
    expect(core.parseMoveFromComment('đi lại', board, 'r', moves)?.command).toBe('undo');
    expect(core.parseMoveFromComment('Chào thầy, ván cờ hay quá!', board, 'r', moves)).toBeNull();
  });
});

describe('Xiangqi AI Engine (Đại Kiện Tướng)', () => {
  test('AI finds forced Checkmate in 1 immediately', () => {
    // Red Rook at E5 (r=4,c=4) and Red Rook at A8 (r=1,c=0), Black King at D9 (r=0,c=3) -> Ra9# (a8a9) or Rd5->d8
    // Cleaner mate-in-1: Black King at D9 (r=0,c=3), Red King at E0 (r=9,c=4) blocks file E, Red Rook at A5 (r=4,c=0) -> Ra9# (a5a9)
    const { board } = core.parseFen('3k5/9/9/9/R8/9/9/9/9/4K4 w - - 0 1');
    const res = ai.findBestMove(board, 'r', { difficulty: 'club', useBook: false });
    expect(res.move).not.toBeNull();
    // Apply AI move and verify it is checkmate!
    const next = core.cloneBoard(board);
    core.makeMoveInPlace(next, res.move);
    const st = core.evaluateGameStatus(next, 'b');
    expect(st.isOver).toBe(true);
    expect(st.winner).toBe('r');
  });

  test('Opening book hits standard Black response to Red Pháo 2 bình 5', () => {
    const { board } = core.parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b - - 1 1');
    const res = ai.findBestMove(board, 'b', { difficulty: 'club', useBook: true });
    expect(res.fromBook).toBe(true);
    expect(['h9g7', 'b9c7', 'h7e7', 'b7e7']).toContain(core.moveToUcci(res.move));
  });
});

describe('Gift-Gated Match Engine (Chỉ Người Tặng Quà Mới Được Đi)', () => {
  function createTestEngine() {
    const events = [];
    const engine = new XiangqiLiveEngine((method, params) => {
      events.push({ method, params });
    }, { persist: false });
    engine.updateSettings({
      gameMode: 'host_vs_viewers',
      hostSide: 'b',
      hostAutoAi: false, // disable async timer in unit test for deterministic control
      minGiftCoins: 1,
      turnTimeoutSeconds: 30,
      vipPriority: true,
      timeoutAction: 'ai_move',
      mcAutoRead: false
    });
    engine.initNewBoard({ broadcast: false, incrementMatch: false });
    engine.clearQueue();
    engine.resetLeaderboard();
    return { engine, events };
  }

  test('blocks non-donor from moving and allows donor after gift', () => {
    const { engine } = createTestEngine();

    // Non-donor attempts to play P2-5 -> MUST BE BLOCKED!
    const blocked = engine.handleComment({ user: '@FreeUser', uniqueId: 'freeuser', comment: 'P2-5' });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('gift_required');
    expect(engine.history.length).toBe(0);

    // Donor sends 1-coin Hoa hồng -> immediately assigned Active Turn!
    const giftRes = engine.handleGift({ user: '@MinhQuan', uniqueId: 'minhquan', giftName: 'Hoa hồng', coins: 1 });
    expect(giftRes.ok).toBe(true);
    expect(engine.activeTurn?.userKey).toBe('minhquan');

    // Another viewer STILL cannot hijack @MinhQuan's turn!
    const hijack = engine.handleComment({ user: '@OtherUser', uniqueId: 'otheruser', comment: 'P2-5' });
    expect(hijack.ok).toBe(false);
    expect(hijack.reason).toBe('gift_required');

    // Authorized donor @MinhQuan comments P2-5 -> MOVE SUCCEEDS!
    const moved = engine.handleComment({ user: '@MinhQuan', uniqueId: 'minhquan', comment: 'P2-5' });
    expect(moved.ok).toBe(true);
    expect(engine.history.length).toBe(1);
    expect(engine.history[0].notation.full).toBe('Pháo 2 bình 5');
    expect(engine.turn).toBe('b');
    expect(engine.getLeaderboard()[0].user).toBe('@MinhQuan');

    engine.destroy();
  });

  test('VIP Priority sorts high-coin gifts ahead in waiting queue without interrupting active turn', () => {
    const { engine } = createTestEngine();

    // Donor A gets Active Turn with 1 coin
    engine.handleGift({ user: '@DonorA', uniqueId: 'donora', giftName: 'Hoa hồng', coins: 1 });
    expect(engine.activeTurn?.userKey).toBe('donora');

    // Donor B enters queue with 1 coin
    engine.handleGift({ user: '@DonorB', uniqueId: 'donorb', giftName: 'Hoa hồng', coins: 1 });
    // Donor C enters queue with 100 coins (Tay cầm -> 3 tickets, VIP priority!)
    engine.handleGift({ user: '@VipC', uniqueId: 'vipc', giftName: 'Tay cầm chơi game', coins: 100 });

    // Donor A MUST keep activeTurn uninterrupted
    expect(engine.activeTurn?.userKey).toBe('donora');
    // VIP C MUST jump ahead of Donor B in waiting queue!
    expect(engine.moveQueue[0].userKey).toBe('vipc');
    expect(engine.moveQueue.length).toBe(4); // 3 from VipC + 1 from DonorB

    // Donor B tries to move while waiting -> rejected with waiting_in_queue
    const waitReject = engine.handleComment({ user: '@DonorB', uniqueId: 'donorb', comment: 'P2-5' });
    expect(waitReject.ok).toBe(false);
    expect(waitReject.reason).toBe('waiting_in_queue');

    // Paid tickets survive new game reset!
    engine.initNewBoard({ broadcast: false, incrementMatch: true });
    // ActiveTurn returned to front + 4 waiting tickets -> donorA gets activeTurn immediately on new game, 4 left in queue!
    expect(engine.activeTurn?.userKey).toBe('donora');
    expect(engine.moveQueue.length).toBe(4);

    engine.destroy();
  });

  test('Timeout AI assist plays a legal move credited to the donor so stream never stalls', () => {
    const { engine } = createTestEngine();
    engine.handleGift({ user: '@BusyDonor', uniqueId: 'busydonor', giftName: 'Bắn tim', coins: 5 });
    expect(engine.activeTurn?.userKey).toBe('busydonor');

    engine.handleActiveTurnTimeout();
    expect(engine.history.length).toBe(1);
    expect(engine.history[0].actor.type).toBe('viewer_ai_assist');
    expect(engine.history[0].actor.user).toBe('@BusyDonor');
    expect(engine.turn).toBe('b');

    engine.destroy();
  });

  test('Viewers vs Viewers mode lets gifted viewers play both Red and Black turns', () => {
    const { engine } = createTestEngine();
    engine.updateSettings({ gameMode: 'viewers_vs_viewers' });

    engine.handleGift({ user: '@RedViewer', uniqueId: 'redv', giftName: 'Hoa hồng', coins: 1 });
    engine.handleGift({ user: '@BlackViewer', uniqueId: 'blackv', giftName: 'Hoa hồng', coins: 1 });

    expect(engine.activeTurn?.userKey).toBe('redv');
    expect(engine.activeTurn?.side).toBe('r');
    expect(engine.handleComment({ user: '@RedViewer', uniqueId: 'redv', comment: 'P2-5' }).ok).toBe(true);

    // Immediately Black's turn assigned to @BlackViewer!
    expect(engine.turn).toBe('b');
    expect(engine.activeTurn?.userKey).toBe('blackv');
    expect(engine.activeTurn?.side).toBe('b');
    expect(engine.handleComment({ user: '@BlackViewer', uniqueId: 'blackv', comment: 'M8.7' }).ok).toBe(true);
    expect(engine.history.length).toBe(2);
    expect(engine.turn).toBe('r');

    engine.destroy();
  });
});
