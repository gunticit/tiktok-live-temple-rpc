'use strict';

/**
 * Xiangqi AI Engine (Đại Kiện Tướng Cờ Tướng)
 * - Classic Vietnamese/Chinese Xiangqi Opening Book (Pháo Đầu, Bình Phong Mã, Thuận Pháo, Phi Tượng...)
 * - Tuned 9x10 Piece-Square Tables (PST) + Mobility/Positional Bonuses
 * - Zobrist Hashing + Bounded Transposition Table
 * - Iterative Deepening Negamax with Alpha-Beta Pruning, Quiescence Search (MVV-LVA),
 *   Killer Moves, History Heuristic, Check Extension, and Repetition Avoidance
 */

const {
  ROWS,
  COLS,
  getSide,
  oppositeSide,
  cloneBoard,
  boardToFenPlacement,
  isInCheck,
  areGeneralsFacing,
  generatePseudoLegalMoves,
  generateLegalMoves,
  makeMoveInPlace,
  undoMoveInPlace,
  moveToUcci,
  formatMoveVietnamese,
  moveToGridDisplay
} = require('./xiangqi-core.cjs');

const INF = 1000000;
const MATE_SCORE = 90000;

const DIFFICULTY_PRESETS = {
  amateur: {
    id: 'amateur',
    label: 'Nghiệp Dư (~1100 Elo)',
    maxDepth: 2,
    timeBudgetMs: 140,
    noiseCp: 45,
    useBook: false
  },
  club: {
    id: 'club',
    label: 'Kỳ Thủ CLB (~1500 Elo)',
    maxDepth: 3,
    timeBudgetMs: 320,
    noiseCp: 12,
    useBook: true
  },
  master: {
    id: 'master',
    label: 'Kiện Tướng (~1850 Elo)',
    maxDepth: 4,
    timeBudgetMs: 650,
    noiseCp: 0,
    useBook: true
  },
  grandmaster: {
    id: 'grandmaster',
    label: 'Đại Kiện Tướng (~2100+ Elo)',
    maxDepth: 5,
    timeBudgetMs: 1100,
    noiseCp: 0,
    useBook: true
  }
};

// Base material values (centipawns)
const PIECE_VALUE = {
  K: 10000,
  R: 900,
  C: 450,
  N: 400,
  B: 200,
  A: 200,
  P: 100
};

// Piece-Square Tables from RED's perspective (row 0 = Black back rank / top, row 9 = Red back rank / bottom)
// For Black pieces, mirror vertically: row = 9 - r
const PST_RED = {
  K: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 2, 2, 2, 0, 0, 0],
    [0, 0, 0, 11, 15, 11, 0, 0, 0]
  ],
  A: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 20, 0, 20, 0, 0, 0],
    [0, 0, 0, 0, 24, 0, 0, 0, 0],
    [0, 0, 0, 20, 0, 20, 0, 0, 0]
  ],
  B: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 20, 0, 0, 0, 20, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [18, 0, 0, 0, 28, 0, 0, 0, 18],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 20, 0, 0, 0, 20, 0, 0]
  ],
  N: [
    [4, 8, 16, 12, 4, 12, 16, 8, 4],
    [4, 10, 28, 16, 8, 16, 28, 10, 4],
    [12, 14, 16, 20, 18, 20, 16, 14, 12],
    [8, 24, 18, 24, 20, 24, 18, 24, 8],
    [6, 16, 14, 18, 16, 18, 14, 16, 6],
    [4, 12, 16, 14, 12, 14, 16, 12, 4],
    [2, 6, 8, 6, 10, 6, 8, 6, 2],
    [4, 2, 12, 8, 4, 8, 12, 2, 4],
    [0, 2, 4, 4, -2, 4, 4, 2, 0],
    [0, -4, 0, 0, 0, 0, 0, -4, 0]
  ],
  R: [
    [14, 14, 12, 18, 16, 18, 12, 14, 14],
    [16, 20, 18, 24, 26, 24, 18, 20, 16],
    [12, 12, 12, 18, 18, 18, 12, 12, 12],
    [12, 18, 16, 22, 22, 22, 16, 18, 12],
    [12, 14, 12, 18, 18, 18, 12, 14, 12],
    [12, 16, 14, 20, 20, 20, 14, 16, 12],
    [6, 10, 8, 14, 14, 14, 8, 10, 6],
    [4, 8, 6, 14, 12, 14, 6, 8, 4],
    [8, 4, 8, 16, 8, 16, 8, 4, 8],
    [-2, 10, 6, 14, 12, 14, 6, 10, -2]
  ],
  C: [
    [6, 4, 0, -10, -12, -10, 0, 4, 6],
    [2, 2, 0, -4, -14, -4, 0, 2, 2],
    [2, 2, 0, -10, -8, -10, 0, 2, 2],
    [0, 0, -2, 4, 12, 4, -2, 0, 0],
    [0, 0, 0, 2, 8, 2, 0, 0, 0],
    [-2, 0, 4, 2, 6, 2, 4, 0, -2],
    [0, 0, 0, 2, 4, 2, 0, 0, 0],
    [4, 0, 8, 6, 16, 6, 8, 0, 4],
    [0, 2, 4, 6, 6, 6, 4, 2, 0],
    [0, 0, 2, 6, 6, 6, 2, 0, 0]
  ],
  P: [
    [0, 3, 6, 9, 12, 9, 6, 3, 0],
    [18, 36, 56, 80, 115, 80, 56, 36, 18],
    [14, 26, 42, 60, 82, 60, 42, 26, 14],
    [10, 20, 30, 38, 46, 38, 30, 20, 10],
    [6, 12, 18, 20, 24, 20, 18, 12, 6],
    [2, 0, 8, 0, 8, 0, 8, 0, 2],
    [0, 0, -2, 0, 6, 0, -2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]
};

// Classic Vietnamese Xiangqi Opening Book (keyed by `${placement} ${turn}`)
// Moves in UCCI format (e.g. 'h2e2' = Pháo 2 bình 5, 'h9g7' = Mã 8 tấn 7)
const OPENING_BOOK = {
  // Initial position (Red to move): Pháo đầu, Phi Tượng, Tiên Nhân Chỉ Lộ, Khởi Mã
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w': [
    { ucci: 'h2e2', weight: 40, name: 'Trung Pháo (Pháo 2 bình 5)' },
    { ucci: 'b2e2', weight: 25, name: 'Trung Pháo (Pháo 8 bình 5)' },
    { ucci: 'c3c4', weight: 15, name: 'Tiên Nhân Chỉ Lộ (Binh 7 tấn 1)' },
    { ucci: 'g3g4', weight: 10, name: 'Tiên Nhân Chỉ Lộ (Binh 3 tấn 1)' },
    { ucci: 'g0e2', weight: 10, name: 'Phi Tượng Cuộc (Tượng 3 tấn 5)' }
  ],
  // Black response to Red Pháo 2 bình 5 (h2e2): Bình Phong Mã, Thuận Pháo, Nghịch Pháo
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b': [
    { ucci: 'h9g7', weight: 40, name: 'Bình Phong Mã (Mã 8 tấn 7)' },
    { ucci: 'b9c7', weight: 25, name: 'Bình Phong Mã (Mã 2 tấn 3)' },
    { ucci: 'h7e7', weight: 20, name: 'Thuận Pháo (Pháo 8 bình 5)' },
    { ucci: 'b7e7', weight: 15, name: 'Nghịch Pháo (Pháo 2 bình 5)' }
  ],
  // Black response to Red Pháo 8 bình 5 (b2e2)
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/4C2C1/9/RNBAKABNR b': [
    { ucci: 'b9c7', weight: 40, name: 'Bình Phong Mã (Mã 2 tấn 3)' },
    { ucci: 'h9g7', weight: 25, name: 'Bình Phong Mã (Mã 8 tấn 7)' },
    { ucci: 'b7e7', weight: 20, name: 'Thuận Pháo (Pháo 2 bình 5)' },
    { ucci: 'h7e7', weight: 15, name: 'Nghịch Pháo (Pháo 8 bình 5)' }
  ],
  // Red after 1. P2-5 M8.7: Mã 2 tấn 3
  'rnbakab1r/9/1c4nc1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR w': [
    { ucci: 'h0g2', weight: 70, name: 'Mã 2 tấn 3' },
    { ucci: 'b0c2', weight: 30, name: 'Mã 8 tấn 7' }
  ],
  // Black after 1. P2-5 M8.7 2. M2.3: Xe 9 bình 8 or Mã 2 tấn 3 or Tốt 7 tấn 1
  'rnbakab1r/9/1c4nc1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R b': [
    { ucci: 'i9h9', weight: 40, name: 'Xe 9 bình 8' },
    { ucci: 'b9c7', weight: 35, name: 'Mã 2 tấn 3' },
    { ucci: 'g6g5', weight: 25, name: 'Tốt 7 tấn 1' }
  ],
  // Black after Red Tiên Nhân Chỉ Lộ c3c4 (Binh 7 tấn 1)
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/2P6/P3P1P1P/1C5C1/9/RNBAKABNR b': [
    { ucci: 'c6c5', weight: 45, name: 'Đối Binh Cuộc (Tốt 3 tấn 1)' },
    { ucci: 'b7c7', weight: 35, name: 'Tốt Đề Pháo (Pháo 2 bình 3)' },
    { ucci: 'c9e7', weight: 20, name: 'Phi Tượng (Tượng 3 tấn 5)' }
  ],
  // Black after Red Phi Tượng g0e2 (Tượng 3 tấn 5)
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2B2C1/9/RNBAKA1NR b': [
    { ucci: 'b7d7', weight: 45, name: 'Quá Cung Pháo (Pháo 2 bình 4)' },
    { ucci: 'b9c7', weight: 35, name: 'Khởi Mã (Mã 2 tấn 3)' },
    { ucci: 'c6c5', weight: 20, name: 'Tốt 3 tấn 1' }
  ]
};

// ============================================================================
// ZOBRIST HASHING (Deterministic 64-bit BigInt XOR keys)
// ============================================================================
const PIECE_LIST = ['K', 'A', 'B', 'N', 'R', 'C', 'P', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];
const PIECE_IDX = Object.fromEntries(PIECE_LIST.map((p, i) => [p, i]));

function makePrng(seed) {
  let s = BigInt(seed);
  return () => {
    s ^= s << 13n;
    s &= 0xffffffffffffffffn;
    s ^= s >> 7n;
    s ^= s << 17n;
    s &= 0xffffffffffffffffn;
    return s;
  };
}

const rng = makePrng(0x20261124deadbeefn);
const ZOBRIST_PIECE = Array.from({ length: 14 }, () =>
  Array.from({ length: ROWS * COLS }, () => rng())
);
const ZOBRIST_SIDE = rng();

function computeZobristHash(board, side) {
  let h = side === 'b' ? ZOBRIST_SIDE : 0n;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p) {
        h ^= ZOBRIST_PIECE[PIECE_IDX[p]][r * COLS + c];
      }
    }
  }
  return h;
}

// ============================================================================
// STATIC EVALUATION (Returns centipawns from `side`'s perspective)
// ============================================================================
function evaluateBoardRedPerspective(board) {
  let score = 0;
  let totalPieces = 0;
  let redAdvisors = 0;
  let blkAdvisors = 0;
  let redElephants = 0;
  let blkElephants = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      totalPieces++;
      const isRed = p === p.toUpperCase();
      const type = p.toUpperCase();
      const pstRow = isRed ? r : (9 - r);
      let val = PIECE_VALUE[type] + PST_RED[type][pstRow][c];

      // Crossed-river Pawn bonus
      if (type === 'P') {
        const crossed = isRed ? r <= 4 : r >= 5;
        if (crossed) val += 55;
      }

      if (type === 'A') {
        if (isRed) redAdvisors++;
        else blkAdvisors++;
      } else if (type === 'B') {
        if (isRed) redElephants++;
        else blkElephants++;
      }

      score += isRed ? val : -val;
    }
  }

  // Full defense pair bonus (Sĩ-Tượng toàn)
  if (redAdvisors === 2 && redElephants === 2) score += 25;
  if (blkAdvisors === 2 && blkElephants === 2) score -= 25;

  // Game phase adjustment: Cannons slightly stronger early (more screens), Horses slightly stronger late
  const endgameFactor = Math.max(0, 24 - totalPieces);
  if (endgameFactor > 0) {
    let redC = 0, blkC = 0, redN = 0, blkN = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = board[r][c];
        if (p === 'C') redC++;
        else if (p === 'c') blkC++;
        else if (p === 'N') redN++;
        else if (p === 'n') blkN++;
      }
    }
    score += (redN - blkN) * endgameFactor * 3;
    score -= (redC - blkC) * endgameFactor * 2;
  }

  return score;
}

function evaluatePosition(board, side) {
  const redScore = evaluateBoardRedPerspective(board);
  return side === 'r' ? redScore : -redScore;
}

// ============================================================================
// SEARCH ENGINE (Alpha-Beta + Quiescence + Transposition Table + Killer/History)
// ============================================================================
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;
const MAX_TT_ENTRIES = 65536;

class XiangqiAI {
  constructor() {
    this.tt = new Map();
    this.history = new Int32Array(90 * 90);
    this.killers = Array.from({ length: 32 }, () => [null, null]);
    this.nodes = 0;
    this.deadline = Infinity;
    this.aborted = false;
  }

  resetSearchTables() {
    if (this.tt.size > MAX_TT_ENTRIES) {
      this.tt.clear();
    }
    this.history.fill(0);
    for (let i = 0; i < this.killers.length; i++) {
      this.killers[i][0] = null;
      this.killers[i][1] = null;
    }
  }

  moveCode(m) {
    return (m.fromR * 9 + m.fromC) * 90 + (m.toR * 9 + m.toC);
  }

  scoreMoveForOrdering(m, ttMoveCode, ply) {
    const code = this.moveCode(m);
    if (code === ttMoveCode) return 2000000;
    if (m.captured) {
      const victimVal = PIECE_VALUE[m.captured.toUpperCase()] || 100;
      const attackerVal = PIECE_VALUE[m.piece.toUpperCase()] || 100;
      return 1000000 + victimVal * 10 - attackerVal;
    }
    if (ply < 32) {
      if (this.killers[ply][0] === code) return 900000;
      if (this.killers[ply][1] === code) return 850000;
    }
    return this.history[code];
  }

  orderMoves(moves, ttMoveCode, ply) {
    if (moves.length <= 1) return moves;
    const scored = moves.map((m) => ({
      m,
      s: this.scoreMoveForOrdering(m, ttMoveCode, ply)
    }));
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.m);
  }

  quiescence(board, side, alpha, beta, qPly) {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && Date.now() >= this.deadline) {
      this.aborted = true;
      return 0;
    }

    const inCheck = isInCheck(board, side);
    if (!inCheck) {
      const standPat = evaluatePosition(board, side);
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
      if (qPly >= 6) return alpha;
    } else if (qPly >= 8) {
      return evaluatePosition(board, side);
    }

    // If in check during quiescence, search all evasions; otherwise only captures
    const pseudo = generatePseudoLegalMoves(board, side, !inCheck);
    const ordered = this.orderMoves(pseudo, -1, 31);
    const enemy = oppositeSide(side);
    let legalFound = 0;

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const cap = makeMoveInPlace(board, m);
      if (isInCheck(board, side) || areGeneralsFacing(board)) {
        undoMoveInPlace(board, m, cap);
        continue;
      }
      legalFound++;
      const score = -this.quiescence(board, enemy, -beta, -alpha, qPly + 1);
      undoMoveInPlace(board, m, cap);

      if (this.aborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    if (inCheck && legalFound === 0) {
      return -MATE_SCORE + 20 + qPly;
    }
    return alpha;
  }

  negamax(board, side, depth, alpha, beta, ply, hash, seenPositions) {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && Date.now() >= this.deadline) {
      this.aborted = true;
      return 0;
    }

    // Avoid repetition loops in search
    if (ply > 0 && seenPositions && seenPositions.has(hash)) {
      return -25; // Slight contempt against repeating moves
    }

    const origAlpha = alpha;
    const ttEntry = this.tt.get(hash);
    let ttMoveCode = -1;

    if (ttEntry && ttEntry.depth >= depth && ply > 0) {
      if (ttEntry.flag === TT_EXACT) return ttEntry.score;
      if (ttEntry.flag === TT_LOWER) alpha = Math.max(alpha, ttEntry.score);
      else if (ttEntry.flag === TT_UPPER) beta = Math.min(beta, ttEntry.score);
      if (alpha >= beta) return ttEntry.score;
    }
    if (ttEntry) {
      ttMoveCode = ttEntry.bestMoveCode;
    }

    const inCheck = isInCheck(board, side);
    // Check extension (up to reasonable ply)
    let searchDepth = depth;
    if (inCheck && ply < 10) {
      searchDepth += 1;
    }

    if (searchDepth <= 0) {
      return this.quiescence(board, side, alpha, beta, 0);
    }

    const pseudo = generatePseudoLegalMoves(board, side, false);
    const ordered = this.orderMoves(pseudo, ttMoveCode, ply);
    const enemy = oppositeSide(side);

    let bestScore = -INF;
    let bestMoveCode = -1;
    let legalCount = 0;

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const movedPiece = board[m.fromR][m.fromC];
      const cap = makeMoveInPlace(board, m);
      if (isInCheck(board, side) || areGeneralsFacing(board)) {
        undoMoveInPlace(board, m, cap);
        continue;
      }
      legalCount++;

      // Incremental Zobrist update
      let nextHash = hash ^ ZOBRIST_SIDE;
      nextHash ^= ZOBRIST_PIECE[PIECE_IDX[movedPiece]][m.fromR * COLS + m.fromC];
      nextHash ^= ZOBRIST_PIECE[PIECE_IDX[movedPiece]][m.toR * COLS + m.toC];
      if (cap) {
        nextHash ^= ZOBRIST_PIECE[PIECE_IDX[cap]][m.toR * COLS + m.toC];
      }

      const score = -this.negamax(board, enemy, searchDepth - 1, -beta, -alpha, ply + 1, nextHash, seenPositions);
      undoMoveInPlace(board, m, cap);

      if (this.aborted) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMoveCode = this.moveCode(m);
      }
      if (score > alpha) {
        alpha = score;
      }
      if (alpha >= beta) {
        // Store killer & history for quiet moves
        if (!m.captured && ply < 32) {
          const code = this.moveCode(m);
          if (this.killers[ply][0] !== code) {
            this.killers[ply][1] = this.killers[ply][0];
            this.killers[ply][0] = code;
          }
          this.history[code] += searchDepth * searchDepth;
        }
        break;
      }
    }

    // In Xiangqi, BOTH Checkmate and Stalemate (Khốn bí) are a LOSS for the side to move!
    if (legalCount === 0) {
      return -MATE_SCORE + ply;
    }

    let flag = TT_EXACT;
    if (bestScore <= origAlpha) flag = TT_UPPER;
    else if (bestScore >= beta) flag = TT_LOWER;

    if (this.tt.size >= MAX_TT_ENTRIES) {
      const firstKey = this.tt.keys().next().value;
      if (firstKey !== undefined) this.tt.delete(firstKey);
    }
    this.tt.set(hash, { depth: searchDepth, score: bestScore, flag, bestMoveCode });

    return bestScore;
  }

  pickOpeningBookMove(board, side, legalMoves) {
    const key = `${boardToFenPlacement(board)} ${side === 'b' ? 'b' : 'w'}`;
    const entries = OPENING_BOOK[key];
    if (!entries || entries.length === 0) return null;

    const validEntries = [];
    let totalWeight = 0;
    for (const entry of entries) {
      const found = legalMoves.find((m) => moveToUcci(m) === entry.ucci);
      if (found) {
        validEntries.push({ ...entry, move: found });
        totalWeight += entry.weight;
      }
    }
    if (validEntries.length === 0) return null;

    let r = Math.random() * totalWeight;
    for (const entry of validEntries) {
      r -= entry.weight;
      if (r <= 0) return entry;
    }
    return validEntries[0];
  }

  /**
   * Search the best move(s) for `side` on `inputBoard`.
   */
  search(inputBoard, side, options = {}) {
    const startTs = Date.now();
    const preset = DIFFICULTY_PRESETS[options.difficulty] || DIFFICULTY_PRESETS.club;
    const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : preset.maxDepth;
    const timeBudgetMs = Number.isFinite(options.timeBudgetMs) ? options.timeBudgetMs : preset.timeBudgetMs;
    const noiseCp = options.noiseCp !== undefined ? options.noiseCp : preset.noiseCp;
    const useBook = options.useBook !== undefined ? options.useBook : preset.useBook;
    const topK = Math.max(1, Math.min(5, options.topK || 1));

    const board = cloneBoard(inputBoard);
    const legalMoves = generateLegalMoves(board, side);
    if (legalMoves.length === 0) {
      return {
        move: null,
        topMoves: [],
        scoreCp: -MATE_SCORE,
        evalRedCp: side === 'r' ? -MATE_SCORE : MATE_SCORE,
        depth: 0,
        nodes: 0,
        fromBook: false,
        bookName: null,
        elapsedMs: Date.now() - startTs
      };
    }

    // Check Opening Book when topK === 1 and book enabled
    if (useBook && topK === 1) {
      const bookEntry = this.pickOpeningBookMove(board, side, legalMoves);
      if (bookEntry) {
        const redEval = evaluateBoardRedPerspective(board);
        return {
          move: bookEntry.move,
          topMoves: [{
            move: bookEntry.move,
            scoreCp: side === 'r' ? redEval : -redEval,
            notation: formatMoveVietnamese(board, bookEntry.move),
            grid: moveToGridDisplay(bookEntry.move)
          }],
          scoreCp: side === 'r' ? redEval : -redEval,
          evalRedCp: redEval,
          depth: 0,
          nodes: 1,
          fromBook: true,
          bookName: bookEntry.name,
          elapsedMs: Date.now() - startTs
        };
      }
    }

    this.resetSearchTables();
    this.nodes = 0;
    this.aborted = false;
    this.deadline = startTs + timeBudgetMs;

    const rootHash = computeZobristHash(board, side);
    const seenPositions = options.seenHashes instanceof Set ? options.seenHashes : null;
    const enemy = oppositeSide(side);

    // Track scores for each root move across iterative deepening
    let rootScored = legalMoves.map((m) => ({ move: m, score: -INF }));
    let completedDepth = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      this.aborted = false;
      const iterResults = [];
      let alpha = -INF;
      const beta = INF;

      // Sort by previous iteration scores (except depth 1: MVV-LVA captures first)
      if (depth === 1) {
        rootScored = this.orderMoves(legalMoves, -1, 0).map((m) => ({ move: m, score: -INF }));
      } else {
        rootScored.sort((a, b) => b.score - a.score);
      }

      for (let i = 0; i < rootScored.length; i++) {
        const m = rootScored[i].move;
        const movedPiece = board[m.fromR][m.fromC];
        const cap = makeMoveInPlace(board, m);

        let nextHash = rootHash ^ ZOBRIST_SIDE;
        nextHash ^= ZOBRIST_PIECE[PIECE_IDX[movedPiece]][m.fromR * COLS + m.fromC];
        nextHash ^= ZOBRIST_PIECE[PIECE_IDX[movedPiece]][m.toR * COLS + m.toC];
        if (cap) {
          nextHash ^= ZOBRIST_PIECE[PIECE_IDX[cap]][m.toR * COLS + m.toC];
        }

        // For topK > 1, use a wider window so runner-up moves get accurate scores too
        const searchAlpha = topK > 1 ? -INF : alpha;
        const score = -this.negamax(board, enemy, depth - 1, -beta, -searchAlpha, 1, nextHash, seenPositions);
        undoMoveInPlace(board, m, cap);

        if (this.aborted) break;

        iterResults.push({ move: m, score });
        if (score > alpha) alpha = score;
      }

      if (!this.aborted && iterResults.length === rootScored.length) {
        iterResults.sort((a, b) => b.score - a.score);
        rootScored = iterResults;
        completedDepth = depth;
        // Stop early if forced mate found
        if (Math.abs(rootScored[0].score) > MATE_SCORE - 100) {
          break;
        }
      } else {
        break;
      }

      // If more than 55% of time budget spent, next iteration likely won't finish
      if (Date.now() - startTs > timeBudgetMs * 0.55) {
        break;
      }
    }

    // Apply controlled difficulty noise for amateur/club levels (never blunder mate!)
    let chosen = rootScored[0];
    if (noiseCp > 0 && rootScored.length > 1 && Math.abs(rootScored[0].score) < MATE_SCORE - 500) {
      const topScore = rootScored[0].score;
      const candidates = rootScored.filter((r) => topScore - r.score <= noiseCp);
      if (candidates.length > 1) {
        chosen = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    const topMoves = rootScored.slice(0, topK).map((entry) => ({
      move: entry.move,
      scoreCp: entry.score,
      notation: formatMoveVietnamese(inputBoard, entry.move),
      grid: moveToGridDisplay(entry.move)
    }));

    const evalRedCp = side === 'r' ? chosen.score : -chosen.score;

    return {
      move: chosen.move,
      topMoves,
      scoreCp: chosen.score,
      evalRedCp,
      depth: completedDepth,
      nodes: this.nodes,
      fromBook: false,
      bookName: null,
      elapsedMs: Date.now() - startTs
    };
  }
}

const sharedAi = new XiangqiAI();

function findBestMove(board, side, options = {}) {
  return sharedAi.search(board, side, options);
}

function getTopMoves(board, side, count = 3, options = {}) {
  const res = sharedAi.search(board, side, {
    difficulty: options.difficulty || 'club',
    timeBudgetMs: options.timeBudgetMs || 380,
    maxDepth: options.maxDepth || 3,
    noiseCp: 0,
    useBook: false,
    topK: count
  });
  return res.topMoves;
}

module.exports = {
  DIFFICULTY_PRESETS,
  MATE_SCORE,
  XiangqiAI,
  computeZobristHash,
  evaluateBoardRedPerspective,
  evaluatePosition,
  findBestMove,
  getTopMoves
};
