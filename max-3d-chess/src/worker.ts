import { Hono } from 'hono';
import { MatchRoom, type Env } from './durable/MatchRoom';

export { MatchRoom };

interface WorkerEnv extends Env {
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: WorkerEnv }>();

app.get('/api/chess/health', c => c.json({
  system: 'MAX 3D Chess',
  status: 'ACTIVE',
  escrow: 'DISABLED',
  authentication: 'NOT_CONFIGURED',
}));

app.post('/api/chess/match/create', async c => {
  const matchId = crypto.randomUUID();
  const room = c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(matchId));
  const response = await room.fetch('https://match/state');
  return c.json({
    success: true,
    match_id: matchId,
    escrow_status: 'DISABLED',
    state: await response.json(),
  }, 201);
});

app.all('/api/chess/match/:id/*', async c => {
  const matchId = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(matchId)) {
    return c.json({ error: 'Invalid match id.' }, 400);
  }
  const path = new URL(c.req.url).pathname;
  const prefix = `/api/chess/match/${matchId}`;
  const targetPath = path.slice(prefix.length) || '/state';
  const room = c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(matchId));
  const target = new URL(`https://match${targetPath}`);
  target.search = new URL(c.req.url).search;
  return room.fetch(new Request(target, c.req.raw));
});

app.all('*', c => c.env.ASSETS.fetch(c.req.raw));

export default app;
