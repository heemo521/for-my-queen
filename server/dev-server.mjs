// Run the brain locally: ANTHROPIC_API_KEY=... node server/dev-server.mjs
// Then open the game with ?brain=http://localhost:8787
import http from 'node:http';
import worker from './worker.js';

const PORT = Number(process.env.PORT || 8787);
const env = { ...process.env };

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' ? undefined : body,
  });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`GTO brain on http://localhost:${PORT}`));
