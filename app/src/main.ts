import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { config } from './config/index.js';
import { createLogger, setLogger } from '@olow/engine';

// Initialize logger at startup — must happen before any engine import uses it
const logger = createLogger({
  app_log_path: config.engine.logging.app_log_path,
  base_log_level: config.engine.logging.base_log_level,
  isDev: config.env === 'LOCAL' || config.env === 'LOCAL_DOCKER',
});
setLogger(logger);
import { Broker } from './engine/broker.js';
import { setMemoryConfig, setMemoryStorage } from '@olow/engine';
import * as mongo from './storage/mongo.js';
import { Dispatcher, setDispatcherConfig } from '@olow/engine';
import { flowRegistry, toolRegistry, actionchainRegistry, setSpace } from '@olow/engine';
import { ResponseMode, MessengerType, RequesterType, SystemName } from '@olow/engine';
import { setReactTemplateProvider, initReactAgent } from '@olow/react-agent';
import { setNavigateTemplateFactory } from '@olow/navigate-agent';
import { AiIdleTemplate, AiReActAnswerTemplate, type Recommendation } from './templates/ai.template.js';
import { TextTemplate } from './templates/text.template.js';
import { I18n } from './templates/i18n.js';

// Wire react agent templates
setReactTemplateProvider({
  aiIdle: (text) => new AiIdleTemplate([text]),
  text: (lines) => new TextTemplate(lines),
  aiReActAnswer: (opts) => new AiReActAnswerTemplate({ ...opts, recommendations: opts.recommendations as Recommendation[] }),
  i18n: {
    AI_INTENT: I18n.AI_INTENT,
    AI_REACT_PLAN: I18n.AI_REACT_PLAN,
    AI_REACT_ACT: I18n.AI_REACT_ACT,
    NO_ANSWER_FALLBACK: I18n.NO_ANSWER_FALLBACK,
  },
});
initReactAgent({
  intent_mode: config.engine.react_agent.intent_mode,
  max_rounds: config.engine.react_agent.max_rounds,
});

// Wire navigate agent templates
setNavigateTemplateFactory((lines) => new TextTemplate(lines));

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── App ───

const app = Fastify({
  logger: false, // We use our own Pino logger
});

// ─── Broker Lifecycle ───

let broker: Broker;

app.addHook('onReady', async () => {
  broker = Broker.getInstance();
  await broker.initialize();

  // Wire engine subsystems
  setDispatcherConfig({
    max_event_loops: config.engine.max_event_loops,
    post_msg_verbose: config.engine.post_msg_verbose,
    developers: config.engine.developers,
    administrators: config.engine.administrators,
  });
  setMemoryConfig(config.engine.memory);
  setMemoryStorage({
    getUser: (userId) => mongo.getUser(userId) as Promise<Record<string, unknown> | null>,
    upsertUser: (userId, data) => mongo.upsertUser(userId, data),
  });

  logger.info('Broker initialized');
});

app.addHook('onClose', async () => {
  await broker.shutdown();
  logger.info('Broker shut down');
});

// ─── Auth Hook ───

async function verifyBearerToken(
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = auth.slice(7);
  if (token !== config.auth.api_token) {
    reply.code(401).send({ error: 'Invalid authentication credentials' });
    return;
  }
}

// ─── Routes ───

app.get('/engine/status', { preHandler: verifyBearerToken }, async () => {
  return {
    version: config.version,
    status: 'ok',
    environment: config.env,
    utc_time: new Date().toISOString(),
    message: 'Olow Chatbot Engine is running!',
  };
});

app.post<{ Querystring: { mode?: 'async' | 'block' | 'stream' } }>(
  '/web_bot',
  { preHandler: verifyBearerToken },
  async (request, reply) => {
    const mode = request.query.mode ?? 'stream';
    const body = request.body as Record<string, unknown>;
    logger.info({ msg: 'Received Web Bot request', mode, body });

    try {
      const asyncGen = Dispatcher.asyncMain({
        broker,
        responseMode: mode === 'stream' ? ResponseMode.STREAM : ResponseMode.POST,
        space: config.space,
        messengerType: MessengerType.WEB_BOT,
        requesterType: RequesterType.USER,
        inMsg: body,
      });

      if (mode === 'stream') {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        });

        for await (const output of asyncGen) {
          const json = JSON.stringify(output);
          logger.info({ msg: 'Web Bot Stream Output', json });
          reply.raw.write(`data: ${json}\n\n`);
        }
        reply.raw.end();
        return reply;
      } else {
        // Block mode: consume all outputs and return final states
        let states: unknown = {};
        for await (const output of asyncGen) {
          if (output.type === 'states') states = output.data;
        }
        return reply.send(states);
      }
    } catch (err) {
      logger.error({ msg: 'Failed to process Web Bot request', err });
      return reply.send('');
    }
  },
);

app.post('/wecom_bot', async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  logger.info({ msg: 'Received WeCom Bot request', body });

  try {
    const asyncGen = Dispatcher.asyncMain({
      broker,
      responseMode: ResponseMode.POST,
      space: config.space,
      messengerType: MessengerType.WECOM_BOT,
      requesterType: RequesterType.USER,
      inMsg: body,
    });

    // Fire-and-forget: consume the generator in the background
    void (async () => {
      for await (const _output of asyncGen) {
        // consumed for side-effects (posting messages)
      }
    })();

    return reply.send('');
  } catch (err) {
    logger.error({ msg: 'Failed to process WeCom Bot request', err });
    return reply.send('');
  }
});

app.post<{ Querystring: { mode?: 'async' | 'block' | 'stream' } }>(
  '/slack_bot',
  { preHandler: verifyBearerToken },
  async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    logger.info({ msg: 'Received Slack Bot request', body });

    try {
      const asyncGen = Dispatcher.asyncMain({
        broker,
        responseMode: ResponseMode.POST,
        space: config.space,
        messengerType: MessengerType.SLACK_BOT,
        requesterType: RequesterType.USER,
        inMsg: body,
      });

      // Fire-and-forget: consume the generator in the background
      void (async () => {
        for await (const _output of asyncGen) {
          // consumed for side-effects (posting messages)
        }
      })();

      return reply.send({});
    } catch (err) {
      logger.error({ msg: 'Failed to process Slack Bot request', err });
      return reply.send({});
    }
  },
);

app.post<{ Querystring: { mode?: 'async' | 'block' | 'stream' } }>(
  '/midserver',
  async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    logger.info({ msg: 'Received Midserver request', body });

    try {
      const asyncGen = Dispatcher.asyncMain({
        broker,
        responseMode: ResponseMode.POST,
        space: config.space,
        messengerType: MessengerType.WECOM_BOT,
        requesterType: RequesterType.SYSTEM,
        systemName: SystemName.SERVICENOW,
        inMsg: body,
      });

      // Block mode: consume all outputs and return final states
      let states: any = {};
      for await (const output of asyncGen) {
        if (output.type === 'states') states = output.data;
      }
      return reply.send(states);
    } catch (err) {
      logger.error({ msg: 'Failed to process Midserver request', err });
      return reply.send({ status: 'received' });
    }
  },
);

app.post(
  '/services',
  { preHandler: verifyBearerToken },
  async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    logger.info({ msg: 'Received Services request', body });

    // Validate domain
    const domain = body['domain'];
    if (typeof domain !== 'string' || !['ticket', 'user', 'notification'].includes(domain)) {
      return reply.code(400).send({
        error: "Invalid Payload: 'domain' field must be 'ticket', 'user', or 'notification'",
      });
    }
    if (typeof body['action'] !== 'string') {
      return reply.code(400).send({ error: "Invalid Payload: 'action' field must be a string" });
    }
    if (typeof body['parameters'] !== 'object' || body['parameters'] === null) {
      return reply.code(400).send({
        error: "Invalid Payload: 'parameters' field must be a dictionary",
      });
    }

    try {
      const asyncGen = Dispatcher.asyncMain({
        broker,
        responseMode: ResponseMode.POST,
        space: config.space,
        messengerType: MessengerType.WECOM_BOT,
        requesterType: RequesterType.SYSTEM,
        systemName: SystemName.DEFAULTSYS,
        inMsg: body,
      });

      // Block mode: consume all outputs and return final states
      let states: any = {};
      for await (const output of asyncGen) {
        if (output.type === 'states') states = output.data;
      }
      return reply.send(states.service_response ?? { status: 'success', message: 'Service request processed' });
    } catch (err) {
      logger.error({ msg: 'Failed to process Services request', err });
      return reply.send({ status: 'success', message: 'Service request processed' });
    }
  },
);

// ─── Start ───

async function start(): Promise<void> {
  // Set space before discovery so restrictedSpaces filtering works
  setSpace(config.space);

  // Auto-discover and register flows, tools, and actionchains
  await flowRegistry.discoverModules(join(__dirname, 'flows'));
  await toolRegistry.discoverModules(join(__dirname, 'tools'));
  await actionchainRegistry.discoverModules(join(__dirname, 'actionchains'));
  logger.info('Modules discovered');

  try {
    const address = await app.listen({
      host: config.server.host,
      port: config.server.port,
    });
    logger.info(`Olow-ts started on ${address}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
