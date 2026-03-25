# olow-ts

A production-ready, modular AI chatbot engine built with TypeScript. Designed as a pluggable framework where flows, tools, templates, and agents are mountable packages.

## Architecture

```
olow-ts/
  packages/
    memory/           @olow/memory           Per-user memory (graph, settings, actionchain)
    engine/           @olow/engine           Core framework (dispatcher, registry, broker, BM25, MCP)
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

- **Event-driven dispatcher** — async generator streaming (SSE), dependency-resolved event chain
- **ReAct reasoning agent** — multi-round tool execution with streaming think tokens (think_l2/l3)
- **Pluggable broker** — `IBroker` with `ILlmProvider` + `IMessagingProvider` sub-providers
- **BM25 tool matching** — specialized tools discovered by local text similarity, no embedding service needed
- **MCP client** — connect to external MCP servers (stdio/sse/streamable-http), proxy tools as native `BaseTool`
- **Open type system** — `EventType`/`ActionType` are extensible strings; each package defines its own constants
- **Template provider** — agents ship with `@olow/templates` defaults, apps can override via `set*TemplateProvider()`
- **Per-user memory** — flat model with `graph` (conversation context), `settings` (preferences), `actionchain` (workflow state), all with configurable expiry
- **Structural stream parsing** — LLM output parsed into think_l2 (reasoning tokens), think_l3 (thought content), answer; `<think>` tags and JSON `"thought"` field extraction supported
- **Config with env interpolation** — single `meta.yaml` with `${VAR:-default}` placeholders, secrets in `.env`

## Quick Start

```bash
# Install
npm install

# Build all packages (in dependency order)
npm run build

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys (OpenAI, ServiceNow, Hyaide, etc.)

# Run locally with Docker
docker compose up --build -d

# Test streaming endpoint
./scripts/test-web-bot-stream.sh "How do I connect to guest wifi?"
./scripts/test-web-bot-stream.sh "Palo Alto的guest wifi"
./scripts/test-web-bot-stream.sh --raw "hello"
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
  .addActionChainDir('./actionchains')
  .initialize();

// Define your own routes — engine handles init, you own the HTTP layer
app.post('/chat', async (req, reply) => {
  const stream = engine.processRequest({
    responseMode: ResponseMode.STREAM,
    space: 'oit',
    messengerType: MessengerType.WEB_BOT,
    requesterType: RequesterType.USER,
    inMsg: req.body,
  });
  // SSE streaming
  for await (const output of stream) {
    reply.raw.write(`data: ${JSON.stringify(output)}\n\n`);
  }
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
    isSpecialized: false,     // true = only visible when BM25 matches intentHints
    mcpExposable: true,
    actionchainMainKey: null,
    description: 'What this tool does',
    parameters: {
      query: { type: ToolArgumentType.STR, required: true, description: 'Search query' },
    },
    intentHints: ['keyword1', 'keyword2'],  // used by BM25 when isSpecialized=true
  };

  static async run(dispatcher: unknown, event: unknown, query?: string): Promise<ToolResult> {
    return { success: true, data: 'result' };
  }
}
```

## Extending Event/Action Types

Each package defines its own event types. The engine only provides core types:

```typescript
// Engine core
const CoreEventType = { TRIAGE: 'triage', COMMAND: 'command', UNKNOWN: 'unknown', ... };

// React agent package
const ReactEventType = { REACT_INTENT: 'react_intent', REACT_PLAN: 'react_plan', ... };

// Your app
const AppEventType = { GREETING: 'greeting', TICKET_PUSH: 'ticket_push', ... };

// Register routing at startup
registerEventRouter((action, msg, channelType) => {
  if (action === 'enter_chat') return 'greeting';
  return null;  // fall through to next router
});
```

## Streaming Output Format

The `/web_bot?mode=stream` endpoint returns Server-Sent Events:

| Event Type | Message Type | Description |
|------------|-------------|-------------|
| `message` | `think_l1` | Status indicator ("Analyzing your request...") |
| `message` | `think_l2` | Planning status / tool label ("🔧 FAQ Search") |
| `stream_delta` | `think_l2` | Reasoning tokens (DeepSeek `reasoning_content`) |
| `stream_delta` | `think_l3` | Thought content from LLM plan (streamed from `"thought"` JSON field) |
| `message` | `answer` | Final response text |
| `message` | `answer` (image) | Media attachment (base64) |
| `states` | — | Full flow states with ReAct process chain |

## Memory Model

Per-user, flat structure with expiry:

```typescript
class Memory {
  graph: MemoryContextGraph;            // conversation context (nodes + sessions)
  settings: MemorySettings;             // user preferences (language, etc.)
  actionchain: MemoryActionChain | null; // active workflow state (5min expiry)

  updateSettings(s: Partial<MemorySettings>): void;
  setActionChain(ac: MemoryActionChain | null): void;
  fetch(): Promise<void>;   // load from storage
  save(): Promise<void>;    // persist to storage
}
```

## Packages

| Package | Deps | Description |
|---------|------|-------------|
| `@olow/memory` | zod | Per-user memory: context graph, settings, actionchain |
| `@olow/engine` | memory, pino, zod, mcp-sdk, fast-xml-parser | Dispatcher, registry, broker interfaces, BM25 matcher, MCP proxy, logger, stream parser |
| `@olow/templates` | engine | TextTemplate, AiIdleTemplate, AiReActAnswerTemplate, GuestWifiTemplate, I18n |
| `@olow/react-agent` | engine, templates | ReAct flows (intent → precall → plan → act → response), prompts, BM25 tool selection |
| `@olow/navigate-agent` | engine, templates | Navigation suggestion flow |

## License

MIT
