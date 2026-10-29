import { tr } from './i18n.js';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const METHODS = new Set(['initialize', 'thread/list', 'thread/read', 'thread/loaded/list', 'command/exec', 'project/list', 'project/read', 'config/read', 'thread/start', 'thread/name/set', 'thread/settings/update', 'thread/archive', 'thread/unarchive', 'thread/queue/add']);
const MAX_FRAME = 64 * 1024 * 1024;

// Connects to an existing server; never starts or restarts a daemon.
export async function withAppServer(work, { socketPath = join(process.env.CODEX_HOME || homedir() + '/.codex', 'app-server-control/app-server-control.sock'), signal, timeoutMs = 15000 } = {}) {
  signal?.throwIfAborted();
  const socket = net.createConnection(socketPath);
  let buffer = Buffer.alloc(0), upgraded = false, next = 0, fragments = [], fragmentBytes = 0;
  const pending = new Map();
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let failed;
  function fail(error) {
    if (failed) return;
    failed = error instanceof Error ? error : Error(String(error));
    readyReject(failed);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(failed); }
    pending.clear(); socket.destroy();
  }
  function frame(payload, opcode = 1) {
    const body = Buffer.from(payload), mask = randomBytes(4);
    let header;
    if (body.length < 126) header = Buffer.from([0x80 | opcode, 0x80 | body.length]);
    else if (body.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 0xfe; header.writeUInt16BE(body.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 0xff; header.writeBigUInt64BE(BigInt(body.length), 2); }
    for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
    socket.write(Buffer.concat([header, mask, body]));
  }
  function request(method, params) {
    if (!METHODS.has(method)) return Promise.reject(Error(tr('unsupportedOperation')));
    if (failed) return Promise.reject(failed);
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => fail(Error(tr('requestTimeout', {method}))), timeoutMs);
      pending.set(id, { resolve, reject, timer });
      frame(JSON.stringify({ id, method, params }));
    });
  }
  const key = randomBytes(16).toString('base64');
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.on('connect', () => socket.write(`GET /rpc HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
  socket.on('error', error => fail(Error(tr('connectionFailed', {detail: error.code || error.message}))));
  socket.on('close', () => fail(Error(tr('connectionClosed'))));
  socket.on('data', chunk => {
    try {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) { if (buffer.length > 16384) throw Error(tr('invalidHandshake')); return; }
        const headers = buffer.subarray(0, end).toString();
        if (!/^HTTP\/1\.1 101\b/.test(headers) || !headers.split('\r\n').some(h => h.toLowerCase().startsWith('sec-websocket-accept:') && h.slice(h.indexOf(':') + 1).trim() === accept)) throw Error(tr('invalidUpgrade'));
        buffer = buffer.subarray(end + 4); upgraded = true; readyResolve();
      }
      while (buffer.length >= 2) {
        const fin = !!(buffer[0] & 128), opcode = buffer[0] & 15, masked = !!(buffer[1] & 128);
        let length = buffer[1] & 127, offset = 2;
        if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
        else if (length === 127) { if (buffer.length < 10) return; const size = buffer.readBigUInt64BE(2); if (size > BigInt(MAX_FRAME)) throw Error(tr('responseTooLarge')); length = Number(size); offset = 10; }
        if (length > MAX_FRAME) throw Error(tr('responseTooLarge'));
        if (buffer.length < offset + (masked ? 4 : 0) + length) return;
        const mask = masked ? buffer.subarray(offset, offset + 4) : null; if (masked) offset += 4;
        const body = Buffer.from(buffer.subarray(offset, offset + length)); buffer = buffer.subarray(offset + length);
        if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
        if (opcode === 9) { frame(body, 10); continue; }
        if (opcode === 10) continue;
        if (opcode === 8) throw Error(tr('connectionClosed'));
        if (opcode === 1) { fragments = []; fragmentBytes = 0; }
        else if (opcode !== 0 || !fragments.length) throw Error(tr('unsupportedFrame'));
        fragments.push(body); fragmentBytes += body.length;
        if (fragmentBytes > MAX_FRAME) throw Error(tr('responseTooLarge'));
        if (fin) {
          const m = JSON.parse(Buffer.concat(fragments).toString()); fragments = []; fragmentBytes = 0;
          const p = pending.get(m.id);
          if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
        }
      }
    } catch (error) { fail(error); }
  });
  const abort = () => fail(signal.reason || Error(tr('aborted')));
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => fail(Error(tr('handshakeTimeout'))), timeoutMs);
  try {
    await ready;
    clearTimeout(timer);
    await request('initialize', { clientInfo: { name: 'worktree_navigator', version: '0.3.0' }, capabilities: { experimentalApi: true } });
    frame(JSON.stringify({ method: 'initialized' }));
    return await work(request);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); fail(Error(tr('connectionFinished'))); }
}
