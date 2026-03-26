# olow-ts

A production-ready, modular AI chatbot engine built with TypeScript. Designed as a layered framework where every external concern (LLM, messaging, storage, user context) is abstracted in the engine and mounted by the app.

## Architecture

### Layered Design

```
 ┌───────────────────────────────────────────────────────────────────────┐
 │  app (olow-chatbot)                              Concrete / App-layer │
 │                                                                       │
 │  ┌──────────┐  ┌───────────┐  ┌────────┐  ┌───────────┐  ┌────────┐ │
 │  │ Broker   │  │ Providers │  │ Flows  │  │Messengers │  │Templates│ │
 │  │ (IBroker │  │ LLM       │  │ Tools  │  │ WeComMsg  │  │ AiAnswer│ │
 │  │  impl)   │  │ Messaging │  │ Chains │  │           │  │ GuestWi │ │
 │  │          │  │ Context   │  │ ASR    │  │           │  │         │ │
 │  └────┬─────┘  └─────┬─────┘  └───┬────┘  └─────┬─────┘  └────┬───┘ │
 │       │              │            │              │              │     │
 ├───────┼──────────────┼────────────┼──────────────┼──────────────┼─────┤
 │       ▼              ▼            ▼              ▼              ▼     │
 │                                                           Packages   │
 │  @olow/types    @olow/engine      @olow/messengers  @olow/templates  │
 │  ┌──────────┐   ┌─────────────┐   ┌─────────────┐  ┌─────────────┐  │
 │  │ Enums    │   │ Dispatcher  │   │ Messenger   │  │ TextTpl     │  │
 │  │ Schemas  │   │ Registry ×5 │   │ WebBotMsg   │  │ AiIdleTpl   │  │
 │  │ Zod      │   │ BaseFlow    │   │ StubMsg     │  │ I18n        │  │
 │  │ ITemplate│   │ BaseTool    │   └─────────────┘  └─────────────┘  │
 │  │ ToolTag  │   │ IBroker     │                                      │
 │  └──────────┘   │ IMessenger  │   @olow/agent-flows                  │
 │                 │ Archiver    │   ┌─────────────┐  @olow/memory      │
 │                 │ MsgHandler  │   │ ReAct 5-flow│  ┌─────────────┐  │
 │                 └─────────────┘   │ OCR flow    │  │ ContextGraph│  │
 │                                   │ Navigate    │  │ Settings    │  │
 │                                   └─────────────┘  │ ActionChain │  │
 │                                                     └─────────────┘  │
 │                                         Abstract / Generic           │
 └───────────────────────────────────────────────────────────────────────┘
```

### Package Dependency Graph

```
@olow/types    @olow/memory        (leaves — zero cross-deps)
     ↓              ↓
     └──────┬───────┘
            ▼
      @olow/engine                  (interfaces + runtime + registries)
            ↓
     ┌──────┼────────────┐
     ▼      ▼            ▼
templates  messengers   agent-flows (implementations + agents)
     │      │            │
     └──────┼────────────┘
            ▼
    apps/olow-chatbot               (composition root)
```

Build order: `types → memory → engine → templates → messengers → agent-flows → app`

### Directory Structure

```
olow-ts/
├── packages/
│   ├── types/            @olow/types          Enums, schemas, shared interfaces (zero runtime deps)
│   ├── memory/           @olow/memory         Per-user memory (graph, settings, actionchain)
│   ├── engine/           @olow/engine         Dispatcher, registries, base classes, broker interfaces
│   ├── templates/        @olow/templates      Default template impls + I18n + Templates factory
│   ├── messengers/       @olow/messengers     Messenger impls + Messenger factory
│   └── agent-flows/      @olow/agent-flows    ReAct pipeline, OCR flow, Navigate flow
│
├── apps/olow-chatbot/    olow-chatbot         Reference chatbot application
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .env
│   └── src/
│       ├── index.ts                 Bootstrap + Fastify routes
│       ├── config/                  YAML + .env → Zod validation
│       ├── engine/                  Broker + providers
│       ├── messengers/              WeComMessenger (app-specific)
│       ├── templates/               App-specific template overrides
│       ├── flows/                   Business flows (triage, greeting, ASR, etc.)
│       ├── tools/                   Domain tools (FAQ, article, etc.)
│       ├── actionchains/            Multi-step workflows
│       ├── services/                External API clients
│       └── storage/                 MongoDB layer
```

## Mounting Mechanisms

The engine defines **interfaces**. Apps provide **implementations**. Four mechanisms connect them:

### 1. Builder — explicit wiring at bootstrap

Used for: **core infrastructure** that must exist before any request.

| What | Method | Example |
|------|--------|---------|
| Broker | `.withBroker(broker)` | `IBroker` impl with Redis, MongoDB, token caches |
| Messenger factory | `.withMessengerFactory(fn)` | `Messenger.create` (registry-backed) |
| Engine config | `.withConfig(config)` | Zod-validated from YAML + .env |
| Module dirs | `.addFlowDir()` / `.addToolDir()` / etc. | Auto-discover via directory scan |

```typescript
const engine = await OlowEngine.create()
  .withConfig(config.engine)
  .withBroker(broker)
  .withMessengerFactory(Messenger.create)
  .addFlowDir(join(__dirname, 'flows'))
  .addToolDir(join(__dirname, 'tools'))
  .addActionChainDir(join(__dirname, 'actionchains'))
  .addMessengerDir(join(__dirname, 'messengers'))
  .addTemplateDir(join(__dirname, 'templates'))
  .initialize();
```

### 2. Setter — runtime injection of optional providers

Used for: **pluggable providers** that may not exist in all deployments.

| What | Setter | When absent |
|------|--------|-------------|
| Messaging | `broker.setMessagingProvider(p)` | Notifications silently skipped |

```typescript
const broker = Broker.getInstance();
// Only wire if WeCom is configured
broker.setMessagingProvider(new MessagingProvider(broker.wecomBotTokenCache));
```

### 3. Provider — interface implementations injected into Broker

Used for: **external service adapters** that vary per project.

| Interface | Provider class | Swappable for |
|-----------|---------------|---------------|
| `ILlmProvider` | `LlmProvider` (OpenAI/Hyaide) | Azure, Anthropic, local LLM |
| `IMessagingProvider` | `MessagingProvider` (WeCom) | Slack, Teams, none |
| `IUserContextRefresher` | `UserContextProvider` (Workday+ITAware) | LDAP, custom HR |

```typescript
// Different project, different providers:
class MyBroker implements IBroker {
  get llm() { return new AzureOpenAIProvider(); }
  refreshUserContext(id) { return ldapLookup(id); }
}
```

### 4. Register — decorator-based auto-registration

Used for: **flows, tools, messengers, templates, actionchains** — discovered at startup.

All 5 registries share the same `ModuleRegistry` class. Later registration overrides earlier (app overrides package defaults).

| Registry | Decorator | Discovery | Override example |
|----------|-----------|-----------|-----------------|
| `flowRegistry` | `@flowRegistry.register()` | `addFlowDir()` | App flow overrides package flow |
| `toolRegistry` | `@toolRegistry.register({ name })` | `addToolDir()` | Custom tool replaces default |
| `messengerRegistry` | `@messengerRegistry.register({ name })` | `addMessengerDir()` | WeComMessenger in app |
| `templateRegistry` | `@templateRegistry.register({ name })` | `addTemplateDir()` | App richtext overrides plain text |
| `actionchainRegistry` | `@actionchainRegistry.register()` | `addActionChainDir()` | App-specific workflows |

```typescript
// Package layer — default template:
@templateRegistry.register({ name: 'AiReActAnswerTemplate' })
export class AiReActAnswerTemplate implements ITemplate {
  render() { return [MsgType.TEXT, plainText]; }  // plain text
}

// App layer — override with richtext:
@templateRegistry.register({ name: 'AiReActAnswerTemplate' })
export class AiReActAnswerTemplate implements ITemplate {
  render() { return [MsgType.WECOM_RICHTEXT, richtextAtoms]; }  // richtext with buttons
}
// App registers AFTER package → overrides via Map.set()
```

**Pluggable event routing** (also register-based):
```typescript
// apps/olow-chatbot/src/events.ts — side-effect on import
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
   │   ├── flowRegistry        ← apps/olow-chatbot/src/flows/*.ts
   │   ├── toolRegistry        ← apps/olow-chatbot/src/tools/*.ts
   │   ├── actionchainRegistry ← apps/olow-chatbot/src/actionchains/*.ts
   │   └── messengerRegistry   ← apps/olow-chatbot/src/messengers/*.ts + @olow/messengers (WebBot)
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
// apps/olow-chatbot/src/messengers/slack.messenger.ts
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
| `@olow/types` | zod | Shared enums, Zod schemas, interfaces (zero runtime deps) |
| `@olow/memory` | zod | Per-user memory: context graph, settings, actionchain |
| `@olow/engine` | types, memory, pino, mcp-sdk | Dispatcher, 5 registries, base classes, broker interfaces |
| `@olow/templates` | engine | Default template impls + Templates factory + I18n |
| `@olow/messengers` | engine | Messenger factory + WebBot/Stub impls |
| `@olow/agent-flows` | engine, templates | ReAct pipeline, OCR flow, Navigate flow |

## Quick Start

```bash
npm install
npm run build
cp .env.example .env   # configure API keys
```

## Docker

Each app in `apps/` has its own `Dockerfile` + `docker-compose.yml` and runs independently.

### Build & Run (olow-chatbot)

```bash
cd apps/olow-chatbot

# Build and start (chatbot + mongo + redis)
docker compose up --build -d

# View logs
docker compose logs chatbot -f
```

### Rebuild (clean)

```bash
cd apps/olow-chatbot

# Stop and remove containers
docker compose down

# Remove old images to force full rebuild
docker rmi olow-ts-chatbot-chatbot

# Rebuild and start
docker compose up --build -d
```

### Full Reset (including data)

```bash
cd apps/olow-chatbot

# Stop, remove containers + volumes (MongoDB data, Redis data)
docker compose down -v

# Remove image
docker rmi olow-ts-chatbot-chatbot

# Fresh start
docker compose up --build -d
```

### Test

```bash
# Stream mode (SSE)
curl -N -X POST 'http://localhost:3070/web_bot?mode=stream' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"UserId":"test","content":"hello"}'

# POST mode
curl -X POST 'http://localhost:3070/web_bot?mode=post' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"UserId":"test","content":"what is the wifi password?"}'

# Health check
curl -H 'Authorization: Bearer <token>' http://localhost:3070/engine/status
```

### Port Mapping

| Service | Internal | External |
|---------|----------|----------|
| chatbot | 3000 | 3070 |
| mongo | 27017 | 27020 |
| redis | 6379 | 6381 |

## License

MIT
