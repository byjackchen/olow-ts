import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();

const WECOM_API = 'https://qyapi.weixin.qq.com/cgi-bin';

// ─── Token ───

export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export async function getToken(corpId: string, corpSecret: string): Promise<TokenResponse> {
  const url = `${WECOM_API}/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as Record<string, unknown>;
  if (data['errcode'] !== 0) {
    throw new Error(`WeCom getToken failed: ${data['errmsg']}`);
  }
  return { access_token: data['access_token'] as string, expires_in: data['expires_in'] as number };
}

// ─── Send Messages ───

export async function sendSingleText(token: string, toUser: string, content: string): Promise<void> {
  const resp = await fetch(`${WECOM_API}/message/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'text',
      agentid: config.wecom_bot.service_id,
      text: { content },
    }),
  });
  const data = (await resp.json()) as Record<string, unknown>;
  if (data['errcode'] === 40014 || data['errcode'] === 42001) {
    throw new AccessTokenError(`WeCom access token invalid: ${data['errmsg']}`);
  }
  if (data['errcode'] !== 0) {
    logger.error({ msg: 'WeCom sendSingleText failed', data });
  }
}

export async function sendSingleRichtext(token: string, toUser: string, content: unknown): Promise<void> {
  const resp = await fetch(`${WECOM_API}/message/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'markdown',
      agentid: config.wecom_bot.service_id,
      markdown: { content },
    }),
  });
  const data = (await resp.json()) as Record<string, unknown>;
  if (data['errcode'] === 40014 || data['errcode'] === 42001) {
    throw new AccessTokenError(`WeCom access token invalid: ${data['errmsg']}`);
  }
}

export async function sendGroupText(token: string, chatId: string, content: string): Promise<void> {
  const resp = await fetch(`${WECOM_API}/appchat/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatid: chatId,
      msgtype: 'text',
      text: { content },
    }),
  });
  const data = (await resp.json()) as Record<string, unknown>;
  if (data['errcode'] === 40014 || data['errcode'] === 42001) {
    throw new AccessTokenError(`WeCom access token invalid: ${data['errmsg']}`);
  }
}

// ─── User Resolution ───

export async function getRtx(
  token: string,
  wecomUserId: string,
): Promise<{ user_list: Array<Record<string, string>> }> {
  const resp = await fetch(`${WECOM_API}/user/getuserid?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: wecomUserId }),
  });
  const data = (await resp.json()) as Record<string, unknown>;
  return data as { user_list: Array<Record<string, string>> };
}

// ─── File Operations ───

export async function sendSingleFile(token: string, toUser: string, mediaId: string): Promise<void> {
  await fetch(`${WECOM_API}/message/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'file',
      agentid: config.wecom_bot.service_id,
      file: { media_id: mediaId },
    }),
  });
}

export async function sendSingleImage(token: string, toUser: string, mediaId: string): Promise<void> {
  await fetch(`${WECOM_API}/message/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'image',
      agentid: config.wecom_bot.service_id,
      image: { media_id: mediaId },
    }),
  });
}

// ─── Group Management ───

export async function createGroupChat(
  token: string,
  name: string,
  userList: string[],
): Promise<{ chatid: string }> {
  const resp = await fetch(`${WECOM_API}/appchat/create?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, userlist: userList }),
  });
  const data = (await resp.json()) as Record<string, unknown>;
  return { chatid: data['chatid'] as string };
}

export async function getGroupchatUsers(
  token: string,
  chatId: string,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${WECOM_API}/appchat/get?access_token=${token}&chatid=${chatId}`);
  return (await resp.json()) as Record<string, unknown>;
}

export async function updateGroupchatUsers(
  token: string,
  chatId: string,
  addUsers?: string[],
  removeUsers?: string[],
): Promise<void> {
  const body: Record<string, unknown> = { chatid: chatId };
  if (addUsers) body['add_user_list'] = addUsers;
  if (removeUsers) body['del_user_list'] = removeUsers;
  await fetch(`${WECOM_API}/appchat/update?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── File Download ───

export async function getFileInMemory(token: string, mediaId: string): Promise<Buffer> {
  const url = `${WECOM_API}/media/get?access_token=${token}&media_id=${encodeURIComponent(mediaId)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`WeCom getFile error ${resp.status}`);
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ─── Richtext (Tencent Chat API) ───

export async function sendSingleRichtextAtoms(token: string, rtx: string, richtext: unknown[]): Promise<void> {
  const url = `https://in.qyapi.weixin.qq.com/cgi-bin/tencent/chat/send?access_token=${token}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      receiver: { type: 'single', id: rtx },
      msgtype: 'rich_text',
      rich_text: richtext,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    const errCode = JSON.parse(text)?.['errcode'];
    if (errCode === 40014 || errCode === 42001) throw new AccessTokenError(text);
    throw new Error(`WeCom sendRichtext error ${resp.status}: ${text}`);
  }
}

// ─── Errors ───

export class AccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessTokenError';
  }
}
