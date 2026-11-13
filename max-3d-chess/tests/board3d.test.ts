import { describe, expect, it } from 'vitest';
import { createInitialState, keyOf, type Coordinate3D } from '../src/core/board3d';
import { legalMoves, playMove } from '../src/core/rules';

const c = (file: Coordinate3D['file'], rank: Coordinate3D['rank'], level: Coordinate3D['level']): Coordinate3D => ({ file, rank, level });
describe('MAX 3D chess rules', () => {
  it('creates a three-level position with white to move', () => {
    const state = createInitialState();
    expect(Object.keys(state.board)).toHaveLength(32);
    expect(state.turn).toBe('white');
    expect(legalMoves(state)).toHaveLength(20);
  });
  it('rejects a move that is not legal', () => {
    expect(() => playMove(createInitialState(), { from: c('a', 1, 0), to: c('a', 4, 0) })).toThrow('Illegal move.');
  });
  it('moves a piece between levels along a rook ray', () => {
    const state = createInitialState();
    state.board = { [keyOf(c('a', 1, 0))]: { side: 'white', kind: 'rook' }, [keyOf(c('h', 8, 2))]: { side: 'black', kind: 'king' }, [keyOf(c('h', 1, 0))]: { side: 'white', kind: 'king' } };
    const next = playMove(state, { from: c('a', 1, 0), to: c('a', 1, 1) });
    expect(next.board[keyOf(c('a', 1, 1))]?.kind).toBe('rook');
    expect(next.turn).toBe('black');
  });
});
