import type { SMSMessage } from "../types/router-chat";
import { chatCache } from "./chat-cache-service";
import { generateNormalizedChatId } from "../utils/phone";

const DEFAULT_ROUTER_IPS = [
  "192.168.2.1", // Primary Jazz / ZTE 4G Router gateway
  "192.168.8.1", // Huawei / Generic 4G Mifi
  "192.168.0.1",
  "192.168.1.1",
];

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

export function base64Encode(input: string): string {
  let output = "";
  let chr1, chr2, chr3, enc1, enc2, enc3, enc4;
  let i = 0;

  while (i < input.length) {
    chr1 = input.charCodeAt(i++);
    chr2 = input.charCodeAt(i++);
    chr3 = input.charCodeAt(i++);

    enc1 = chr1 >> 2;
    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    enc3 = isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (chr3 >> 6);
    enc4 = isNaN(chr2) || isNaN(chr3) ? 64 : chr3 & 63;

    output =
      output +
      BASE64_CHARS.charAt(enc1) +
      BASE64_CHARS.charAt(enc2) +
      BASE64_CHARS.charAt(enc3) +
      BASE64_CHARS.charAt(enc4);
  }

  return output;
}

export function decodeSMSContent(content: string): string {
  if (!content) return "";
  // ZTE UCS2 hex-encoded SMS check (string of hex characters divisible by 4)
  if (
    content.length >= 4 &&
    content.length % 4 === 0 &&
    /^[0-9A-Fa-f]+$/.test(content)
  ) {
    try {
      let decoded = "";
      for (let i = 0; i < content.length; i += 4) {
        decoded += String.fromCharCode(parseInt(content.substring(i, i + 4), 16));
      }
      return decoded;
    } catch {
      return content;
    }
  }
  return content;
}

export function encodeSMSContent(text: string): string {
  let hex = "";
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return hex;
}

export function formatSMSTime(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yy = date.getFullYear().toString().slice(-2);
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const tzOffset = -date.getTimezoneOffset() / 60;
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tz = Math.abs(tzOffset);
  return `${yy};${MM};${dd};${hh};${mm};${ss};${tzSign}${tz}`;
}

export function routerHeaders(ip: string, isPost = false): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    Referer: `http://${ip}/index.html`,
    "X-Requested-With": "XMLHttpRequest",
    ...(isPost
      ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }
      : {}),
  };
}

export function readPayload(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

class RouterApiService {
  private activeIP: string = DEFAULT_ROUTER_IPS[0];

  public getRouterIP(): string {
    return this.activeIP;
  }

  public setRouterIP(ip: string): void {
    this.activeIP = ip;
  }

  /**
   * Fast probe to verify router accessibility at target IP
   */
  public async probeIP(ip: string, timeoutMs = 2500): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const url = `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=loginfo&multi_data=1&_=${Date.now()}`;
      const res = await fetch(url, {
        headers: routerHeaders(ip),
        signal: controller.signal,
      });
      clearTimeout(id);
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }

  /**
   * Probe default candidate IPs and dynamically resolve the router IP
   */
  public async resolveRouterIP(): Promise<string | null> {
    for (const ip of DEFAULT_ROUTER_IPS) {
      const alive = await this.probeIP(ip);
      if (alive) {
        this.activeIP = ip;
        return ip;
      }
    }
    return null;
  }

  /**
   * Query session info and login status
   */
  public async checkSession(
    ip = this.activeIP,
  ): Promise<{ ok: boolean; isLoggedIn: boolean; data?: any }> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      const url = `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=loginfo,sta_count,sms_unread_num,signalbar,network_type,ppp_status,modem_main_state,battery_value,battery_charging,battery_vol_percent,battery_pers,charge_status,flux_state,realtime_tx_thrpt,realtime_rx_thrpt&multi_data=1&_=${Date.now()}`;
      const res = await fetch(url, {
        headers: routerHeaders(ip),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) return { ok: false, isLoggedIn: false };

      const text = await res.text();
      const json = readPayload(text) || {};
      const isLoggedIn = json.loginfo === "ok";
      return { ok: true, isLoggedIn, data: json };
    } catch {
      return { ok: false, isLoggedIn: false };
    }
  }

  /**
   * Authenticate with router via GoForm API
   * Jazz/ZTE 4G Routers send: goformId=LOGIN, username=b64(user), password=b64(pass)
   */
  public async login(
    username = "admin",
    password = "",
    ip = this.activeIP,
  ): Promise<{ success: boolean; result?: number; error?: string }> {
    try {
      const passB64 = base64Encode(password);
      const user = username.trim();
      const userB64 = base64Encode(user);
      const url = `http://${ip}/goform/goform_set_cmd_process`;

      // Candidate bodies: 1. Jazz/ZTE standard (both b64), 2. with isTest, 3. plain username, 4. password-only
      const candidateBodies = [
        `goformId=LOGIN&password=${encodeURIComponent(passB64)}&username=${encodeURIComponent(userB64)}`,
        `isTest=false&goformId=LOGIN&password=${encodeURIComponent(passB64)}&username=${encodeURIComponent(userB64)}`,
        `goformId=LOGIN&password=${encodeURIComponent(passB64)}&username=${encodeURIComponent(user)}`,
        `isTest=false&goformId=LOGIN&password=${encodeURIComponent(passB64)}&username=${encodeURIComponent(user)}`,
        `goformId=LOGIN&password=${encodeURIComponent(passB64)}`,
      ];

      let lastResult = -1;
      for (const body of candidateBodies) {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(url, {
            method: "POST",
            headers: routerHeaders(ip, true),
            body,
            signal: controller.signal,
          });
          clearTimeout(id);

          const text = await res.text();
          const data = readPayload(text);

          let result = -1;
          if (data && typeof data.result !== "undefined") {
            result = Number(data.result);
          } else if (text.includes('"result":"0"') || text.includes('"result":0')) {
            result = 0;
          }

          lastResult = result;

          if (result === 0 || data?.result === "success") {
            return { success: true, result: 0 };
          }

          // If result indicates locked (2) or another user logged in (3), don't keep hammering
          if (result === 2 || result === 3) {
            break;
          }
        } catch {
          continue;
        }
      }

      let errorMsg = "Incorrect admin username or password.";
      if (lastResult === 2) {
        errorMsg = "Too many failed attempts. Router is locked for 5 minutes. Please wait.";
      } else if (lastResult === 3) {
        errorMsg = "Another user is already logged in to the router.";
      }

      return {
        success: false,
        result: lastResult,
        error: errorMsg,
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to reach router." };
    }
  }

  /**
   * Check if connected device supports SMS functionality
   */
  public async checkSMSSupport(ip = this.activeIP): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3500);
      const url = `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=sms_data_total&page=0&data_per_page=1&mem_store=1&tags=1&order_by=order+by+id+desc&_=${Date.now()}`;
      const res = await fetch(url, {
        headers: routerHeaders(ip),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) return false;
      const text = await res.text();
      return text.includes("messages") || text.includes("sms");
    } catch {
      return false;
    }
  }

  /**
   * Fetch all SMS messages stored on SIM/Router (both device storage and SIM storage)
   */
  public async fetchSMS(ip = this.activeIP): Promise<SMSMessage[]> {
    try {
      // Query both mem_store=1 (Device) and mem_store=2 (SIM card) without restricting to tag=1
      const endpoints = [
        `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=sms_data_total&page=0&data_per_page=500&mem_store=1&order_by=order+by+id+desc&_=${Date.now()}`,
        `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=sms_data_total&page=0&data_per_page=500&mem_store=2&order_by=order+by+id+desc&_=${Date.now()}`,
        `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=sms_data_total&page=0&data_per_page=500&mem_store=1&tags=10&order_by=order+by+id+desc&_=${Date.now()}`,
      ];

      const responses = await Promise.allSettled(
        endpoints.map(async (url) => {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(url, {
            headers: routerHeaders(ip),
            signal: controller.signal,
          });
          clearTimeout(id);
          if (!res.ok) return [];
          const text = await res.text();
          const data = readPayload(text);
          if (!data) return [];
          if (Array.isArray(data)) return data;
          if (Array.isArray(data.messages)) return data.messages;
          if (Array.isArray(data.sms_data)) return data.sms_data;
          return [];
        }),
      );

      const combinedRaw: any[] = [];
      const seenRawKeys = new Set<string>();

      for (const result of responses) {
        if (result.status === "fulfilled" && Array.isArray(result.value)) {
          for (const item of result.value) {
            const rawId = String(item.id ?? "");
            const sig = `${item.number}:${item.content}:${item.date}`;
            const key = rawId ? `${rawId}-${sig}` : sig;
            if (!seenRawKeys.has(key)) {
              seenRawKeys.add(key);
              combinedRaw.push(item);
            }
          }
        }
      }

      return combinedRaw.map((item: any) => {
        const content = decodeSMSContent(item.content || "");
        const tag = String(item.tag ?? "1");
        // ZTE / 3GPP Modem SMS tags:
        // Tag 2 = Sent SMS (Outbox)
        // Tag 3 = Failed/Stored Sent SMS
        // Tag 0 = Read received SMS, Tag 1 = Unread received SMS, Tag 4 = Draft
        const isSentMessage =
          tag === "2" ||
          tag === "3" ||
          String(item.type ?? "").toLowerCase() === "sent" ||
          item.type === "1" ||
          String(item.folder ?? "").toLowerCase() === "sent" ||
          item.folder === "2" ||
          item.box_type === "2" ||
          item.is_send === "1" ||
          item.fromMe === true ||
          item.isMe === true ||
          chatCache.isSentMessage(item.number, content, tag) ||
          chatCache.isSentId(String(item.id ?? ""));

        const rawNumber = String(item.number || "Unknown");
        const chatId = generateNormalizedChatId(rawNumber);

        if (isSentMessage) {
          chatCache.recordSentMessage(rawNumber, content, item.id);
        }

        return {
          id: String(item.id || `sms-${Date.now()}-${Math.random()}`),
          chatId,
          number: rawNumber,
          content,
          date: String(item.date || ""),
          tag,
          status: "sent" as const,
          fromMe: isSentMessage,
          isMe: isSentMessage,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Send an SMS message through the router SIM card
   */
  public async sendSMS(
    number: string,
    text: string,
    ip = this.activeIP,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanNumber = number.replace(/[\s()-]/g, "");
      let ucs2 = "";
      for (let i = 0; i < text.length; i++) {
        ucs2 += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
      }

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const dateStr = `${now.getFullYear().toString().slice(-2)},${pad(now.getMonth() + 1)},${pad(now.getDate())},${pad(now.getHours())},${pad(now.getMinutes())},${pad(now.getSeconds())},+20`;

      const body = `isTest=false&goformId=SEND_SMS&Number=${encodeURIComponent(cleanNumber)}&MessageBody=${encodeURIComponent(ucs2)}&ID=-1&encode_type=UNICODE&SMS_DATE=${encodeURIComponent(dateStr)}&sms_time=${encodeURIComponent(dateStr)}`;

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const url = `http://${ip}/goform/goform_set_cmd_process`;

      const res = await fetch(url, {
        method: "POST",
        headers: routerHeaders(ip, true),
        body,
        signal: controller.signal,
      });
      clearTimeout(id);

      const resText = await res.text();
      const data = readPayload(resText);
      const ok =
        data?.result === "0" ||
        data?.result === 0 ||
        data?.result?.toLowerCase?.() === "success" ||
        resText.includes('"result":"0"') ||
        resText.includes('"result":0') ||
        resText.toLowerCase().includes("success");

      return {
        success: ok,
        error: ok ? undefined : "Router rejected SMS delivery.",
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to deliver SMS to router.",
      };
    }
  }

  /**
   * Delete SMS messages from router SIM card
   * @param msgIds Array of message IDs (e.g. ['1', '2']) or single ID string
   */
  public async deleteSMS(
    msgIds: string[] | string,
    ip = this.activeIP,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const url = `http://${ip}/goform/goform_set_cmd_process`;

      const idStr = Array.isArray(msgIds)
        ? msgIds.filter(Boolean).join(";") + ";"
        : msgIds.endsWith(";")
          ? msgIds
          : msgIds + ";";

      const body = `isTest=false&goformId=DELETE_SMS&notCallback=true&msg_id=${encodeURIComponent(idStr)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: routerHeaders(ip, true),
        body,
        signal: controller.signal,
      });
      clearTimeout(id);

      const resText = await res.text();
      const data = readPayload(resText);
      const ok =
        data?.result === "0" ||
        data?.result === 0 ||
        data?.result?.toLowerCase?.() === "success" ||
        resText.includes('"result":"0"') ||
        resText.includes('"result":0');

      return {
        success: ok,
        error: ok ? undefined : "Failed to delete SMS from router.",
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to connect to router.",
      };
    }
  }

  /**
   * Mark SMS messages as read on router SIM card
   */
  public async markRead(
    msgIds: string[] | string,
    ip = this.activeIP,
  ): Promise<boolean> {
    const ids = (Array.isArray(msgIds) ? msgIds : [msgIds]).filter(Boolean);
    if (ids.length === 0) return true;
    try {
      const body = `isTest=false&goformId=SET_MSG_READ&msg_id=${encodeURIComponent(ids.join(";"))}&tag=0`;
      const res = await fetch(`http://${ip}/goform/goform_set_cmd_process`, {
        method: "POST",
        headers: routerHeaders(ip, true),
        body,
      });
      const text = await res.text();
      const data = readPayload(text);
      return (
        data?.result === "0" ||
        data?.result === 0 ||
        data?.result === "success"
      );
    } catch {
      return false;
    }
  }

  /**
   * Terminate session on router
   */
  public async logout(ip = this.activeIP): Promise<void> {
    try {
      const params = new URLSearchParams();
      params.append("goformId", "LOGOUT");
      await fetch(`http://${ip}/goform/goform_set_cmd_process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: params.toString(),
      });
    } catch {
      // Ignore cleanup error
    }
  }
}

export const RouterAPI = new RouterApiService();
