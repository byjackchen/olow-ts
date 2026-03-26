import type { IBroker } from './broker-interfaces.js';
import { engineConfigSchema, type EngineConfig } from './config.js';
import type { MessengerType, ResponseMode, RequesterType, SystemName, BotEngineStreamOutput } from './types.js';
import { Dispatcher, setDispatcherConfig } from './dispatcher.js';
import { flowRegistry, toolRegistry, actionchainRegistry, messengerRegistry, templateRegistry } from './registry.js';
import { createLogger, setLogger } from './logger.js';
import { setMemoryConfig, setMemoryStorage } from './memory/index.js';
import { BaseFlow } from './base-flow.js';
import { BaseTool } from './base-tool.js';
import { McpToolProxy } from './mcp/proxy.js';

// ─── OlowEngine Builder ───

export class OlowEngine {
  private _broker?: IBroker;
  private _config?: EngineConfig;
  private _flowDirs: string[] = [];
  private _toolDirs: string[] = [];
  private _actionchainDirs: string[] = [];
  private _messengerDirs: string[] = [];
  private _templateDirs: string[] = [];
  private _mcpProxy: McpToolProxy | null = null;

  static create(): OlowEngine {
    return new OlowEngine();
  }

  withBroker(broker: IBroker): this {
    this._broker = broker;
    return this;
  }

  withConfig(config: Record<string, unknown>): this {
    this._config = engineConfigSchema.parse(config);
    return this;
  }

  addFlowDir(dir: string): this {
    this._flowDirs.push(dir);
    return this;
  }

  addToolDir(dir: string): this {
    this._toolDirs.push(dir);
    return this;
  }

  addActionChainDir(dir: string): this {
    this._actionchainDirs.push(dir);
    return this;
  }

  addMessengerDir(dir: string): this {
    this._messengerDirs.push(dir);
    return this;
  }

  addTemplateDir(dir: string): this {
    this._templateDirs.push(dir);
    return this;
  }

  // Programmatic registration (alternative to directory scanning)
  registerFlow(name: string, flowClass: typeof BaseFlow): this {
    flowRegistry.add(name, flowClass);
    return this;
  }

  registerTool(name: string, toolClass: typeof BaseTool): this {
    toolRegistry.add(name, toolClass);
    return this;
  }

  registerActionChain(name: string, chainClass: unknown): this {
    actionchainRegistry.add(name, chainClass);
    return this;
  }

  async initialize(): Promise<OlowEngineInstance> {
    if (!this._broker) throw new Error('OlowEngine: broker is required. Call withBroker().');

    const config = this._config;

    // 1. Initialize logger
    if (config?.logging) {
      const isDev = process.env['NODE_ENV'] !== 'production';
      const l = createLogger({
        app_log_path: config.logging.app_log_path,
        base_log_level: config.logging.base_log_level,
        isDev,
      });
      setLogger(l);
    }

    // 2. Configure dispatcher
    if (config) {
      setDispatcherConfig({
        max_event_loops: config.max_event_loops,
        post_msg_verbose: config.post_msg_verbose,
        developers: config.developers,
        administrators: config.administrators,
      });
    }

    // 3. Configure memory
    if (config?.memory) {
      setMemoryConfig(config.memory);
    }
    setMemoryStorage(this._broker!);

    // 4. Initialize broker
    await this._broker.initialize();

    // 5. Discover modules
    for (const dir of this._flowDirs) {
      await flowRegistry.discoverModules(dir);
    }
    for (const dir of this._toolDirs) {
      await toolRegistry.discoverModules(dir);
    }
    for (const dir of this._actionchainDirs) {
      await actionchainRegistry.discoverModules(dir);
    }
    for (const dir of this._messengerDirs) {
      await messengerRegistry.discoverModules(dir);
    }
    for (const dir of this._templateDirs) {
      await templateRegistry.discoverModules(dir);
    }

    // 6. MCP client proxy
    if (config?.mcp_client?.enabled && config.mcp_client.servers.length > 0) {
      this._mcpProxy = new McpToolProxy();
      const mcpTools = await this._mcpProxy.connectServers(config.mcp_client.servers);
      for (const [name, toolClass] of mcpTools) {
        toolRegistry.add(name, toolClass);
      }
    }

    return new OlowEngineInstance(this._broker, this._mcpProxy);
  }
}

// ─── OlowEngine Instance ───

export class OlowEngineInstance {
  readonly broker: IBroker;
  private mcpProxy: McpToolProxy | null;

  constructor(broker: IBroker, mcpProxy: McpToolProxy | null = null) {
    this.broker = broker;
    this.mcpProxy = mcpProxy;
  }

  async *processRequest(opts: {
    responseMode: ResponseMode;
    messengerType?: MessengerType;
    requesterType?: RequesterType;
    inMsg?: Record<string, unknown>;
    systemName?: SystemName;
  }): AsyncGenerator<BotEngineStreamOutput> {
    yield* Dispatcher.asyncDispatch({
      broker: this.broker,
      ...opts,
    });
  }

  async shutdown(): Promise<void> {
    if (this.mcpProxy) {
      await this.mcpProxy.shutdown();
    }
    await this.broker.shutdown();
  }
}
