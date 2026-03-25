import { MongoClient, ObjectId, type Db, type Collection, type Document } from 'mongodb';
import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();
import { COLLECTIONS, ALL_COLLECTION_NAMES } from './collections.js';
import type { TicketStates } from '@olow/engine';

// ─── Connection ───

const mongoConfig = config.mongo;
const uri =
  mongoConfig.username && mongoConfig.password
    ? `mongodb://${encodeURIComponent(mongoConfig.username)}:${encodeURIComponent(mongoConfig.password)}@${mongoConfig.host}:${mongoConfig.port}/`
    : `mongodb://${mongoConfig.host}:${mongoConfig.port}/`;

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 });
const db: Db = client.db(mongoConfig.database);

// Collection references
const cycles: Collection = db.collection(COLLECTIONS.CYCLES);
const users: Collection = db.collection(COLLECTIONS.USERS);
const systems: Collection = db.collection(COLLECTIONS.SYSTEMS);
const faqs: Collection = db.collection(COLLECTIONS.FAQS);
const tickets: Collection = db.collection(COLLECTIONS.TICKETS);
const externalSystemsSync: Collection = db.collection(COLLECTIONS.EXTERNAL_SYSTEMS_SYNC);
const stats: Collection = db.collection(COLLECTIONS.STATS);
const unmatchedInquiries: Collection = db.collection(COLLECTIONS.UNMATCHED_INQUIRIES);
const schedules: Collection = db.collection(COLLECTIONS.SCHEDULES);

// ─── Initialization ───

export async function initDatabase(): Promise<void> {
  await client.connect();
  logger.info('MongoDB connected');

  const existing = await db.listCollections().toArray();
  const existingNames = new Set(existing.map((c) => c.name));

  for (const name of ALL_COLLECTION_NAMES) {
    if (!existingNames.has(name)) {
      await db.createCollection(name);
      logger.info(`Created collection: ${name}`);
    }
  }

  // Create indexes
  await externalSystemsSync.createIndex({ ticket_id: 1 }, { unique: true });
  await externalSystemsSync.createIndex({ source_system: 1, type: 1 });
  await externalSystemsSync.createIndex({ source_system: 1, type: 1, ticket_reported_by: 1 });
  await externalSystemsSync.createIndex({ ticket_state: 1 });

  await tickets.createIndex({ ticket_id: 1 }, { sparse: true });
  await tickets.createIndex({ groupchat_id: 1 }, { sparse: true });

  await faqs.createIndex({ id: 1 }, { sparse: true });
  await faqs.createIndex({ menu: 1 }, { sparse: true });

  await cycles.createIndex({ requester_type: 1, requester_id: 1 });
  await cycles.createIndex({ requester_id: 1, request_session_id: 1, request_time: -1 });
  await cycles.createIndex({ request_time: -1 });
  await cycles.createIndex({ requester_type: 1, request_action: 1, request_time: -1 });
  await cycles.createIndex({ request_groupchat_id: 1 }, { sparse: true });

  await users.createIndex({ user: 1 }, { unique: true });
  await users.createIndex({ wecom_userid: 1 }, { sparse: true });

  await stats.createIndex({ type: 1 }, { unique: true });
  await schedules.createIndex({ schedule_id: 1 }, { unique: true });

  logger.info('MongoDB indexes created');
}

export async function closeDatabase(): Promise<void> {
  await client.close();
}

// ─── Stats ───

export async function statsGetByType(typeName: string): Promise<Document | null> {
  return stats.findOne({ type: typeName });
}

export async function statsUpsertByType(typeName: string, value: unknown): Promise<void> {
  await stats.updateOne(
    { type: typeName },
    { $set: { type: typeName, updated_time: new Date(), value } },
    { upsert: true },
  );
}

// ─── Cycles ───

export async function cyclesGetOneById(cycleIdStr: string): Promise<Document | null> {
  return cycles.findOne({ _id: new ObjectId(cycleIdStr) });
}

export async function cyclesCreate(params: {
  cycleId: string;
  requesterType: string;
  requesterId: string;
  requestSessionId: string;
  requestMsg: Record<string, unknown>;
  requestAction: string;
  requestContent: string;
  requestTime: Date;
  requestGroupchatId?: string | null;
  deviceType?: string | null;
  responses?: unknown[] | null;
  ticket?: unknown | null;
  isHelpful?: boolean | null;
  clicks?: string[] | null;
  shownFaqs?: unknown[] | null;
  flowStates?: Record<string, unknown> | null;
}): Promise<string> {
  const doc = {
    _id: new ObjectId(params.cycleId),
    requester_type: params.requesterType,
    requester_id: params.requesterId,
    request_session_id: params.requestSessionId,
    request_groupchat_id: params.requestGroupchatId ?? null,
    request_time: params.requestTime,
    request_msg: params.requestMsg,
    request_action: params.requestAction,
    request_content: params.requestContent,
    device_type: params.deviceType ?? null,
    responses: params.responses ?? null,
    ticket: params.ticket ?? null,
    is_helpful: params.isHelpful ?? null,
    clicks: params.clicks ?? null,
    shown_faqs: params.shownFaqs ?? null,
    flow_states: params.flowStates ?? null,
  };
  const result = await cycles.insertOne(doc);
  return result.insertedId.toHexString();
}

export async function cyclesUpdate(
  id: string,
  update: {
    responses?: unknown[];
    ticket?: unknown;
    isHelpful?: boolean;
    shownFaqs?: unknown[];
    clicks?: string[];
    flowStates?: Record<string, unknown>;
  },
): Promise<void> {
  const $set: Record<string, unknown> = {};
  if (update.ticket !== undefined) $set['ticket'] = update.ticket;
  if (update.responses !== undefined) $set['responses'] = update.responses;
  if (update.isHelpful !== undefined) $set['is_helpful'] = update.isHelpful;
  if (update.shownFaqs !== undefined) $set['shown_faqs'] = update.shownFaqs;
  if (update.flowStates !== undefined) $set['flow_states'] = update.flowStates;
  if (update.clicks !== undefined) $set['clicks'] = update.clicks;

  if (Object.keys($set).length > 0) {
    await cycles.updateOne({ _id: new ObjectId(id) }, { $set });
  }
}

export async function cyclesGetRespondedEnterChat(user: string, silentSecs: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - silentSecs * 1000);
  const doc = await cycles.findOne({
    requester_type: 'User',
    $or: [{ request_groupchat_id: null }, { request_groupchat_id: { $exists: false } }],
    requester_id: user,
    request_time: { $gte: cutoff },
    responses: { $ne: null },
  });
  return doc !== null;
}

export async function cyclesGetRecentQueries(user: string): Promise<Array<{ request_content: string; request_time: Date }>> {
  const cutoff = new Date(Date.now() - config.engine.recent_queries_cutoff_seconds * 1000);
  const docs = await cycles
    .find({
      requester_type: 'User',
      $or: [{ request_groupchat_id: null }, { request_groupchat_id: { $exists: false } }],
      requester_id: user,
      request_action: 'query',
      request_time: { $gte: cutoff },
    })
    .sort({ request_time: -1 })
    .limit(3)
    .toArray();

  return docs
    .map((doc) => ({
      request_content: doc['request_content'] as string,
      request_time: doc['request_time'] as Date,
    }))
    .reverse();
}

export async function cyclesGetUserRecentCycles(user: string): Promise<Document[]> {
  const cutoff = new Date(Date.now() - config.engine.recent_queries_cutoff_seconds * 1000);
  return cycles
    .find({
      requester_type: 'User',
      $or: [{ request_groupchat_id: null }, { request_groupchat_id: { $exists: false } }],
      requester_id: user,
      request_action: 'query',
      request_time: { $gte: cutoff },
    })
    .sort({ request_time: -1 })
    .limit(3)
    .toArray();
}

export async function cyclesGetUserSingleChats(params: {
  userId?: string;
  sessionId?: string;
  requestedFrom?: Date;
  requestedTo?: Date;
  cycleIds?: string[];
}): Promise<Document[]> {
  const query: Record<string, unknown> = {
    requester_type: 'User',
    $or: [{ request_groupchat_id: null }, { request_groupchat_id: { $exists: false } }],
    request_action: { $in: ['query', 'click', 'enter_chat'] },
  };
  if (params.userId) query['requester_id'] = params.userId;
  if (params.sessionId) query['request_session_id'] = params.sessionId;
  if (params.cycleIds) query['_id'] = { $in: params.cycleIds.map((id) => new ObjectId(id)) };
  if (params.requestedFrom || params.requestedTo) {
    const timeQuery: Record<string, Date> = {};
    if (params.requestedFrom) timeQuery['$gte'] = params.requestedFrom;
    if (params.requestedTo) timeQuery['$lt'] = params.requestedTo;
    query['request_time'] = timeQuery;
  }
  return cycles.find(query).sort({ request_time: -1 }).toArray();
}

// ─── Users ───

export async function getUser(user: string): Promise<Document | null> {
  return users.findOne({ user });
}

export async function getAllUsers(): Promise<Document[]> {
  return users.find().toArray();
}

export async function getUserByWecomUserid(wecomUserid: string): Promise<Document | null> {
  return users.findOne({ wecom_userid: wecomUserid });
}

export async function getUserBySlackUserid(slackUserid: string): Promise<Document | null> {
  return users.findOne({ slack_userid: slackUserid });
}

export async function upsertUser(
  user: string,
  update: {
    contextBuffer?: Record<string, unknown>;
    wecomUserid?: string;
    slackUserid?: string;
    memoryThreads?: Record<string, unknown>;
    vip?: Record<string, unknown>;
  },
): Promise<void> {
  const $set: Record<string, unknown> = {};
  if (update.contextBuffer !== undefined) $set['context_buffer'] = update.contextBuffer;
  if (update.wecomUserid !== undefined) $set['wecom_userid'] = update.wecomUserid;
  if (update.slackUserid !== undefined) $set['slack_userid'] = update.slackUserid;
  if (update.memoryThreads !== undefined) $set['memory_threads'] = update.memoryThreads;
  if (update.vip !== undefined) $set['vip'] = update.vip;
  if (Object.keys($set).length > 0) {
    await users.updateOne({ user }, { $set }, { upsert: true });
  }
}

export async function upsertUserStatistics(user: string, statistics: Record<string, unknown>): Promise<void> {
  await users.updateOne({ user }, { $set: { statistics } }, { upsert: true });
}

// ─── Systems ───

export async function getSystem(systemName: string): Promise<Document | null> {
  return systems.findOne({ system: systemName });
}

export async function upsertSystem(
  systemName: string,
  tokenBuffer?: { token: string; expiretime: Date },
): Promise<void> {
  const $set: Record<string, unknown> = {};
  if (tokenBuffer) $set['token_buffer'] = tokenBuffer;
  if (Object.keys($set).length > 0) {
    await systems.updateOne({ system: systemName }, { $set }, { upsert: true });
  }
}

// ─── FAQs ───

export async function upsertFaq(
  id: string,
  update: {
    standardQuestion?: string;
    context?: unknown;
    alternativeQuestions?: string[];
    answers?: unknown[];
    menu?: boolean;
  },
): Promise<void> {
  const $set: Record<string, unknown> = {};
  if (update.standardQuestion !== undefined) $set['standard_question'] = update.standardQuestion;
  if (update.context !== undefined) $set['context'] = update.context;
  if (update.alternativeQuestions !== undefined) $set['alternative_questions'] = update.alternativeQuestions;
  if (update.answers !== undefined) $set['answers'] = update.answers;
  if (update.menu !== undefined) $set['menu'] = update.menu;
  if (Object.keys($set).length > 0) {
    await faqs.updateOne({ id }, { $set }, { upsert: true });
  }
}

export async function getFaq(id: string): Promise<Document | null> {
  return faqs.findOne({ id });
}

export async function getFaqs(ids: string[]): Promise<Document[]> {
  return faqs.find({ id: { $in: ids } }).toArray();
}

export async function deleteAllFaqs(): Promise<void> {
  await faqs.deleteMany({});
}

export async function getAllFaqIds(): Promise<string[]> {
  const docs = await faqs.find({}, { projection: { id: 1, _id: 0 } }).toArray();
  return docs.map((d) => d['id'] as string);
}

export async function deleteFaqWithIds(idList: string[]): Promise<void> {
  await faqs.deleteMany({ id: { $in: idList } });
}

export async function getFaqsOnMenu(): Promise<Document[]> {
  return faqs.find({ menu: true }).toArray();
}

export async function getAllFaqs(): Promise<Document[]> {
  return faqs.find().toArray();
}

// ─── Tickets ───

export async function getAllTickets(): Promise<Document[]> {
  return tickets.find().toArray();
}

export async function getTicket(ticketId: string): Promise<Document | null> {
  return tickets.findOne({ ticket_id: ticketId });
}

export async function getTicketsByGroupchatId(groupchatId: string): Promise<Document[]> {
  return tickets.find({ groupchat_id: groupchatId }).toArray();
}

export async function createTicket(params: {
  ticketId: string;
  groupchatId?: string | null;
  fromCycleId?: string | null;
  initialResponse?: string | null;
  ticketTitle?: string | null;
  ticketDesc?: string | null;
  createTime?: Date | null;
  ticketUser?: string | null;
  assignedTo?: string | null;
  assignedPic?: string | null;
  assignedTime?: Date | null;
  agentRequestCount?: number | null;
  state?: TicketStates | null;
}): Promise<string> {
  const result = await tickets.insertOne({
    ticket_id: params.ticketId,
    groupchat_id: params.groupchatId ?? null,
    from_cycle_id: params.fromCycleId ?? null,
    initial_response: params.initialResponse ?? null,
    ticket_title: params.ticketTitle ?? null,
    ticket_desc: params.ticketDesc ?? null,
    create_time: params.createTime ?? null,
    ticket_user: params.ticketUser ?? null,
    assigned_to: params.assignedTo ?? null,
    assigned_pic: params.assignedPic ?? null,
    assigned_time: params.assignedTime ?? null,
    agent_request_count: params.agentRequestCount ?? null,
    state: params.state ?? null,
  });
  return result.insertedId.toHexString();
}

export async function upsertTicket(
  ticketId: string,
  update: Record<string, unknown>,
): Promise<void> {
  const $set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) {
      $set[key] = value === '' ? null : value;
    }
  }
  if (Object.keys($set).length > 0) {
    await tickets.updateOne({ ticket_id: ticketId }, { $set }, { upsert: true });
  }
}

// ─── External Systems Sync ───

export async function upsertExternalSystemsSync(syncData: Record<string, unknown>): Promise<void> {
  const required = ['source_system', 'type', 'sync_time'];
  const missing = required.filter((f) => !(f in syncData));
  if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);

  const query =
    syncData['type'] === 'ticket'
      ? { ticket_id: syncData['ticket_id'] }
      : { source_system: syncData['source_system'], type: syncData['type'] };

  await externalSystemsSync.updateOne(query, { $set: syncData }, { upsert: true });
}

export async function getUserAssociatedTicketsFromExternalSync(rtx: string): Promise<Document[]> {
  return externalSystemsSync
    .find({
      source_system: 'servicenow',
      type: 'ticket',
      ticket_reported_by: rtx,
      ticket_state: { $ne: '7' },
    })
    .toArray();
}

// ─── Unmatched Inquiries ───

export async function insertUnmatchedInquiry(
  userId: string,
  userInquiry: string,
  requestTime: Date,
): Promise<string> {
  const result = await unmatchedInquiries.insertOne({
    user_id: userId,
    user_inquiry: userInquiry,
    request_time: requestTime,
    standard_inquiry: null,
    analysis_time: null,
    snow_sync_hash: null,
    snow_sync_status: null,
  });
  return result.insertedId.toHexString();
}

export async function getAllUnmatchedInquiries(): Promise<Document[]> {
  return unmatchedInquiries.find().toArray();
}

export async function updateUnmatchedInquiry(inquiry: Document): Promise<void> {
  await unmatchedInquiries.updateOne(
    { _id: inquiry['_id'] },
    {
      $set: {
        user_id: inquiry['user_id'],
        user_inquiry: inquiry['user_inquiry'],
        request_time: inquiry['request_time'],
        standard_inquiry: inquiry['standard_inquiry'],
        analysis_time: inquiry['analysis_time'],
        snow_sync_status: inquiry['snow_sync_status'],
        snow_sync_time: inquiry['snow_sync_time'],
        snow_sync_hash: inquiry['snow_sync_hash'],
        snow_sync_ermsg: inquiry['snow_sync_ermsg'],
      },
    },
  );
}

// ─── Schedules ───

export async function upsertSchedule(
  scheduleId: string,
  scheduleType: string,
  scheduleDetails: Record<string, unknown>,
  createTime: Date,
): Promise<void> {
  await schedules.updateOne(
    { schedule_id: scheduleId },
    { $set: { schedule_type: scheduleType, schedule_details: scheduleDetails, create_time: createTime } },
    { upsert: true },
  );
}

export async function deleteSchedule(scheduleId: string): Promise<boolean> {
  const result = await schedules.deleteOne({ schedule_id: scheduleId });
  return result.deletedCount > 0;
}

export async function getAllSchedules(): Promise<Document[]> {
  return schedules.find().toArray();
}

export async function getSchedule(scheduleId: string): Promise<Document | null> {
  return schedules.findOne({ schedule_id: scheduleId });
}

export async function setScheduleComplete(scheduleId: string): Promise<void> {
  await schedules.updateOne({ schedule_id: scheduleId }, { $set: { complete: true } });
}
