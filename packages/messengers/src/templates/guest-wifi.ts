import { MsgType } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { i18n } from './i18n.js';

const GUEST_WIFI_TITLE = i18n({
  en: '🌐 Guest WiFi Access',
  cn: '🌐 访客 WiFi 信息',
});

const GUEST_WIFI_BODY = i18n({
  en: 'SSID: {ssid}\nPassword: {password}\nExpires: {expired_date}\n\nPlease use the information above to connect to the Guest WiFi.',
  cn: 'SSID: {ssid}\n密码: {password}\n到期时间: {expired_date}\n\n请使用以上信息连接访客 WiFi。',
});

export class GuestWifiTemplate implements ITemplate {
  lang?: Language;
  private ssid: string;
  private password: string;
  private expiredDate: string;
  private cycleId: string;
  private title: string;

  constructor(opts: { ssid: string; password: string; expired_date: string; cycleId: string; title: string; lang?: Language }) {
    this.ssid = opts.ssid;
    this.password = opts.password;
    this.expiredDate = opts.expired_date;
    this.cycleId = opts.cycleId;
    this.title = opts.title;
    this.lang = opts.lang;
  }

  render(_messengerType: MessengerType): [MsgType, unknown] {
    const title = GUEST_WIFI_TITLE(this.lang);
    const body = GUEST_WIFI_BODY(this.lang)
      .replace('{ssid}', this.ssid)
      .replace('{password}', this.password)
      .replace('{expired_date}', this.expiredDate);

    return [MsgType.TEXT, `【${this.title}】\n\n${title}\n\n${body}`];
  }

  toData(): Record<string, unknown> {
    return { ssid: this.ssid, password: this.password, expiredDate: this.expiredDate, cycleId: this.cycleId, lang: this.lang };
  }
}
