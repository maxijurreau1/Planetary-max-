# MAX 3D Chess

A standalone Cloudflare Worker subproject for a three-level chess variant. It is isolated under `max-3d-chess/` so it does not replace the repository's existing showroom and portal Worker.

## Rules implemented

- Three 8×8 levels (`0`, `1`, `2`); white starts on level 0 and black on level 2.
- Rooks move on one axis, bishops on two-axis diagonals, queens on those lines plus three-axis diagonals, and knights use 3D (2,1,0) jumps. Kings move one adjacent 3D square. Pawns move/capture along the rank axis on their current level and promote to queens.
- Moves leaving your king in check are rejected. Checkmate and stalemate are detected. Castling and en passant are not part of this variant.
- Includes a depth-limited minimax helper; the initial API currently provides game/match operations.

## Run locally

```sh
cd max-3d-chess
npm install
npm run db:migrate:local
npm run dev
```

Configure a new D1 database ID in this folder's `wrangler.toml` before deploying. The match game state is stored in a Durable Object; the D1 schema is reserved for match metadata and a future ledger integration.

`POST /api/match/create` creates a match. Fetch `/api/match/:id/state` to read it, and `POST /api/match/:id/move` with `{ "move": { "from": { "file": "e", "rank": 2, "level": 0 }, "to": { "file": "e", "rank": 4, "level": 0 } } }` to play.

**Money and identity:** This version does not implement authentication, player identity, payments, or escrow. `escrow_status` is always `DISABLED`; stake amount is constrained to zero. Do not treat the ledger table as a payment system or deploy this as a real-money game. Add audited identity, authorization, replay protection, and an external payment provider before enabling those features.
