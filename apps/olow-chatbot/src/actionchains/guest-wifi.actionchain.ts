import {
  BaseActionChain, actionchainRegistry, getLogger,
  EventStatus, ACTION_CHAIN_ROOT_KEY,
  type ToolTag,
} from '@olow/engine';
import { BaseTool, toolRegistry } from '@olow/engine';
import type { Event, ToolResult } from '@olow/engine';
import { Templates } from '@olow/templates';
import { MsgType } from '@olow/engine';
import * as servicenow from '../services/servicenow.api.js';
import type { GuestWifiInfo } from '../services/servicenow.api.js';

const logger = getLogger();
const MAIN_KEY = `${ACTION_CHAIN_ROOT_KEY}-guestwifi`;

// ─── Tool Registration (so ReAct agent can discover it) ───

@toolRegistry.register({ name: MAIN_KEY })
class GuestWifiTool extends BaseTool {
  static readonly toolTag: ToolTag = {
    name: MAIN_KEY,
    labelName: 'Guest WiFi',
    isSpecialized: true,
    mcpExposable: false,
    actionchainMainKey: MAIN_KEY,
    description: 'Provide Guest Wifi access (username and password) for any office location.',
    parameters: {},
    intentHints: [
      'guest wifi', 'guest wifi password', 'wifi password', 'wifi guest password',
      'office guest wifi', 'Palo Alto wifi', 'Playa Vista wifi', 'Singapore wifi',
      '访客网络', '访客网络密码', '办公室访客网络', 'Guest Wifi密码',
      '新加坡Guest Wifi', '网络密码', '无线网络', '如何连接 Guest Wifi',
    ],
  };

  static async run(): Promise<ToolResult> {
    return { success: true };
  }
}

// ─── ActionChain ───

@actionchainRegistry.register({ name: MAIN_KEY })
export class GuestWifiActionChain extends BaseActionChain {
  static readonly mainKey = MAIN_KEY;
  static readonly title = 'Fetch Guest WiFi';
  static readonly officeLocation = 'US-California-Palo Alto';

  async run(): Promise<EventStatus> {
    logger.info(`GuestWifiActionChain for user ${(this.dispatcher.request as { requester: { id: string } }).requester.id}`);

    let wifiList: GuestWifiInfo[];
    try {
      wifiList = await servicenow.getGuestWifis();
    } catch (err) {
      logger.error({ msg: 'Failed to retrieve Guest WiFi from ServiceNow', err });
      return EventStatus.FAILED;
    }

    const info = wifiList.find((g) => g.campus_name === GuestWifiActionChain.officeLocation);
    if (!info) {
      logger.error(`Guest WiFi info not found for: ${GuestWifiActionChain.officeLocation}`);
      return EventStatus.FAILED;
    }

    // Detect language from memory
    const lang = this.detectLanguage();

    // Send WiFi info
    const cycleId = (this.dispatcher as { cycleId?: string }).cycleId ?? '';
    await this.event.propagateMsg(
      Templates.create('GuestWifiTemplate', {
        ssid: info.ssid,
        password: info.password,
        expired_date: info.expired_date,
        cycleId,
        title: GuestWifiActionChain.title,
        lang,
      }),
    );

    // Generate and send QR code
    const qrBase64 = await generateWifiQrSvg(info.ssid, info.password);
    await this.event.propagateMsg(
      Templates.create('SingleMediaTemplate', {
        mediaType: MsgType.IMAGE,
        mediaName: 'guest_wifi_qrcode.svg',
        mediaBase64: qrBase64,
      }),
    );

    return EventStatus.COMPLETE;
  }

  private detectLanguage(): 'cn' | 'en' | undefined {
    // Access language from dispatcher states if available
    const request = this.dispatcher.request as { language?: string };
    if (request.language === 'cn' || request.language === 'en') return request.language;
    return undefined;
  }
}

// ─── QR Code Generator ───

async function generateWifiQrSvg(ssid: string, password: string): Promise<string> {
  const QRCode = await import('qrcode');
  const payload = `WIFI:T:WPA;S:${ssid};P:${password};;`;
  const svg = await QRCode.toString(payload, { type: 'svg', margin: 2, width: 256 });
  return Buffer.from(svg).toString('base64');
}
