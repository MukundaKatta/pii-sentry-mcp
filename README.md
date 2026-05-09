# pii-sentry-mcp

[![npm](https://img.shields.io/npm/v/@mukundakatta/pii-sentry-mcp.svg)](https://www.npmjs.com/package/@mukundakatta/pii-sentry-mcp)
[![mcp registry](https://img.shields.io/badge/mcp-registry-blue.svg)](https://registry.modelcontextprotocol.io/v0/servers?search=pii-sentry)

MCP server that exposes [`@mukundakatta/pii-sentry`](https://www.npmjs.com/package/@mukundakatta/pii-sentry)
to any MCP-aware client (Claude Desktop, Cursor, Cline, Windsurf, Zed).

Detect and redact PII and secret-like values **before** they reach an LLM,
log line, or third-party API.

## Tools

| Name | What it does |
| --- | --- |
| `detect_pii` | List every finding in the text with type, value, and char span. |
| `redact_pii` | Replace each finding with `[REDACTED:<type>]` (or your literal). |
| `has_pii` | Yes/no convenience gate. |

Built-in detectors: emails, phones (NA-style), US SSNs, credit-card numbers,
and prefixed API keys (`sk_…`, `ghp_…`, `xoxb_…`, `api_…`).

## Install

```jsonc
// claude_desktop_config.json (Claude Desktop)
// or the equivalent in Cursor / Cline / Windsurf / Zed
{
  "mcpServers": {
    "pii-sentry": {
      "command": "npx",
      "args": ["-y", "@mukundakatta/pii-sentry-mcp"]
    }
  }
}
```

Restart your client. The three tools appear in the tool drawer.

## Example

```text
> redact_pii on "Contact jane.doe@example.com or 555-123-4567"

{
  "redacted": "Contact [REDACTED:email] or [REDACTED:phone]",
  "count": 2
}
```

## Why this exists

Most agent stacks reach for "let the LLM redact it" — slow, non-deterministic,
and the LLM has already seen the secret by the time you ask. A small local
regex pass is cheap insurance you can run on every input/output edge.

This server is a thin wrapper. The detection logic lives in the underlying
library and is zero-dependency, sub-millisecond, and entirely local.

## License

MIT &copy; Mukunda Katta
