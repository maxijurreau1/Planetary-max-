import { createInitialState, isValidCoordinate, keyOf, type Coordinate3D, type GameState, type Move3D, type Piece, type PieceKind, type Side } from './board3d';

const idx = (c: Coordinate3D) => [c.file.charCodeAt(0) - 97, c.rank - 1, c.level] as const;
const fromIdx = (x: number, y: number, z: number): Coordinate3D => ({ file: 'abcdefgh'[x] as Coordinate3D['file'], rank: (y + 1) as Coordinate3D['rank'], level: z as Coordinate3D['level'] });
const inside = (x: number, y: number, z: number) => x >= 0 && x < 8 && y >= 0 && y < 8 && z >= 0 && z < 3;
const sign = (n: number) => Math.sign(n);
const abs = (n: number) => Math.abs(n);

function rayDirections(kind: PieceKind): number[][] {
  const result: number[][] = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const nonzero = [x, y, z].filter(Boolean).length;
    if (!nonzero) continue;
    if (kind === 'rook' && nonzero === 1) result.push([x, y, z]);
    if (kind === 'bishop' && nonzero === 2) result.push([x, y, z]);
    if (kind === 'queen' && (nonzero === 1 || nonzero === 2 || (abs(x) === abs(y) && abs(y) === abs(z)))) result.push([x, y, z]);
  }
  return result;
}
function pseudoMoves(state: GameState, from: Coordinate3D, piece: Piece): Coordinate3D[] {
  const [x, y, z] = idx(from), moves: Coordinate3D[] = [];
  const add = (a: number, b: number, c: number) => {
    if (!inside(a, b, c)) return false;
    const to = fromIdx(a, b, c), occupant = state.board[keyOf(to)];
    if (occupant?.side === piece.side) return false;
    moves.push(to);
    return !occupant;
  };
  if (piece.kind === 'pawn') {
    const step = piece.side === 'white' ? 1 : -1;
    if (inside(x, y + step, z) && !state.board[keyOf(fromIdx(x, y + step, z))]) {
      moves.push(fromIdx(x, y + step, z));
      const home = piece.side === 'white' ? 1 : 6;
      if (y === home && !state.board[keyOf(fromIdx(x, y + 2 * step, z))]) moves.push(fromIdx(x, y + 2 * step, z));
    }
    for (const dx of [-1, 1]) for (const dz of [-1, 0, 1]) {
      if (!dx && !dz) continue;
      const a = x + dx, b = y + step, c = z + dz;
      if (inside(a, b, c) && state.board[keyOf(fromIdx(a, b, c))]?.side === (piece.side === 'white' ? 'black' : 'white')) moves.push(fromIdx(a, b, c));
    }
    return moves;
  }
  if (piece.kind === 'knight') {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      const values = [abs(dx), abs(dy), abs(dz)].sort().join(',');
      if (values === '0,1,2') add(x + dx, y + dy, z + dz);
    }
    return moves;
  }
  if (piece.kind === 'king') {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (dx || dy || dz) add(x + dx, y + dy, z + dz);
    return moves;
  }
  for (const [dx, dy, dz] of rayDirections(piece.kind)) {
    let a = x + dx, b = y + dy, c = z + dz;
    while (add(a, b, c)) { a += dx; b += dy; c += dz; }
  }
  return moves;
}

function attacked(state: GameState, target: Coordinate3D, by: Side): boolean {
  return Object.entries(state.board).some(([square, piece]) => piece.side === by && pseudoMoves(state, parseKey(square), piece).some(c => keyOf(c) === keyOf(target)));
}
function parseKey(key: string): Coordinate3D { return { file: key[0] as Coordinate3D['file'], rank: Number(key[1]) as Coordinate3D['rank'], level: Number(key.slice(3)) as Coordinate3D['level'] }; }
function kingSquare(state: GameState, side: Side): Coordinate3D | undefined {
  const entry = Object.entries(state.board).find(([, piece]) => piece.side === side && piece.kind === 'king');
  return entry ? parseKey(entry[0]) : undefined;
}
export function isInCheck(state: GameState, side: Side): boolean {
  const king = kingSquare(state, side);
  return !!king && attacked(state, king, side === 'white' ? 'black' : 'white');
}
function applyUnchecked(state: GameState, move: Move3D): GameState {
  const board = { ...state.board }, fromKey = keyOf(move.from), toKey = keyOf(move.to), piece = board[fromKey];
  if (!piece) return state;
  delete board[fromKey];
  board[toKey] = piece.kind === 'pawn' && (move.to.rank === 1 || move.to.rank === 8) ? { ...piece, kind: 'queen' } : piece;
  return { ...state, board, turn: state.turn === 'white' ? 'black' : 'white', lastMove: move, ply: state.ply + 1 };
}
export function legalMoves(state: GameState, side: Side = state.turn): Move3D[] {
  if (state.status !== 'ACTIVE') return [];
  const result: Move3D[] = [];
  for (const [square, piece] of Object.entries(state.board)) if (piece.side === side) {
    const from = parseKey(square);
    for (const to of pseudoMoves(state, from, piece)) {
      const next = applyUnchecked({ ...state, turn: side }, { from, to });
      if (!isInCheck(next, side)) result.push({ from, to });
    }
  }
  return result;
}
export function playMove(state: GameState, move: Move3D): GameState {
  if (state.status !== 'ACTIVE' || !isValidCoordinate(move?.from) || !isValidCoordinate(move?.to)) throw new Error('Invalid coordinate or finished game.');
  const from = keyOf(move.from), piece = state.board[from];
  if (!piece || piece.side !== state.turn || !legalMoves(state).some(candidate => keyOf(candidate.from) === from && keyOf(candidate.to) === keyOf(move.to))) throw new Error('Illegal move.');
  const next = applyUnchecked(state, move), available = legalMoves(next);
  if (available.length === 0) {
    next.status = isInCheck(next, next.turn) ? 'CHECKMATE' : 'STALEMATE';
    next.winner = next.status === 'CHECKMATE' ? state.turn : null;
  }
  return next;
}
export function newGame(): GameState { return createInitialState(); }
