import { Hono } from 'hono';
import { MatchRoom, type Env } from './durable/MatchRoom';
export { MatchRoom };

const app = new Hono<{ Bindings: Env }>();
app.get('/api/health', c => c.json({ system: 'MAX 3D Chess', status: 'ACTIVE', realMoneyEscrow: false }));
app.post('/api/match/create', async c => {
  const id = crypto.randomUUID();
  const room = c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(id));
  await room.fetch('https://match/state');
  return c.json({ success: true, match_id: id, escrow_status: 'DISABLED', state: await (await room.fetch('https://match/state')).json() }, 201);
});
app.get('/api/match/:id/state', async c => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Invalid match id.' }, 400);
  const room = c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(id));
  return room.fetch('https://match/state');
});
app.post('/api/match/:id/move', async c => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Invalid match id.' }, 400);
  const room = c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(id));
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  return room.fetch('https://match/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
});
export default app;
