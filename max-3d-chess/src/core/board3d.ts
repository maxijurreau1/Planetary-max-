export type Side = 'white' | 'black';
export type PieceKind = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type FileCoord = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type RankCoord = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type BoardLevel = 0 | 1 | 2;

export interface Coordinate3D { file: FileCoord; rank: RankCoord; level: BoardLevel }
export interface Move3D { from: Coordinate3D; to: Coordinate3D }
export interface Piece { side: Side; kind: PieceKind }
export interface GameState {
  board: Record<string, Piece>;
  turn: Side;
  status: 'ACTIVE' | 'CHECKMATE' | 'STALEMATE';
  winner: Side | null;
  lastMove: Move3D | null;
  ply: number;
}

const files = 'abcdefgh';
export const keyOf = ({ file, rank, level }: Coordinate3D): string => `${file}${rank}:${level}`;
export function isValidCoordinate(value: unknown): value is Coordinate3D {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Coordinate3D>;
  return typeof c.file === 'string' && files.includes(c.file) &&
    Number.isInteger(c.rank) && (c.rank ?? 0) >= 1 && (c.rank ?? 0) <= 8 &&
    Number.isInteger(c.level) && (c.level ?? -1) >= 0 && (c.level ?? 3) <= 2;
}
export function createInitialState(): GameState {
  const board: Record<string, Piece> = {};
  const back: PieceKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  files.split('').forEach((file, i) => {
    board[keyOf({ file: file as FileCoord, rank: 1, level: 0 })] = { side: 'white', kind: back[i] };
    board[keyOf({ file: file as FileCoord, rank: 2, level: 0 })] = { side: 'white', kind: 'pawn' };
    board[keyOf({ file: file as FileCoord, rank: 8, level: 2 })] = { side: 'black', kind: back[i] };
    board[keyOf({ file: file as FileCoord, rank: 7, level: 2 })] = { side: 'black', kind: 'pawn' };
  });
  return { board, turn: 'white', status: 'ACTIVE', winner: null, lastMove: null, ply: 0 };
}
