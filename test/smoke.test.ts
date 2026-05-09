/**
 * End-to-end smoke test: spawn the MCP server, ask for the tool catalog, and
 * call each tool with a representative input.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'src', 'server.ts');

function rpc(child: ReturnType<typeof spawn>, request: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if ('id' in msg && (msg as { id: number }).id === (request as { id: number }).id) {
            child.stdout?.off('data', onData);
            resolve(msg);
            return;
          }
        } catch {
          // partial line, keep buffering
        }
      }
    };
    child.stdout?.on('data', onData);
    child.on('error', reject);
    child.stdin?.write(JSON.stringify(request) + '\n');
  });
}

async function withServer(fn: (child: ReturnType<typeof spawn>) => Promise<void>) {
  const child = spawn('npx', ['tsx', SERVER], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  await rpc(child, {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' },
    },
  });
  child.stdin?.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
  );
  try {
    await fn(child);
  } finally {
    child.kill();
  }
}

test('server lists three tools', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    })) as { result: { tools: Array<{ name: string }> } };
    const names = res.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['detect_pii', 'has_pii', 'redact_pii']);
  });
});

test('detect_pii finds email, phone, and ssn', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'detect_pii',
        arguments: {
          text: 'Contact jane.doe@example.com or 555-123-4567. SSN 123-45-6789.',
        },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as {
      findings: Array<{ type: string }>;
      count: number;
    };
    const types = payload.findings.map((f) => f.type).sort();
    assert.ok(types.includes('email'));
    assert.ok(types.includes('phone'));
    assert.ok(types.includes('ssn'));
    assert.ok(payload.count >= 3);
  });
});

test('redact_pii replaces values with typed tokens by default', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'redact_pii',
        arguments: { text: 'reach out to jane.doe@example.com any time' },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as {
      redacted: string;
      count: number;
    };
    assert.ok(!payload.redacted.includes('jane.doe@example.com'));
    assert.ok(payload.redacted.includes('[REDACTED:email]'));
    assert.equal(payload.count, 1);
  });
});

test('redact_pii honors a custom replacement literal', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'redact_pii',
        arguments: {
          text: 'reach out to jane.doe@example.com any time',
          replacement: '<<HIDDEN>>',
        },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as { redacted: string };
    assert.ok(payload.redacted.includes('<<HIDDEN>>'));
    assert.ok(!payload.redacted.includes('jane.doe@example.com'));
  });
});

test('has_pii returns false on clean text and true on dirty text', async () => {
  await withServer(async (child) => {
    const clean = (await rpc(child, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'has_pii',
        arguments: { text: 'Just a friendly greeting, no details here.' },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const cleanPayload = JSON.parse(clean.result.content[0]!.text) as {
      hasPii: boolean;
    };
    assert.equal(cleanPayload.hasPii, false);

    const dirty = (await rpc(child, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'has_pii',
        arguments: { text: 'send to jane@example.com' },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const dirtyPayload = JSON.parse(dirty.result.content[0]!.text) as {
      hasPii: boolean;
      count: number;
    };
    assert.equal(dirtyPayload.hasPii, true);
    assert.ok(dirtyPayload.count >= 1);
  });
});
