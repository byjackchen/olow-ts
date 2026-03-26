import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { config } from './config/index.js';
import {
  OlowEngine, getLogger,
  ResponseMode, MessengerType, RequesterType, SystemName,
  type BotEngineStreamOutput,
} from '@olow/engine';
import { Messenger } from '@olow/messengers';
import { Broker } from './engine/broker.js';
import { setReactAgentConfig } from '@olow/react-agent';
import './messengers/wecom.messenger.js'; // registers WeComMessenger + WeComGroupBotMessenger
import './events.js'; // registers system action parsers and event routers

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Agents ───

setReactAgentConfig({
  intent_mode: config.engine.react_agent.intent_mode,
  max_rounds: config.engine.react_agent.max_rounds,
  specialized_score_threshold: config.engine.react_agent.retrieval_threshold,
});

// ─── Bootstrap ───

async function start(): Promise<void> {
  const engine = await OlowEngine.create()
    .withConfig(config.engine)
    .withBroker(Broker.getInstance())
    .withMessengerFactory(Messenger.create)
    .addFlowDir(join(__dirname, 'flows'))
    .addToolDir(join(__dirname, 'tools'))
    .addActionChainDir(join(__dirname, 'actionchains'))
    .initialize();

  const logger = getLogger();

  // ─── Routes ───

  const app = Fastify({ logger: false });

  app.addHook('onClose', async () => {
    await engine.shutdown();
  });

  const verifyToken = async (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ): Promise<void> => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ') || auth.slice(7) !== config.auth.api_token) {
      reply.code(401).send({ error: 'Invalid authentication credentials' });
    }
  };

  app.get('/engine/status', { preHandler: verifyToken }, async () => ({
    version: config.version,
    status: 'ok',
    environment: config.env,
    utc_time: new Date().toISOString(),
    message: 'Olow Chatbot Engine is running!',
  }));

  app.post('/web_bot', { preHandler: verifyToken }, async (request, reply) => {
    const mode = (request.query as Record<string, string>)?.['mode'] ?? 'stream';
    const body = request.body as Record<string, unknown>;

    const gen = engine.processRequest({
      responseMode: mode === 'stream' ? ResponseMode.STREAM : ResponseMode.POST,
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
      for await (const output of gen) {
        reply.raw.write(`data: ${JSON.stringify(output)}\n\n`);
      }
      reply.raw.end();
      return reply;
    }

    return reply.send(await consumeBlock(gen));
  });

  app.post('/wecom_bot', async (request, reply) => {
    void consumeBackground(engine.processRequest({
      responseMode: ResponseMode.POST,      messengerType: MessengerType.WECOM_BOT, requesterType: RequesterType.USER,
      inMsg: request.body as Record<string, unknown>,
    }));
    return reply.send('');
  });

  app.post('/slack_bot', { preHandler: verifyToken }, async (request, reply) => {
    void consumeBackground(engine.processRequest({
      responseMode: ResponseMode.POST,      messengerType: MessengerType.SLACK_BOT, requesterType: RequesterType.USER,
      inMsg: request.body as Record<string, unknown>,
    }));
    return reply.send({});
  });

  app.post('/midserver', async (request, reply) => {
    return reply.send(await consumeBlock(engine.processRequest({
      responseMode: ResponseMode.POST,      messengerType: MessengerType.WECOM_BOT, requesterType: RequesterType.SYSTEM,
      systemName: SystemName.SERVICENOW,
      inMsg: request.body as Record<string, unknown>,
    })));
  });

  app.post('/services', { preHandler: verifyToken }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (typeof body['domain'] !== 'string' || !['ticket', 'user', 'notification'].includes(body['domain'])) {
      return reply.code(400).send({ error: "'domain' must be 'ticket', 'user', or 'notification'" });
    }

    const states = await consumeBlock(engine.processRequest({
      responseMode: ResponseMode.POST,      messengerType: MessengerType.WECOM_BOT, requesterType: RequesterType.SYSTEM,
      systemName: SystemName.DEFAULTSYS, inMsg: body,
    })) as Record<string, unknown>;

    return reply.send(states?.['service_response'] ?? { status: 'success' });
  });

  // ─── Start ───

  const address = await app.listen({ host: config.server.host, port: config.server.port });
  logger.info(`Olow-ts started on ${address}`);
}

// ─── Helpers ───

async function consumeBlock(gen: AsyncGenerator<BotEngineStreamOutput>): Promise<unknown> {
  let states: unknown = {};
  for await (const output of gen) {
    if (output.type === 'states') states = output.data;
  }
  return states;
}

async function consumeBackground(gen: AsyncGenerator<BotEngineStreamOutput>): Promise<void> {
  for await (const _ of gen) { /* side-effects only */ }
}

start().catch((err) => {
  getLogger().error(err, 'Failed to start');
  process.exit(1);
});
