// Faz o papel do Kong + Edge Function nos testes: /auth/v1 → GoTrue, /rest/v1 → PostgREST, /functions/v1/log-ingest → app_logs.
import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toRows } from '../functions/log-ingest/rows';
import { sys } from './helpers';

const JWT_SECRET = process.env.TEST_JWT_SECRET ?? 'mb-test-jwt-secret-with-at-least-32-chars';
const AUTH = `http://127.0.0.1:${process.env.TEST_AUTH_PORT ?? 54331}`;
const REST = `http://127.0.0.1:${process.env.TEST_REST_PORT ?? 54330}`;

const b64 = (o: object | Buffer) => (Buffer.isBuffer(o) ? o : Buffer.from(JSON.stringify(o))).toString('base64url');
export function signJwt(payload: object) {
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${head}.${b64(createHmac('sha256', JWT_SECRET).update(head).digest())}`;
}
export const anonKey = signJwt({ role: 'anon', iss: 'supabase', exp: 4102444800 });

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function startGateway(port = 0) {
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const url = req.url ?? '/';
    try {
      if (url.startsWith('/functions/v1/log-ingest')) {
        const auth = await fetch(`${AUTH}/user`, { headers: { Authorization: req.headers.authorization ?? '', apikey: anonKey } });
        if (!auth.ok) return void res.writeHead(401).end('unauthorized');
        const rows = toRows(JSON.parse(body.toString() || 'null'));
        if (!rows) return void res.writeHead(400).end('expected array');
        for (const r of rows)
          await sys(`insert into app_logs (ts, level, event, session_id, pseudo_user, app_version, os, device, latency_ms, error, meta)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [r.ts, r.level, r.event, r.session_id, r.pseudo_user, r.app_version, r.os, r.device, r.latency_ms, r.error, r.meta]);
        return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ inserted: rows.length }));
      }
      const target = url.startsWith('/auth/v1') ? AUTH + url.slice(8) : url.startsWith('/rest/v1') ? REST + url.slice(8) : null;
      if (!target) return void res.writeHead(404).end();
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length'].includes(k))) as Record<string, string>;
      // Como o Kong: sem JWT de usuário, usa a anon key.
      headers.authorization ??= `Bearer ${anonKey}`;
      const r = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method!) ? undefined : body });
      const out = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(k))));
      res.end(out);
    } catch (e) {
      res.writeHead(502).end(String(e));
    }
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((ok) => server.close(ok)) };
}
