# olow-ts

A production-ready, modular AI chatbot engine built with TypeScript. Designed as a layered framework where every external concern (LLM, messaging, storage, user context) is abstracted in the engine and mounted by the app.

## Architecture

### Layered Design

```
 ┌─────────────────────────────────────────────────────────────────┐
 │  app (olow-app)                          Concrete / App-specific │
 │                                                                  │
 │  ┌─────────┐  ┌──────────┐  ┌───────┐  ┌─────────────┐         │
 │  │ Broker  │  │ Providers│  │ Flows │  │ Messengers  │         │
 │  │ (IBroker│  │ LLM      │  │ Tools │  │ WeComMsg    │         │
 │  │  impl)  │  │ Messaging│  │ Chains│  │             │         │
 │  │         │  │ Context  │  │       │  │             │         │
 │  └────┬────┘  └────┬─────┘  └───┬───┘  └──────┬──────┘         │
 │       │            │            │              │                 │
 ├───────┼────────────┼────────────┼──────────────┼─────────────────┤
 │       ▼            ▼            ▼              ▼     Packages    │
 │                                                                  │
 │  @olow/engine          @olow/messengers    @olow/react-agent     │
 │  ┌──────────────┐      ┌──────────────┐    ┌──────────────┐     │
 │  │ IBroker      │      │ Messenger    │    │ 5-flow ReAct │     │
 │  │ ILlmProvider │      │ WebBotMsg    │    │ pipeline     │     │
 │  │ IMessaging.. │      │ StubMsg      │    │ Intent→Plan  │     │
 │  │ IUserContext │      │ Templates    │    │ →Act→Respond │     │
 │  │ IMessenger   │      │ I18n         │    │              │     │
 │  │ Dispatcher   │      │              │    │              │     │
 │  │ Registry     │      └──────────────┘    └──────────────┘     │
 │  │ BaseFlow     │                                                │
 │  │ BaseTool     │      @olow/memory                              │
 │  │ BaseAction.. │      ┌──────────────┐                         │
 │  └──────────────┘      │ ContextGraph │                         │
 │                        │ Settings     │      Abstract / Generic  │
 │                        │ ActionChain  │                         │
 │                        └──────────────┘                         │
 └─────────────────────────────────────────────────────────────────┘
```

### Package Dependency Graph

```
@olow/memory                          (zero dependencies)
     │
     ▼
@olow/engine                          (defines all interfaces & base classes)
     │
     ├──────────────┐
     ▼              ▼
@olow/messengers   @olow/react-agent  (implementations & agents)
     │              │
     └──────┬───────┘
            ▼
          app                         (composition root — wires everything)
```

Build order: `memory → engine → messengers → react-agent → app`

### Directory Structure

```
olow-ts/
├── packages/
│   ├── memory/           @olow/memory           Pure data structures (graph, settings, actionchain)
│   ├── engine/           @olow/engine           Interfaces, dispatcher, registry, base classes
│   ├── messengers/       @olow/messengers       Messenger impls + templates + i18n
│   └── react-agent/      @olow/react-agent      ReAct reasoning agent (5-flow pipeline)
│
├── apps/o-chatbot/                  olow-app               Reference application
│   └── src/
│       ├── index.ts                 Bootstrap & Fastify routes
│       ├── config/                  YAML + .env config loading
│       ├── engine/                  IBroker impl + providers
│       │   ├── broker.ts            Composition root (singleton)
│       │   ├── llm.provider.ts      ILlmProvider (OpenAI / Hyaide)
│       │   ├── messaging.provider.ts IMessagingProvider (WeCom API)
│       │   ├── user-context.provider.ts IUserContextRefresher (Workday + ITAware)
│       │   └── token-cache.ts       3-tier cache (memory → DB → API)
│       ├── messengers/              App-specific messenger implementations
│       │   └── wecom.messenger.ts   WeComMessenger (parses + sends via WeCom API)
│       ├── flows/                   Business logic (triage, greeting, click, etc.)
│       ├── tools/                   Domain tools (FAQ, article, hardware-asset)
│       ├── actionchains/            Multi-step workflows (guest-wifi)
│       ├── services/                External API clients (wecom, openai, slack, etc.)
│       └── storage/                 MongoDB layer
│
└── [config files]        package.json, tsconfig, Dockerfile, vitest.config
```

## Abstract → Concrete Mounting

The engine defines **interfaces**. The app provides **implementations**. They connect at bootstrap via the builder pattern and decorator-based registry.

### Interfaces (engine defines)

| Interface | Purpose | Mounted by |
|-----------|---------|------------|
| `IBroker` | Storage, cache, lifecycle, user ID resolution | `Broker` singleton in app |
| `ILlmProvider` | LLM call + streaming | `LlmProvider` (OpenAI / Hyaide) |
| `IMessagingProvider` | Out-of-band message sending (notifications, errors) | `MessagingProvider` (WeCom API) |
| `IUserContextRefresher` | Fetch user context from external HR/profile systems | `UserContextProvider` (Workday + ITAware) |
| `IMessenger` | Parse inbound messages + send replies per platform | `WeComMessenger`, `WebBotMessenger` |
| `BaseFlow` | Handle a specific event type | App flows (triage, greeting, click...) |
| `BaseTool` | Execute a tool action | App tools (FAQ, article, hardware-asset...) |
| `BaseActionChain` | Multi-step interactive workflow | App chains (guest-wifi) |
| `ITemplate` | Render message content for a messenger type | Templates in `@olow/messengers` |

### Mounting Mechanisms

**1. Builder pattern (explicit wiring)**

```typescript
const broker = Broker.getInstance();
broker.setMessagingProvider(new MessagingProvider(broker.wecomBotTokenCache));

const engine = await OlowEngine.create()
  .withConfig(config.engine)           // engine config (Zod-validated)
  .withBroker(broker)                  // IBroker implementation
  .withMessengerFactory(Messenger.create) // MessengerFactory function
  .addFlowDir('./flows')               // auto-discover flows
  .addToolDir('./tools')               // auto-discover tools
  .addActionChainDir('./actionchains') // auto-discover actionchains
  .addMessengerDir('./messengers')     // auto-discover messengers
  .initialize();
```

**2. Decorator registry (auto-registration on import)**

```typescript
// Flows, tools, actionchains, messengers register via decorators:
@flowRegistry.register()
export class TriageFlow extends BaseFlow { ... }

@toolRegistry.register({ name: 'faq_search' })
export class FaqTool extends BaseTool { ... }

@messengerRegistry.register({ name: 'WeCom_Bot' })
export class WeComMessenger implements IMessenger { ... }

// Engine discovers modules by scanning directories:
// addFlowDir() → flowRegistry.discoverModules(dir)
// addMessengerDir() → messengerRegistry.discoverModules(dir)
```

**3. Messenger factory (runtime lookup)**

```typescript
// Messenger.create() queries messengerRegistry at runtime:
class Messenger {
  static create(type: MessengerType): IMessenger {
    const Class = messengerRegistry.getRegistered().get(type);
    if (Class) return new Class();
    return new StubMessenger(type);  // fallback
  }
}
```

**4. Pluggable routing (side-effect registration)**

```typescript
// apps/o-chatbot/src/events.ts — registered on import
registerSystemActionParser((msg) => { ... });
registerEventRouter((action, msg, channelType) => { ... });
```

## Initialization Sequence

```
1. Config loaded            config/ → YAML + .env → Zod validation
2. Broker created           Singleton with Redis, MongoDB, token caches
3. Providers mounted        LlmProvider, MessagingProvider, UserContextProvider
4. OlowEngine.initialize()
   ├── Logger setup
   ├── Dispatcher config
   ├── Memory config + storage binding
   ├── Broker.initialize()     (Redis connect, MongoDB connect)
   ├── Module discovery        (scan dirs → import → decorators fire → registry populated)
   │   ├── flowRegistry        ← apps/o-chatbot/src/flows/*.ts
   │   ├── toolRegistry        ← apps/o-chatbot/src/tools/*.ts
   │   ├── actionchainRegistry ← apps/o-chatbot/src/actionchains/*.ts
   │   └── messengerRegistry   ← apps/o-chatbot/src/messengers/*.ts + @olow/messengers (WebBot)
   └── MCP proxy (if configured)
5. Fastify routes bound
6. Server listening
```

## Request Lifecycle

```
HTTP Request (e.g. POST /web_bot)
  │
  ▼
engine.processRequest({ responseMode, messengerType, requesterType, inMsg })
  │
  ▼
Dispatcher.asyncMain()
  ├── messengerFactory(type)          → Messenger.create() → registry lookup
  │                                      WebBot / WeCom / Stub
  ├── messenger.initRequest(broker, msg)
  │   └── parse platform-specific payload → Request object
  │       (userId, content, action, channelType, sessionId)
  │
  ├── request.initEvent()             → pluggable EventRouter → initial Event
  │
  ▼
Event Loop (loopEventChain — async generator)
  │
  ├─ For each Event with satisfied dependencies:
  │   ├── Find FlowClass via FlowClass.canHandle(event, messengerType)
  │   ├── flow = new FlowClass(dispatcher, event)
  │   ├── flow.run()
  │   │   ├── event.propagateMsg(template)  → MessageQueue
  │   │   ├── dispatcher.eventchain.push(new Event(...))  → chain new events
  │   │   └── broker.llm.callLlm / callLlmStream
  │   └── yield FlowMsg / StreamDeltaFlowMsg
  │
  ├─ STREAM mode:
  │   ├── decodeMsg(flowMsg) → SSE: data: {"type":"message","data":{...}}
  │   └── stream_delta      → SSE: data: {"type":"stream_delta","data":{...}}
  │
  ├─ POST mode:
  │   └── postMsg(flowMsg) → messenger.say() → platform-specific send
  │       WeComMessenger: wecom.api.sendSingleText() (direct, with token retry)
  │       WebBotMessenger: no-op (already yielded via SSE)
  │
  └─ finally:
      ├── await backgroundTasks
      └── archiveCycle() → MongoDB
```

## Extension Guide

### Adding a Custom Flow

```typescript
import { BaseFlow, Event, flowRegistry, EventStatus } from '@olow/engine';

@flowRegistry.register()
export class MyFlow extends BaseFlow {
  static canHandle(event: Event): boolean {
    return event.type === 'my_event';
  }

  async run(): Promise<EventStatus> {
    // Access: this.request, this.broker, this.dispatcher, this.event
    await this.event.propagateMsg(new TextTemplate(['Hello!']));
    return EventStatus.COMPLETE;
  }
}
```

### Adding a Custom Tool

```typescript
import { BaseTool, toolRegistry, ToolArgumentType } from '@olow/engine';

@toolRegistry.register({ name: 'my_tool' })
export class MyTool extends BaseTool {
  static readonly toolTag = {
    name: 'my_tool',
    labelName: 'My Tool',
    isSpecialized: false,
    mcpExposable: true,
    actionchainMainKey: null,
    description: 'What this tool does',
    parameters: {
      query: { type: ToolArgumentType.STR, required: true, description: 'Search query' },
    },
  };

  static async run(_dispatcher: unknown, _event: unknown, query?: string) {
    return { success: true, data: 'result' };
  }
}
```

### Adding a Custom Messenger

```typescript
// apps/o-chatbot/src/messengers/slack.messenger.ts
import { messengerRegistry, MessengerType as MT } from '@olow/engine';
import type { IMessenger } from '@olow/engine';

@messengerRegistry.register({ name: MT.SLACK_BOT })
export class SlackMessenger implements IMessenger {
  readonly type = MT.SLACK_BOT;
  readonly supportsStreaming = false;

  initRequest(broker, requesterType, msg) { /* parse Slack payload */ }
  async say(opts) { /* send via Slack API */ }
}
```

### Swapping Providers (different project)

```typescript
// A different project can implement its own providers:
class MyBroker implements IBroker {
  get llm() { return new AzureOpenAIProvider(); }       // instead of Hyaide
  get messaging() { return new TeamsProvider(); }        // instead of WeCom
  refreshUserContext(id) { return ldapLookup(id); }      // instead of Workday
  // ... storage methods using PostgreSQL instead of MongoDB
}
```

## Streaming Output Format

`POST /web_bot?mode=stream` returns Server-Sent Events:

| Event Type | Message Type | Description |
|------------|-------------|-------------|
| `message` | `think_l1` | Status indicator ("Analyzing your request...") |
| `message` | `think_l2` | Planning status |
| `stream_delta` | `think_l2` | Reasoning tokens (DeepSeek `reasoning_content`) |
| `stream_delta` | `think_l3` | Thought content (streamed from `"thought"` JSON field) |
| `message` | `answer` | Final response text |
| `states` | -- | Full flow states with ReAct process chain |

## Packages

| Package | Deps | Description |
|---------|------|-------------|
| `@olow/memory` | zod | Per-user memory: context graph, settings, actionchain |
| `@olow/engine` | memory, pino, zod, mcp-sdk | Interfaces, dispatcher, registry, base classes, BM25 matcher, MCP proxy |
| `@olow/messengers` | engine | Messenger factory, WebBot/Stub impls, templates, i18n |
| `@olow/react-agent` | engine, messengers | ReAct flows (intent -> precall -> plan -> act -> response) |

## Quick Start

```bash
npm install
npm run build
cp .env.example .env   # configure API keys

# Docker
docker compose up --build -d

# Test
curl -N -X POST 'http://localhost:3070/web_bot?mode=stream' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"UserId":"test","content":"hello","action":"enter_chat"}'
```

## License

MIT
