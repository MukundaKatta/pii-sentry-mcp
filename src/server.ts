#!/usr/bin/env node
/**
 * pii-sentry MCP server.
 *
 * Three tools:
 *
 *   detect_pii   list every PII / secret-like value in a string with positions
 *   redact_pii   replace each finding with a typed token like [REDACTED:email]
 *   has_pii      yes/no convenience check
 *
 * Configure your client to spawn this binary over stdio. Example for Claude Desktop's
 * `claude_desktop_config.json`:
 *
 *   {
 *     "mcpServers": {
 *       "pii-sentry": {
 *         "command": "npx",
 *         "args": ["-y", "@mukundakatta/pii-sentry-mcp"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { detectPii, redactPii } from '@mukundakatta/pii-sentry';

const VERSION = '0.1.0';

const server = new Server(
  {
    name: 'pii-sentry',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const TOOLS = [
  {
    name: 'detect_pii',
    description:
      'Scan the input text for personally identifiable information and secret-like values. Returns each finding with its type (email, phone, ssn, credit_card, api_key), the matched value, and its character span. Sorted by position.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to scan.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'redact_pii',
    description:
      'Replace each PII finding with a typed redaction token. By default uses `[REDACTED:<type>]` so the LLM can still tell what was removed without seeing the value. Pass `replacement` to use a single literal string for every finding instead.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to redact.',
        },
        replacement: {
          type: 'string',
          description:
            'Optional literal token to substitute for every finding. When omitted, uses `[REDACTED:<type>]` per finding.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'has_pii',
    description:
      'Convenience yes/no check. Returns `{ hasPii: boolean, count: number }`. Use when you only need a gate before forwarding text to an LLM.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to check.',
        },
      },
      required: ['text'],
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      case 'detect_pii':
        return detectTool(args as { text: string });
      case 'redact_pii':
        return redactTool(args as { text: string; replacement?: string });
      case 'has_pii':
        return hasTool(args as { text: string });
      default:
        return errorResult('unknown tool: ' + name);
    }
  } catch (err) {
    return errorResult('internal error: ' + (err as Error).message);
  }
});

function detectTool(args: { text: string }) {
  const findings = detectPii(args.text);
  return jsonResult({ findings, count: findings.length });
}

function redactTool(args: { text: string; replacement?: string }) {
  const options =
    typeof args.replacement === 'string' ? { replacement: args.replacement } : {};
  const redacted = redactPii(args.text, options);
  const count = detectPii(args.text).length;
  return jsonResult({ redacted, count });
}

function hasTool(args: { text: string }) {
  const findings = detectPii(args.text);
  return jsonResult({ hasPii: findings.length > 0, count: findings.length });
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`pii-sentry MCP server v${VERSION} ready on stdio\n`);
