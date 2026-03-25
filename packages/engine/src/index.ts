// ═══════════════════ @olow/engine — Public API ═══════════════════

// Builder
export { OlowEngine, OlowEngineInstance, type MessengerFactory } from './olow.js';

// Core
export { Dispatcher, setDispatcherConfig, type DispatcherEngineConfig } from './dispatcher.js';
export {
  Event, EventChain, Request, ResponseChain, SystemRequester,
  registerSystemActionParser, registerEventRouter,
  type FlowMsg, type StreamDeltaFlowMsg, type UniversalResponse, type IUser,
  type SystemActionParser, type EventRouter,
} from './events.js';

// Registry
export { ModuleRegistry, flowRegistry, toolRegistry, actionchainRegistry, setSpace, getSpace } from './registry.js';

// Base Classes
export { BaseFlow, type IDispatcher } from './base-flow.js';
export { BaseTool, type ToolTag, type ToolResult, type ToolParameter } from './base-tool.js';
export { BaseActionChain, UnexpectedInputException, NoActiveException, type IDispatcherForChain } from './base-actionchain.js';
export type { ITemplate } from './base-template.js';

// Broker Interfaces
export type {
  IBroker, ILlmProvider, IMessagingProvider, LlmCallOpts,
  CycleCreateParams, CycleUpdateParams,
} from './broker-interfaces.js';

// Messenger Interface
export type { IMessenger, RequestInitResult, SayResult } from './messengers.js';

// Types (all const-enums and Zod schemas)
export {
  ResponseMode, SpaceType, RequesterType, UserIdType, ChannelType,
  SystemName, SiteName, MessengerType, SentToType, MsgType, FlowMsgType,
  EventType, CoreEventType, EventStatus, ActionType, CoreActionType, ToolArgumentType, Language, TicketStates,
  FunctionCallPredictionMode, ACTION_CHAIN_ROOT_KEY,
  ReActStatesSchema, FlowStatesSchema, DecodedMsgSchema, StreamDeltaMsgSchema,
  BotEngineStreamOutputSchema, MessageQueue,
} from './types.js';
export type {
  ReActStates, FlowStates, DecodedMsg, StreamDeltaMsg,
  BotEngineStreamOutput, MediaItem,
} from './types.js';

// Content Blocks
export { ContentBlocks, determineActionType } from './content-blocks.js';

// Memory
export {
  Memory, setMemoryConfig, setMemoryStorage,
  type MemoryConfig, type IMemoryStorage,
  type MemoryContextGraph, type MemoryActionChain, type MemorySettings,
} from './memory/index.js';

// Context
export { requestContext, getContext, runWithContext, type RequestContext } from './context.js';

// Config
export { engineConfigSchema, type EngineConfig, mcpServerConfigSchema, type McpServerConfig } from './config.js';

// Logger
export { createLogger, setLogger, getLogger, type LoggerConfig } from './logger.js';

// User
export { User } from './user.js';

// Tool Matcher
export { matchTools } from './tool-matcher.js';

// Kits (utilities)
export * as promptKit from './prompt.kit.js';
export { StructuralStreamParser, Section } from './stream-parser.js';
export { textAtom, linkAtom, atAtom, buildRichtext, truncateForWecom, type RichtextAtom } from './format.kit.js';
export { xmlToDict, deepMerge, dedup, truncate, bytesLength } from './logic.kit.js';

// MCP
export { toolTagToMcpSchema, mcpSchemaToToolParameters } from './mcp/schema-adapter.js';
export { McpToolProxy } from './mcp/proxy.js';
