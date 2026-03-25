# olow-ts

A production-ready, modular AI chatbot engine built with TypeScript. Designed as a pluggable framework where flows, tools, templates, and agents are mountable packages.

## Architecture

```
olow-ts/
  packages/
    memory/           @olow/memory           Per-user threaded memory system
    engine/           @olow/engine           Core framework (dispatcher, registry, types)
    templates/        @olow/templates        Shared UI templates + i18n
    react-agent/      @olow/react-agent      ReAct reasoning agent (plan → act → respond)
    navigate-agent/   @olow/navigate-agent   Navigation suggestion agent
  app/                olow-app               Reference application
  scripts/            Test and utility scripts
```

### Dependency Graph

```
app ──→ @olow/react-agent ──→ @olow/templates ──→ @olow/engine ──→ @olow/memory
    ──→ @olow/navigate-agent ──→ @olow/templates
```

## Key Features

- **Event-driven dispatcher** with async generator streaming (SSE)
- **ReAct reasoning agent** with multi-round tool execution and streaming think tokens
- **Pluggable broker** — `IBroker` interface with `ILlmProvider` and `IMessagingProvider` sub-providers
- **BM25 tool matching** — specialized tools discovered by local text similarity (no external embedding service)
- **MCP client integration** — connect to external MCP servers, proxy their tools as native `BaseTool` instances
- **Open type system** — `EventType` and `ActionType` are extensible strings, each package defines its own
- **Template provider pattern** — agents ship with `@olow/templates` defaults, apps can override
- **Per-user memory** — threaded memory with context graph, settings, and actionchain state

## Quick Start

```bash
# Install
npm install

# Build all packages (in dependency order)
npm run build

# Run locally with Docker
docker compose up --build -d

# Test streaming endpoint
./scripts/test-web-bot-stream.sh "How do I connect to guest wifi?"
```

## Configuration

Single `meta.yaml` with `${ENV_VAR:-default}` interpolation. Secrets go in `.env` (gitignored).

```bash
cp .env.example .env
# Edit .env with your API keys
```

## Creating a New App

```typescript
import { OlowEngine, getLogger } from '@olow/engine';
import { setReactAgentConfig } from '@olow/react-agent';
import '@olow/navigate-agent';

const engine = await OlowEngine.create()
  .withConfig(config.engine)
  .withBroker(myBroker)
  .withMessengerFactory(createMessenger)
  .withSpace('oit')
  .addFlowDir('./flows')
  .addToolDir('./tools')
  .initialize();

// Define your own routes
app.post('/chat', async (req, reply) => {
  const stream = engine.processRequest({ ... });
  // Handle SSE stream
});
```

## Adding a Custom Tool

```typescript
import { BaseTool, toolRegistry, ToolArgumentType } from '@olow/engine';
import type { ToolTag, ToolResult } from '@olow/engine';

@toolRegistry.register({ name: 'my_tool' })
export class MyTool extends BaseTool {
  static readonly toolTag: ToolTag = {
    name: 'my_tool',
    labelName: 'My Tool',
    isSpecialized: false,     // true = requires BM25 keyword match
    mcpExposable: true,
    actionchainMainKey: null,
    description: 'What this tool does',
    parameters: {
      query: { type: ToolArgumentType.STR, required: true, description: 'Search query' },
    },
    intentHints: ['keyword1', 'keyword2'],  // for specialized tools
  };

  static async run(dispatcher: unknown, event: unknown, query?: string): Promise<ToolResult> {
    return { success: true, data: 'result' };
  }
}
```

## Streaming Output Format

The `/web_bot?mode=stream` endpoint returns Server-Sent Events:

| Event Type | Message Type | Description |
|------------|-------------|-------------|
| `message` | `think_l1` | Status indicator (e.g. "Analyzing...") |
| `stream_delta` | `think_l2` | Reasoning tokens (DeepSeek thinking) |
| `stream_delta` | `think_l3` | Plan reasoning (thought field, streamed) |
| `message` | `think_l2` | Tool label (e.g. "🔧 FAQ Search") |
| `message` | `answer` | Final response text or media |
| `states` | — | Full flow states with process chain |

## Packages

| Package | Description |
|---------|-------------|
| `@olow/memory` | Zero-dependency per-user memory (zod only) |
| `@olow/engine` | Core: dispatcher, registry, types, BM25 matcher, MCP proxy, logger |
| `@olow/templates` | TextTemplate, AiIdleTemplate, GuestWifiTemplate, I18n |
| `@olow/react-agent` | ReAct flows: intent → precall → plan → act → response |
| `@olow/navigate-agent` | Navigation suggestion flow |

## License

MIT
