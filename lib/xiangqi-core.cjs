'use strict';

/**
 * Xiangqi Core Engine (Cờ Tướng 9x10 chuẩn luật Việt Nam / Quốc Tế)
 * - Full legal move generation (Flying General, Horse leg, Elephant eye, Cannon screen, River Pawn)
 * - Checkmate & Stalemate (Khốn bí = thua trong Cờ Tướng) + Draw detection (60-move / 3-fold / insufficient)
 * - Dual notation support:
 *   1) Grid Coordinates (UCCI): A0..I9 (e.g. "H2 E2", "h2e2", "h2-e2")
 *   2) Vietnamese Standard Xiangqi Notation: "P2-5", "Pháo 2 bình 5", "M2.3", "Mã 2 tấn 3", "B7+1", "X1/2"
 */

const ROWS = 10;
const COLS = 9;

const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const FILE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const PIECE_META = {
  K: { type: 'K', side: 'r', han: '帥', vi: 'Tướng', short: 'Tg', value: 10000 },
  A: { type: 'A', side: 'r', han: '仕', vi: 'Sĩ', short: 'S', value: 200 },
  B: { type: 'B', side: 'r', han: '相', vi: 'Tượng', short: 'T', value: 200 },
  N: { type: 'N', side: 'r', han: '傌', vi: 'Mã', short: 'M', value: 400 },
  R: { type: 'R', side: 'r', han: '俥', vi: 'Xe', short: 'X', value: 900 },
  C: { type: 'C', side: 'r', han: '炮', vi: 'Pháo', short: 'P', value: 450 },
  P: { type: 'P', side: 'r', han: '兵', vi: 'Tốt', short: 'B', value: 100 },

  k: { type: 'K', side: 'b', han: '將', vi: 'Tướng', short: 'Tg', value: 10000 },
  a: { type: 'A', side: 'b', han: '士', vi: 'Sĩ', short: 'S', value: 200 },
  b: { type: 'B', side: 'b', han: '象', vi: 'Tượng', short: 'T', value: 200 },
  n: { type: 'N', side: 'b', han: '馬', vi: 'Mã', short: 'M', value: 400 },
  r: { type: 'R', side: 'b', han: '車', vi: 'Xe', short: 'X', value: 900 },
  c: { type: 'C', side: 'b', han: '砲', vi: 'Pháo', short: 'P', value: 450 },
  p: { type: 'P', side: 'b', han: '卒', vi: 'Tốt', short: 'B', value: 100 }
};

function getSide(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'r' : 'b';
}

function oppositeSide(side) {
  return side === 'r' ? 'b' : 'r';
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function inPalace(r, c, side) {
  if (c < 3 || c > 5) return false;
  return side === 'r' ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
}

function cloneBoard(board) {
  const next = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    next[r] = board[r].slice();
  }
  return next;
}

function parseFen(fen = INITIAL_FEN) {
  const parts = String(fen || INITIAL_FEN).trim().split(/\s+/);
  const rowsStr = (parts[0] || '').split('/');
  if (rowsStr.length !== ROWS) {
    throw new Error(`FEN Cờ Tướng không hợp lệ (cần 10 hàng): ${fen}`);
  }
  const board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    for (const ch of rowsStr[r]) {
      if (ch >= '1' && ch <= '9') {
        c += Number(ch);
      } else if (PIECE_META[ch]) {
        if (c < COLS) board[r][c] = ch;
        c++;
      }
    }
    if (c !== COLS) {
      throw new Error(`FEN hàng ${r} không đủ 9 cột: ${rowsStr[r]}`);
    }
  }
  const turnToken = (parts[1] || 'w').toLowerCase();
  const turn = (turnToken === 'b' || turnToken === 'black') ? 'b' : 'r';
  const halfMoveClock = Number.isFinite(Number(parts[4])) ? Math.max(0, Number(parts[4])) : 0;
  const fullMoveNumber = Number.isFinite(Number(parts[5])) ? Math.max(1, Number(parts[5])) : 1;
  return { board, turn, halfMoveClock, fullMoveNumber };
}

function boardToFenPlacement(board) {
  const lines = [];
  for (let r = 0; r < ROWS; r++) {
    let empty = 0;
    let line = '';
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          line += String(empty);
          empty = 0;
        }
        line += p;
      }
    }
    if (empty > 0) line += String(empty);
    lines.push(line);
  }
  return lines.join('/');
}

function toFen(board, turn = 'r', halfMoveClock = 0, fullMoveNumber = 1) {
  const t = turn === 'b' ? 'b' : 'w';
  return `${boardToFenPlacement(board)} ${t} - - ${halfMoveClock} ${fullMoveNumber}`;
}

function positionKey(board, turn) {
  return `${boardToFenPlacement(board)} ${turn === 'b' ? 'b' : 'w'}`;
}

function coordToSquare(r, c) {
  if (!inBounds(r, c)) return '';
  return `${FILE_LETTERS[c]}${9 - r}`;
}

function squareToCoord(sq) {
  const clean = String(sq || '').trim().toUpperCase();
  if (!/^[A-I][0-9]$/.test(clean)) return null;
  const c = clean.charCodeAt(0) - 65;
  const rank = Number(clean[1]);
  const r = 9 - rank;
  return inBounds(r, c) ? { r, c } : null;
}

function moveToUcci(move) {
  return `${coordToSquare(move.fromR, move.fromC)}${coordToSquare(move.toR, move.toC)}`.toLowerCase();
}

function moveToGridDisplay(move) {
  return `${coordToSquare(move.fromR, move.fromC)}→${coordToSquare(move.toR, move.toC)}`;
}

function findGeneral(board, side) {
  const target = side === 'r' ? 'K' : 'k';
  const rStart = side === 'r' ? 7 : 0;
  const rEnd = side === 'r' ? 9 : 2;
  for (let r = rStart; r <= rEnd; r++) {
    for (let c = 3; c <= 5; c++) {
      if (board[r][c] === target) return { r, c };
    }
  }
  // Fallback full scan (for custom puzzle positions)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === target) return { r, c };
    }
  }
  return null;
}

/**
 * Check if Red and Black Generals face each other directly on the same file with no pieces between.
 */
function areGeneralsFacing(board) {
  const redK = findGeneral(board, 'r');
  const blkK = findGeneral(board, 'b');
  if (!redK || !blkK || redK.c !== blkK.c) return false;
  const minR = Math.min(redK.r, blkK.r);
  const maxR = Math.max(redK.r, blkK.r);
  for (let r = minR + 1; r < maxR; r++) {
    if (board[r][redK.c] !== null) return false;
  }
  return true;
}

/**
 * Fast O(1) ray/pattern check detection for `side`'s General.
 * Also treats facing Generals (Lộ mặt Tướng) as illegal check state.
 */
function isInCheck(board, side) {
  const king = findGeneral(board, side);
  if (!king) return true;
  const enemy = oppositeSide(side);
  const kr = king.r;
  const kc = king.c;

  const enemyR = enemy === 'r' ? 'R' : 'r';
  const enemyC = enemy === 'r' ? 'C' : 'c';
  const enemyN = enemy === 'r' ? 'N' : 'n';
  const enemyP = enemy === 'r' ? 'P' : 'p';
  const enemyK = enemy === 'r' ? 'K' : 'k';

  // 1. Orthogonal rays: Rook, Cannon, and Flying General
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let d = 0; d < 4; d++) {
    const dr = dirs[d][0];
    const dc = dirs[d][1];
    let r = kr + dr;
    let c = kc + dc;
    let screens = 0;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const p = board[r][c];
      if (p !== null) {
        if (screens === 0) {
          if (p === enemyR || p === enemyK) return true;
          screens = 1;
        } else {
          if (p === enemyC) return true;
          break;
        }
      }
      r += dr;
      c += dc;
    }
  }

  // 2. Enemy Horse (reverse check: diagonal adjacent point from king is the horse's leg!)
  const knightChecks = [
    [-2, -1, -1, -1], [-2, 1, -1, 1],
    [2, -1, 1, -1],   [2, 1, 1, 1],
    [-1, -2, -1, -1], [1, -2, 1, -1],
    [-1, 2, -1, 1],   [1, 2, 1, 1]
  ];
  for (let i = 0; i < 8; i++) {
    const nr = kr + knightChecks[i][0];
    const nc = kc + knightChecks[i][1];
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === enemyN) {
      const lr = kr + knightChecks[i][2];
      const lc = kc + knightChecks[i][3];
      if (board[lr][lc] === null) return true;
    }
  }

  // 3. Enemy Pawn (forward from enemy perspective, or sideways if enemy pawn crossed river)
  // If we are Red (bottom), Black pawns come downward (+1), so an enemy Black pawn at (kr - 1, kc) attacks us.
  const pawnFromDr = side === 'r' ? -1 : 1;
  if (inBounds(kr + pawnFromDr, kc) && board[kr + pawnFromDr][kc] === enemyP) {
    return true;
  }
  // Sideways pawn attack (if pawn is on our side of river, which is always true inside our palace)
  if (inBounds(kr, kc - 1) && board[kr][kc - 1] === enemyP) return true;
  if (inBounds(kr, kc + 1) && board[kr][kc + 1] === enemyP) return true;

  return false;
}

/**
 * Generate pseudo-legal moves for `side`. If `capturesOnly` is true, emit captures only (for quiescence).
 */
function generatePseudoLegalMoves(board, side, capturesOnly = false) {
  const moves = [];
  const enemy = oppositeSide(side);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (!piece || getSide(piece) !== side) continue;
      const type = piece.toUpperCase();

      if (type === 'K') {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let i = 0; i < 4; i++) {
          const nr = r + dirs[i][0];
          const nc = c + dirs[i][1];
          if (!inPalace(nr, nc, side)) continue;
          const target = board[nr][nc];
          if (target && getSide(target) === side) continue;
          if (capturesOnly && !target) continue;
          moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: target });
        }
      } else if (type === 'A') {
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (let i = 0; i < 4; i++) {
          const nr = r + dirs[i][0];
          const nc = c + dirs[i][1];
          if (!inPalace(nr, nc, side)) continue;
          const target = board[nr][nc];
          if (target && getSide(target) === side) continue;
          if (capturesOnly && !target) continue;
          moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: target });
        }
      } else if (type === 'B') {
        const dirs = [[-2, -2, -1, -1], [-2, 2, -1, 1], [2, -2, 1, -1], [2, 2, 1, 1]];
        for (let i = 0; i < 4; i++) {
          const nr = r + dirs[i][0];
          const nc = c + dirs[i][1];
          if (!inBounds(nr, nc)) continue;
          // Elephant cannot cross river
          if (side === 'r' && nr < 5) continue;
          if (side === 'b' && nr > 4) continue;
          // Eye must be empty
          if (board[r + dirs[i][2]][c + dirs[i][3]] !== null) continue;
          const target = board[nr][nc];
          if (target && getSide(target) === side) continue;
          if (capturesOnly && !target) continue;
          moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: target });
        }
      } else if (type === 'N') {
        const steps = [
          [-2, -1, -1, 0], [-2, 1, -1, 0],
          [2, -1, 1, 0],   [2, 1, 1, 0],
          [-1, -2, 0, -1], [1, -2, 0, -1],
          [-1, 2, 0, 1],   [1, 2, 0, 1]
        ];
        for (let i = 0; i < 8; i++) {
          const nr = r + steps[i][0];
          const nc = c + steps[i][1];
          if (!inBounds(nr, nc)) continue;
          // Horse leg must be empty
          if (board[r + steps[i][2]][c + steps[i][3]] !== null) continue;
          const target = board[nr][nc];
          if (target && getSide(target) === side) continue;
          if (capturesOnly && !target) continue;
          moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: target });
        }
      } else if (type === 'R') {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let d = 0; d < 4; d++) {
          const dr = dirs[d][0];
          const dc = dirs[d][1];
          let nr = r + dr;
          let nc = c + dc;
          while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            const target = board[nr][nc];
            if (!target) {
              if (!capturesOnly) {
                moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: null });
              }
            } else {
              if (getSide(target) === enemy) {
                moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: target });
              }
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
      } else if (type === 'C') {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let d = 0; d < 4; d++) {
          const dr = dirs[d][0];
          const dc = dirs[d][1];
          let nr = r + dr;
          let nc = c + dc;
          let jumped = false;
          while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            const target = board[nr][nc];
            if (!jumped) {
              if (!target) {
                if (!capturesOnly) {
                  moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: null });
                }
              } else {
                jumped = true;
              }
            } else if (target) {
              if (getSide(target) === enemy) {
                moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: target });
              }
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
      } else if (type === 'P') {
        const forward = side === 'r' ? -1 : 1;
        const crossedRiver = side === 'r' ? (r <= 4) : (r >= 5);
        const candidates = [[r + forward, c]];
        if (crossedRiver) {
          candidates.push([r, c - 1], [r, c + 1]);
        }
        for (let i = 0; i < candidates.length; i++) {
          const nr = candidates[i][0];
          const nc = candidates[i][1];
          if (!inBounds(nr, nc)) continue;
          const target = board[nr][nc];
          if (target && getSide(target) === side) continue;
          if (capturesOnly && !target) continue;
          moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece, captured: target });
        }
      }
    }
  }
  return moves;
}

function makeMoveInPlace(board, move) {
  const captured = board[move.toR][move.toC];
  board[move.toR][move.toC] = board[move.fromR][move.fromC];
  board[move.fromR][move.fromC] = null;
  return captured;
}

function undoMoveInPlace(board, move, captured) {
  board[move.fromR][move.fromC] = board[move.toR][move.toC];
  board[move.toR][move.toC] = captured;
}

function generateLegalMoves(board, side, capturesOnly = false) {
  const pseudo = generatePseudoLegalMoves(board, side, capturesOnly);
  const legal = [];
  for (let i = 0; i < pseudo.length; i++) {
    const m = pseudo[i];
    const cap = makeMoveInPlace(board, m);
    const illegal = isInCheck(board, side) || areGeneralsFacing(board);
    undoMoveInPlace(board, m, cap);
    if (!illegal) {
      legal.push(m);
    }
  }
  return legal;
}

function hasInsufficientMaterial(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      const t = p.toUpperCase();
      if (t === 'R' || t === 'N' || t === 'C' || t === 'P') {
        return false;
      }
    }
  }
  return true;
}

function evaluateGameStatus(board, turn, halfMoveClock = 0, positionCounts = null) {
  const legalMoves = generateLegalMoves(board, turn);
  const inCheck = isInCheck(board, turn);

  if (legalMoves.length === 0) {
    const winner = oppositeSide(turn);
    return {
      status: inCheck ? 'checkmate' : 'stalemate',
      isOver: true,
      winner,
      inCheck,
      legalCount: 0,
      reason: inCheck
        ? (winner === 'r' ? 'Chiếu bí! Phe ĐỎ giành chiến thắng!' : 'Chiếu bí! Phe ĐEN giành chiến thắng!')
        : (winner === 'r' ? 'Khốn bí (hết nước đi)! Phe ĐỎ giành chiến thắng!' : 'Khốn bí (hết nước đi)! Phe ĐEN giành chiến thắng!')
    };
  }

  if (hasInsufficientMaterial(board)) {
    return {
      status: 'draw_insufficient',
      isOver: true,
      winner: 'draw',
      inCheck,
      legalCount: legalMoves.length,
      reason: 'Hòa cờ! Hai bên không còn đủ quân tấn công chiếu bí.'
    };
  }

  if (halfMoveClock >= 120) {
    return {
      status: 'draw_60_moves',
      isOver: true,
      winner: 'draw',
      inCheck,
      legalCount: legalMoves.length,
      reason: 'Hòa cờ theo luật 60 nước không ăn quân!'
    };
  }

  if (positionCounts) {
    const key = positionKey(board, turn);
    const count = positionCounts.get(key) || 0;
    if (count >= 3) {
      return {
        status: 'draw_repetition',
        isOver: true,
        winner: 'draw',
        inCheck,
        legalCount: legalMoves.length,
        reason: 'Hòa cờ do lặp lại thế cờ 3 lần liên tiếp!'
      };
    }
  }

  return {
    status: inCheck ? 'check' : 'playing',
    isOver: false,
    winner: null,
    inCheck,
    legalCount: legalMoves.length,
    reason: inCheck ? 'Chiếu tướng!' : ''
  };
}

// ============================================================================
// VIETNAMESE XIANGQI NOTATION FORMATTER & PARSER
// ============================================================================

function getXiangqiFileNumber(c, side) {
  // Red counts 1..9 right-to-left (c=8 -> 1, c=0 -> 9)
  // Black counts 1..9 left-to-right (c=0 -> 1, c=8 -> 9)
  return side === 'r' ? (9 - c) : (c + 1);
}

/**
 * Formats a move into canonical Vietnamese Xiangqi notation (e.g. "Pháo 2 bình 5", "Mã 2 tấn 3", "Xe trước tấn 1").
 * Must be called BEFORE the move is applied to `board`.
 */
function formatMoveVietnamese(board, move) {
  const piece = move.piece || board[move.fromR][move.fromC];
  if (!piece) return moveToGridDisplay(move);
  const meta = PIECE_META[piece];
  const side = meta.side;
  const type = meta.type;

  const fromFile = getXiangqiFileNumber(move.fromC, side);
  const toFile = getXiangqiFileNumber(move.toC, side);

  // Check if another identical piece of the same side shares the same column (for Tiền/Hậu disambiguation)
  const sameColRows = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r][move.fromC] === piece) {
      sameColRows.push(r);
    }
  }

  let pieceLabel = `${meta.vi} ${fromFile}`;
  let shortPrefix = `${meta.short}${fromFile}`;
  if (sameColRows.length >= 2 && type !== 'A' && type !== 'B') {
    // For Red, smaller `r` is closer to enemy (trước / tiền); for Black, larger `r` is closer to enemy
    sameColRows.sort((a, b) => (side === 'r' ? a - b : b - a));
    const idx = sameColRows.indexOf(move.fromR);
    if (sameColRows.length === 2) {
      const posWord = idx === 0 ? 'trước' : 'sau';
      const posShort = idx === 0 ? 't' : 's';
      pieceLabel = `${meta.vi} ${posWord}`;
      shortPrefix = `${meta.short}${posShort}`;
    } else {
      pieceLabel = `${meta.vi} ${idx + 1}`;
      shortPrefix = `${meta.short}${idx + 1}`;
    }
  }

  const dr = move.toR - move.fromR;
  const isForward = side === 'r' ? dr < 0 : dr > 0;
  const isBackward = side === 'r' ? dr > 0 : dr < 0;

  let actionWord = 'bình';
  let actionSym = '-';
  let destVal = toFile;

  if (dr === 0) {
    actionWord = 'bình';
    actionSym = '-';
    destVal = toFile;
  } else if (isForward) {
    actionWord = 'tấn';
    actionSym = '.';
    // Straight movers (R, C, P, K) specify step count; diagonal/L movers (N, B, A) specify destination file
    destVal = (type === 'N' || type === 'B' || type === 'A') ? toFile : Math.abs(dr);
  } else if (isBackward) {
    actionWord = 'thoái';
    actionSym = '/';
    destVal = (type === 'N' || type === 'B' || type === 'A') ? toFile : Math.abs(dr);
  }

  return {
    full: `${pieceLabel} ${actionWord} ${destVal}`,
    short: `${shortPrefix}${actionSym}${destVal}`,
    grid: moveToGridDisplay(move),
    ucci: moveToUcci(move)
  };
}

/**
 * Explains specifically WHY an attempted move (fromR, fromC) -> (toR, toC) is illegal in Vietnamese.
 */
function describeIllegalMove(board, side, fromR, fromC, toR, toC) {
  if (!inBounds(fromR, fromC) || !inBounds(toR, toC)) {
    return 'Tọa độ nằm ngoài bàn cờ (cột A–I, hàng 0–9).';
  }
  const piece = board[fromR][fromC];
  const fromSq = coordToSquare(fromR, fromC);
  const toSq = coordToSquare(toR, toC);
  if (!piece) {
    return `Ô ${fromSq} không có quân cờ nào.`;
  }
  if (getSide(piece) !== side) {
    return `Quân tại ${fromSq} là của đối phương, không phải quân của bạn.`;
  }
  if (fromR === toR && fromC === toC) {
    return `Điểm đến trùng điểm xuất phát (${fromSq}).`;
  }
  const target = board[toR][toC];
  if (target && getSide(target) === side) {
    return `Ô ${toSq} đang có quân cùng phe.`;
  }

  const type = piece.toUpperCase();
  const dr = toR - fromR;
  const dc = toC - fromC;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  if (type === 'N' && ((adr === 2 && adc === 1) || (adr === 1 && adc === 2))) {
    const legR = fromR + (adr === 2 ? Math.sign(dr) : 0);
    const legC = fromC + (adc === 2 ? Math.sign(dc) : 0);
    if (board[legR][legC] !== null) {
      return `Nước ${fromSq}→${toSq} không hợp lệ: Mã bị cản chân tại ${coordToSquare(legR, legC)}!`;
    }
  }
  if (type === 'B' && adr === 2 && adc === 2) {
    if ((side === 'r' && toR < 5) || (side === 'b' && toR > 4)) {
      return `Nước ${fromSq}→${toSq} không hợp lệ: Tượng không được qua sông!`;
    }
    const eyeR = fromR + dr / 2;
    const eyeC = fromC + dc / 2;
    if (board[eyeR][eyeC] !== null) {
      return `Nước ${fromSq}→${toSq} không hợp lệ: Tượng bị cản mắt tại ${coordToSquare(eyeR, eyeC)}!`;
    }
  }
  if (type === 'C' && (dr === 0 || dc === 0)) {
    let between = 0;
    const stepR = Math.sign(dr);
    const stepC = Math.sign(dc);
    let r = fromR + stepR;
    let c = fromC + stepC;
    while (r !== toR || c !== toC) {
      if (board[r][c] !== null) between++;
      r += stepR;
      c += stepC;
    }
    if (target && between !== 1) {
      return `Nước ${fromSq}→${toSq} không hợp lệ: Pháo ăn quân phải nhảy qua đúng 1 ngòi!`;
    }
    if (!target && between > 0) {
      return `Nước ${fromSq}→${toSq} không hợp lệ: Pháo đi thường không được nhảy qua quân cản!`;
    }
  }

  // Check if pseudo-legal but fails check / flying general
  const pseudo = generatePseudoLegalMoves(board, side, false);
  const isPseudo = pseudo.some((m) => m.fromR === fromR && m.fromC === fromC && m.toR === toR && m.toC === toC);
  if (isPseudo) {
    const tmp = cloneBoard(board);
    tmp[toR][toC] = tmp[fromR][fromC];
    tmp[fromR][fromC] = null;
    if (areGeneralsFacing(tmp)) {
      return `Nước ${fromSq}→${toSq} phạm luật Lộ Mặt Tướng!`;
    }
    if (isInCheck(board, side)) {
      return `Đang bị CHIẾU TƯỚNG! Nước ${fromSq}→${toSq} chưa hóa giải được chiếu.`;
    }
    return `Nước ${fromSq}→${toSq} khiến Tướng bị chiếu!`;
  }

  return `Nước ${fromSq}→${toSq} không đúng luật đi của quân ${PIECE_META[piece].vi}.`;
}

function stripVietnameseDiacritics(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Parse a TikTok viewer comment into either:
 * - { type: 'command', command: 'auto' | 'hint' | 'undo' }
 * - { type: 'move', move, raw }
 * - { type: 'illegal', reason, raw }
 * - null (normal chat message, not a move attempt)
 */
function parseMoveFromComment(commentText, board, side, legalMoves = null) {
  const raw = String(commentText || '').trim();
  if (!raw) return null;

  const cleanNoAccent = stripVietnameseDiacritics(raw).toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. Special Commands from Active Mover
  if (/^(auto|ai|may di|may danh|danh ho|di ho|tu di|bot di|tu dong)(\s+di|\s+nhe|\s+a|\s+oi)?[!?.❤️🔥👍]*$/i.test(cleanNoAccent)) {
    return { type: 'command', command: 'auto', raw };
  }
  if (/^(hint|goi y|goiy|tu van|mach nuoc|chi nuoc)(\s+di|\s+nhe|\s+a|\s+voi)?[!?.❤️🔥👍]*$/i.test(cleanNoAccent)) {
    return { type: 'command', command: 'hint', raw };
  }
  if (/^(undo|di lai|hoan|xin di lai|quay lai)(\s+di|\s+nhe|\s+a)?[!?.❤️🔥👍]*$/i.test(cleanNoAccent)) {
    return { type: 'command', command: 'undo', raw };
  }

  const moves = legalMoves || generateLegalMoves(board, side);

  // 2. Grid Coordinates Format: "h2e2", "H2 E2", "h2-e2", "h2 -> e2", "đi H2 sang E2", "b2 den e2"
  const gridRegex = /(?:^|[\s([,:;])([a-iA-I])\s*([0-9])\s*(?:[-–—>→=.\/]|to|den|sang|qua|vao|toi)?\s*([a-iA-I])\s*([0-9])(?=$|[\s.,!?)}\]:;❤️🔥👍😂🎉👏✨]+)/i;
  const gridMatch = cleanNoAccent.match(gridRegex);
  if (gridMatch) {
    const fromSq = `${gridMatch[1].toUpperCase()}${gridMatch[2]}`;
    const toSq = `${gridMatch[3].toUpperCase()}${gridMatch[4]}`;
    const from = squareToCoord(fromSq);
    const to = squareToCoord(toSq);
    if (from && to) {
      const found = moves.find(
        (m) => m.fromR === from.r && m.fromC === from.c && m.toR === to.r && m.toC === to.c
      );
      if (found) {
        return { type: 'move', move: found, raw };
      }
      return {
        type: 'illegal',
        reason: describeIllegalMove(board, side, from.r, from.c, to.r, to.c),
        raw
      };
    }
  }

  // 3. Vietnamese Standard Xiangqi Notation:
  // Examples:
  // - Compact: P2-5, P2=5, M2.3, M2+3, X1+1, B7.1, P5/1, S4.5, T3.5, Tg5-4, Pt-5, Xs+2
  // - Spoken: "Pháo 2 bình 5", "Mã 2 tấn 3", "Xe 1 tiến 1", "Tốt 7 lên 1", "Pháo 5 thoái 1", "Xe trước tấn 1"
  const vnPattern =
    /(?:^|[\s,.;:!?])(phao|xe|ma|tuong|tinh|voi|si|tot|binh|chot|soai|tg|p|x|m|t|v|s|b|c|k)\s*(truoc|sau|tien|hau|tr|t|s|[1-9])\s*(binh|tan|tien|len|thoai|lui|xuong|th|b|t|[-=+.\/])\s*([1-9])(?=$|[\s.,!?)}\]:;❤️🔥👍😂🎉👏✨]+)/i;
  const vnMatch = cleanNoAccent.match(vnPattern);
  if (vnMatch) {
    const rawPieceToken = vnMatch[1].toLowerCase();
    const rawSourceToken = vnMatch[2].toLowerCase();
    const rawDirToken = vnMatch[3].toLowerCase();
    const destNum = Number(vnMatch[4]);

    // Map piece token to candidate piece types (note: "tuong" / "t" can mean Elephant B, General K, or Pawn P in casual VN typing!)
    let candidateTypes = [];
    if (rawPieceToken === 'phao' || rawPieceToken === 'p') candidateTypes = ['C'];
    else if (rawPieceToken === 'xe' || rawPieceToken === 'x') candidateTypes = ['R'];
    else if (rawPieceToken === 'ma' || rawPieceToken === 'm') candidateTypes = ['N'];
    else if (rawPieceToken === 'si' || rawPieceToken === 's') candidateTypes = ['A'];
    else if (rawPieceToken === 'tinh' || rawPieceToken === 'voi' || rawPieceToken === 'v') candidateTypes = ['B'];
    else if (rawPieceToken === 'soai' || rawPieceToken === 'tg' || rawPieceToken === 'k') candidateTypes = ['K'];
    else if (rawPieceToken === 'binh' || rawPieceToken === 'chot' || rawPieceToken === 'tot' || rawPieceToken === 'b' || rawPieceToken === 'c') candidateTypes = ['P'];
    else if (rawPieceToken === 'tuong') candidateTypes = ['B', 'K'];
    else if (rawPieceToken === 't') candidateTypes = ['B', 'P', 'K'];

    // Determine action direction
    let actionKind = null; // 'flat' | 'forward' | 'backward'
    if (rawDirToken === '-' || rawDirToken === '=' || rawDirToken === 'binh' || rawDirToken === 'b') {
      actionKind = 'flat';
    } else if (rawDirToken === '.' || rawDirToken === '+' || rawDirToken === 'tan' || rawDirToken === 'tien' || rawDirToken === 'len' || rawDirToken === 't') {
      actionKind = 'forward';
    } else if (rawDirToken === '/' || rawDirToken === 'thoai' || rawDirToken === 'lui' || rawDirToken === 'xuong' || rawDirToken === 'th') {
      actionKind = 'backward';
    }

    if (candidateTypes.length > 0 && actionKind) {
      const isFrontSpec = rawSourceToken === 'truoc' || rawSourceToken === 'tien' || rawSourceToken === 'tr' || rawSourceToken === 't';
      const isBackSpec = rawSourceToken === 'sau' || rawSourceToken === 'hau' || rawSourceToken === 's';
      const sourceFile = /^[1-9]$/.test(rawSourceToken) ? Number(rawSourceToken) : null;

      const matchesMove = (m) => {
        const type = m.piece.toUpperCase();
        if (!candidateTypes.includes(type)) return false;

        const mFromFile = getXiangqiFileNumber(m.fromC, side);
        const mToFile = getXiangqiFileNumber(m.toC, side);
        const dr = m.toR - m.fromR;
        const isForward = side === 'r' ? dr < 0 : dr > 0;
        const isBackward = side === 'r' ? dr > 0 : dr < 0;

        if (sourceFile !== null) {
          if (mFromFile !== sourceFile) return false;
        } else if (isFrontSpec || isBackSpec) {
          // Must have 2+ pieces of same type on same file
          const colRows = [];
          for (let r = 0; r < ROWS; r++) {
            if (board[r][m.fromC] === m.piece) colRows.push(r);
          }
          if (colRows.length < 2) return false;
          colRows.sort((a, b) => (side === 'r' ? a - b : b - a));
          if (isFrontSpec && m.fromR !== colRows[0]) return false;
          if (isBackSpec && m.fromR !== colRows[colRows.length - 1]) return false;
        }

        if (actionKind === 'flat') {
          return dr === 0 && mToFile === destNum;
        }
        if (actionKind === 'forward') {
          if (!isForward) return false;
          if (type === 'N' || type === 'B' || type === 'A') return mToFile === destNum;
          return Math.abs(dr) === destNum;
        }
        if (actionKind === 'backward') {
          if (!isBackward) return false;
          if (type === 'N' || type === 'B' || type === 'A') return mToFile === destNum;
          return Math.abs(dr) === destNum;
        }
        return false;
      };

      const matched = moves.filter(matchesMove);
      if (matched.length === 1) {
        return { type: 'move', move: matched[0], raw };
      }
      if (matched.length > 1) {
        // Prefer front piece if ambiguous (rare, e.g. two identical pawns on same file)
        matched.sort((a, b) => (side === 'r' ? a.fromR - b.fromR : b.fromR - a.fromR));
        return { type: 'move', move: matched[0], raw };
      }

      // Note: Sometimes Vietnamese players type "-" for backward (e.g. "P5-1" meaning thoái 1) if flat didn't match!
      if (rawDirToken === '-') {
        const fallbackMatched = moves.filter((m) => {
          const type = m.piece.toUpperCase();
          if (!candidateTypes.includes(type)) return false;
          const mFromFile = getXiangqiFileNumber(m.fromC, side);
          if (sourceFile !== null && mFromFile !== sourceFile) return false;
          const dr = m.toR - m.fromR;
          const isBackward = side === 'r' ? dr > 0 : dr < 0;
          if (!isBackward) return false;
          const mToFile = getXiangqiFileNumber(m.toC, side);
          return (type === 'N' || type === 'B' || type === 'A') ? mToFile === destNum : Math.abs(dr) === destNum;
        });
        if (fallbackMatched.length >= 1) {
          return { type: 'move', move: fallbackMatched[0], raw };
        }
      }

      // Only flag as illegal if the message was clearly a concise move notation (avoid false positives on sentences!)
      if (cleanNoAccent.length <= 28) {
        return {
          type: 'illegal',
          reason: `Nước "${raw}" không hợp lệ ở thế cờ hiện tại (kiểm tra lại lộ/tọa độ A–I, 0–9).`,
          raw
        };
      }
    }
  }

  return null;
}

module.exports = {
  ROWS,
  COLS,
  INITIAL_FEN,
  FILE_LETTERS,
  PIECE_META,
  getSide,
  oppositeSide,
  inBounds,
  inPalace,
  cloneBoard,
  parseFen,
  boardToFenPlacement,
  toFen,
  positionKey,
  coordToSquare,
  squareToCoord,
  moveToUcci,
  moveToGridDisplay,
  findGeneral,
  areGeneralsFacing,
  isInCheck,
  generatePseudoLegalMoves,
  generateLegalMoves,
  makeMoveInPlace,
  undoMoveInPlace,
  hasInsufficientMaterial,
  evaluateGameStatus,
  getXiangqiFileNumber,
  formatMoveVietnamese,
  describeIllegalMove,
  parseMoveFromComment
};
