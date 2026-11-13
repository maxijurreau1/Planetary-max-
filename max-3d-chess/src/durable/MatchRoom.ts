import { DurableObject } from 'cloudflare:workers';
import { newGame, playMove } from '../core/rules';
import type { GameState, Move3D } from '../core/board3d';

export interface Env { MATCH_ROOM: DurableObjectNamespace<MatchRoom>; DB: D1Database }
export class MatchRoom extends DurableObject<Env> {
  private match!: GameState;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.match = (await ctx.storage.get<GameState>('match')) ?? newGame(); });
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/state') return Response.json(this.match);
    if (request.method === 'POST' && url.pathname === '/move') {
      let body: { move?: Move3D };
      try { body = await request.json() as { move?: Move3D }; } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
      try {
        this.match = playMove(this.match, body.move as Move3D);
        await this.ctx.storage.put('match', this.match);
        return Response.json({ success: true, state: this.match });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Move rejected.' }, { status: 400 });
      }
    }
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }
}
