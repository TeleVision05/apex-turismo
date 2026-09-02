// Tiny local sink for the audio preview page's offline WAV renders: the
// javascript_tool output channel blocks base64-looking payloads, so the page
// POSTs raw bytes here instead of relaying them through the chat tool.
// Debug-only tooling, not part of the shipped app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] || 'tools/audiopreview/renders');
fs.mkdirSync(outDir, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  const safeName = path.basename(url.searchParams.get('name') || 'out.wav');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    fs.writeFileSync(path.join(outDir, safeName), buf);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`saved ${buf.length} bytes to ${safeName}`);
    console.log(`saved ${safeName} (${buf.length} bytes)`);
  });
});

server.listen(5399, '127.0.0.1', () => console.log('receive-server listening on 127.0.0.1:5399'));
