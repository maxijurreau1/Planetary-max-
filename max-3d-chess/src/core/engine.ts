import { keyOf, type GameState, type PieceKind, type Side } from './board3d';
import { legalMoves, playMove } from './rules';

const value: Record<PieceKind, number> = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };
function evaluate(state: GameState, side: Side): number {
  if (state.status === 'CHECKMATE') return state.winner === side ? 1_000_000 : -1_000_000;
  if (state.status === 'STALEMATE') return 0;
  return Object.values(state.board).reduce((sum, p) => sum + (p.side === side ? value[p.kind] : -value[p.kind]), 0);
}
export function chooseMove(state: GameState, depth = 2) {
  const root = state.turn;
  let best: ReturnType<typeof legalMoves>[number] | null = null, bestScore = -Infinity;
  function search(position: GameState, remaining: number, alpha: number, beta: number): number {
    if (!remaining || position.status !== 'ACTIVE') return evaluate(position, root);
    const moves = legalMoves(position);
    if (!moves.length) return evaluate(position, root);
    const maximizing = position.turn === root;
    let score = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
      const child = playMove(position, move);
      const candidate = search(child, remaining - 1, alpha, beta);
      if (maximizing) { score = Math.max(score, candidate); alpha = Math.max(alpha, score); }
      else { score = Math.min(score, candidate); beta = Math.min(beta, score); }
      if (beta <= alpha) break;
    }
    return score;
  }
  for (const move of legalMoves(state)) {
    const score = search(playMove(state, move), Math.max(0, Math.min(3, depth) - 1), -Infinity, Infinity);
    if (score > bestScore) { best = move; bestScore = score; }
  }
  return best;
}
export { keyOf };
