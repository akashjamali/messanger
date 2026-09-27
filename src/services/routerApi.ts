// MiFi Router API Client for 192.168.2.1 / 192.168.0.1 (Demo-Webs / GoForm API)

export interface RawRouterMessage {
  id: string;
  number: string;
  content: string;
  tag: string; // "1" for inbox, "2" for sent
  date: string; // e.g. "26,09,27,15,18,31,+20"
  draft_group_id?: string;
}

export function decodeUCS2(hex: string): string {
  if (!hex) return "";
  // Check if string is 4-digit hex encoded unicode
  if (/^[0-9A-Fa-f]{4,}$/.test(hex) && hex.length % 4 === 0) {
    try {
      let str = "";
      for (let i = 0; i < hex.length; i += 4) {
        str += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
      }
      return str.trim();
    } catch {
      return hex;
    }
  }
  return hex;
}

export function formatRouterDate(dateStr: string): { time: string; dayLabel: string } {
  try {
    const parts = dateStr.split(",");
    if (parts.length >= 6) {
      const year = 2000 + parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const hour = parseInt(parts[3], 10);
      const min = parseInt(parts[4], 10);

      const period = hour >= 12 ? "PM" : "AM";
      const h12 = hour % 12 || 12;
      const mStr = min < 10 ? `0${min}` : `${min}`;
      const time = `${h12}:${mStr} ${period}`;

      const now = new Date();
      const isToday =
        now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;

      const dayLabel = isToday ? `Today ${time}` : `${day}/${month + 1}/${year} ${time}`;
      return { time, dayLabel };
    }
  } catch {
    // fallback
  }
  return { time: "Just now", dayLabel: "Today" };
}

async function readPayload(res: Response): Promise<any | null> {
  const text = (await res.text()).trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function routerHeaders(ip: string, json = false): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    Referer: `http://${ip}/index.html#sms_router`,
    "X-Requested-With": "XMLHttpRequest",
    ...(json ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 3500
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

const PHONE_GATEWAYS = new Set(["192.168.0.1", "192.168.1.1"]);

export function isPhoneGateway(ip: string): boolean {
  return PHONE_GATEWAYS.has(ip);
}

export const SUGGESTED_NETWORKS: { ip: string; name: string }[] = [
  { ip: "192.168.2.1", name: "Jazz 4G MiFi" },
  { ip: "192.168.8.1", name: "MiFi" },
  { ip: "192.168.4.1", name: "Pocket Wi-Fi" },
  { ip: "192.168.10.1", name: "Office Wi-Fi" },
  { ip: "192.168.100.1", name: "Gateway" },
  { ip: "192.168.43.1", name: "Phone Hotspot" },
  { ip: "192.168.31.1", name: "Guest Wi-Fi" },
  { ip: "10.0.0.1", name: "Network" },
];

export const SUGGESTED_GATEWAYS = SUGGESTED_NETWORKS.map((item) => item.ip);

async function looksLikeMifi(ip: string, timeoutMs = 1600): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=SSID1,signalbar,wa_inner_version&multi_data=1`,
      { method: "GET", headers: routerHeaders(ip) },
      timeoutMs,
    );
    const data = await readPayload(res);
    return Boolean(data && (data.SSID1 || data.wa_inner_version != null || data.signalbar != null));
  } catch {
    return false;
  }
}

export async function suggestRouters(): Promise<RouterLiveStatus[]> {
  const hits = await Promise.all(
    SUGGESTED_GATEWAYS.map(async (ip) => ((await looksLikeMifi(ip, 1200)) ? ip : null)),
  );
  const ips = hits.filter((ip): ip is string => Boolean(ip));
  const statuses = await Promise.all(ips.map((ip) => fetchRouterStatus(ip)));
  return statuses.filter((item): item is RouterLiveStatus => item != null);
}

export async function discoverRouter(): Promise<string | null> {
  const primary = "192.168.2.1";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await looksLikeMifi(primary, 2500)) return primary;
  }
  const rest = SUGGESTED_GATEWAYS.filter((ip) => ip !== primary);
  return new Promise((resolve) => {
    let left = rest.length;
    let done = false;
    const finish = (ip: string | null) => {
      if (done) return;
      done = true;
      resolve(ip);
    };
    for (const ip of rest) {
      looksLikeMifi(ip, 1800).then((ok) => {
        if (ok) finish(ip);
        else if (--left === 0) finish(null);
      });
    }
  });
}

export async function probeRouter(ip: string, timeoutMs: number = 2000): Promise<boolean> {
  try {
    await fetchWithTimeout(`http://${ip}/index.html`, { method: "GET", headers: routerHeaders(ip) }, timeoutMs);
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=wa_inner_version,cr_version`,
      { method: "GET", headers: routerHeaders(ip) },
      timeoutMs,
    );
    const data = await readPayload(res);
    return Boolean(data && (data.wa_inner_version != null || data.cr_version != null));
  } catch {
    return false;
  }
}

export interface RouterLiveStatus {
  ssid: string;
  signalbar: string;
  rssi: string;
  networkType: string;
  provider: string;
  battery: string;
  charging: boolean;
  connected: boolean;
  wanIp: string;
  gateway: string;
}

export async function fetchRouterStatus(ip: string = "192.168.2.1", timeoutMs = 4000): Promise<RouterLiveStatus | null> {
  try {
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=signalbar,network_type,network_provider,battery_charging,battery_vol_percent,SSID1,rssi,lte_rsrp,wan_ipaddr,ppp_status&multi_data=1`,
      { method: "GET", headers: routerHeaders(ip) },
      timeoutMs,
    );
    const data = await readPayload(res);
    if (!data || (data.signalbar == null && data.SSID1 == null)) return null;
    return {
      ssid: String(data.SSID1 || "MiFi"),
      signalbar: String(data.signalbar ?? ""),
      rssi: String(data.rssi || data.lte_rsrp || ""),
      networkType: String(data.network_type || ""),
      provider: String(data.network_provider || ""),
      battery: String(data.battery_vol_percent ?? ""),
      charging: String(data.battery_charging) === "1",
      connected: data.ppp_status === "ppp_connected",
      wanIp: String(data.wan_ipaddr || ""),
      gateway: ip,
    };
  } catch {
    return null;
  }
}

async function postRouterLogin(ip: string, password: string, username?: string): Promise<boolean> {
  const passB64 = btoa(password);
  const user = username?.trim();
  const body = user
    ? `isTest=false&goformId=LOGIN&username=${encodeURIComponent(user)}&password=${encodeURIComponent(passB64)}`
    : `isTest=false&goformId=LOGIN&password=${encodeURIComponent(passB64)}`;
  const res = await fetchWithTimeout(
    `http://${ip}/goform/goform_set_cmd_process`,
    { method: "POST", headers: routerHeaders(ip, true), body },
    3500,
  );
  const data = await readPayload(res);
  return data?.result === "0" || data?.result === 0 || data?.result === "success";
}

export async function loginToRouter(ip: string, username: string, password: string): Promise<boolean> {
  try {
    try {
      await fetchWithTimeout(
        `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=wa_inner_version&multi_data=1`,
        { method: "GET", headers: routerHeaders(ip) },
        2500,
      );
    } catch {
      // Login can still proceed if the session request is slow.
    }
    if (await postRouterLogin(ip, password, username)) return true;
    if (username.trim()) return await postRouterLogin(ip, password);
    return false;
  } catch {
    return false;
  }
}

export async function markRouterMessagesRead(ids: string[], ip: string = "192.168.2.1"): Promise<boolean> {
  const msgIds = ids.filter(Boolean);
  if (msgIds.length === 0) return true;
  try {
    const body = `isTest=false&goformId=SET_MSG_READ&msg_id=${encodeURIComponent(msgIds.join(";"))}&tag=0`;
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_set_cmd_process`,
      { method: "POST", headers: routerHeaders(ip, true), body },
      3000,
    );
    const data = await readPayload(res);
    return data?.result === "0" || data?.result === 0 || data?.result === "success";
  } catch {
    return false;
  }
}

export async function fetchRouterMessages(ip: string = "192.168.2.1", timeoutMs = 8000): Promise<RawRouterMessage[] | null> {
  try {
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=sms_data_total&page=0&data_per_page=500&mem_store=1&tags=10&order_by=order+by+id+desc`,
      {
        method: "GET",
        headers: routerHeaders(ip),
      },
      timeoutMs,
    );

    const data = await readPayload(res);
    return Array.isArray(data?.messages) ? data.messages : [];
  } catch {
    return null;
  }
}

export async function deleteRouterMessage(
  msgId: string,
  ip: string = "192.168.2.1"
): Promise<boolean> {
  try {
    const id = msgId.endsWith(";") ? msgId : `${msgId};`;
    const body = `isTest=false&goformId=DELETE_SMS&notCallback=true&msg_id=${encodeURIComponent(id)}`;
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_set_cmd_process`,
      {
        method: "POST",
        headers: routerHeaders(ip, true),
        body: body,
      },
      3500
    );
    const data = await readPayload(res);
    return data?.result === "0" || data?.result === "success";
  } catch {
    return false;
  }
}

export async function sendRouterMessage(
  number: string,
  message: string,
  ip: string = "192.168.2.1"
): Promise<boolean> {
  try {
    let ucs2 = "";
    for (let i = 0; i < message.length; i++) {
      const hex = message.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
      ucs2 += hex;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear().toString().slice(-2)},${(now.getMonth() + 1).toString().padStart(2, "0")},${now.getDate().toString().padStart(2, "0")},${now.getHours().toString().padStart(2, "0")},${now.getMinutes().toString().padStart(2, "0")},${now.getSeconds().toString().padStart(2, "0")},+20`;

    const body = `isTest=false&goformId=SEND_SMS&Number=${encodeURIComponent(number)}&MessageBody=${encodeURIComponent(ucs2)}&ID=-1&encode_type=UNICODE&SMS_DATE=${encodeURIComponent(dateStr)}&sms_time=${encodeURIComponent(dateStr)}`;
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_set_cmd_process`,
      {
        method: "POST",
        headers: routerHeaders(ip, true),
        body: body,
      },
      4000
    );
    const data = await readPayload(res);
    return data?.result === "0" || data?.result === "success";
  } catch {
    return false;
  }
}

export type DeviceSettings = {
  ssid: string;
  authMode: string;
  wifiEnabled: boolean;
  maxAccess: string;
  broadcast: string;
  cipher: string;
  noForwarding: string;
  networkType: string;
  provider: string;
  signalbar: string;
  rssi: string;
  wanIp: string;
  connected: boolean;
  battery: string;
  charging: boolean;
  monthlyBytes: string;
  dataLimit: boolean;
  imei: string;
  imsi: string;
  hardware: string;
  firmware: string;
  domain: string;
  netSelect: string;
};

const SETTINGS_CMD = [
  "SSID1",
  "AuthMode",
  "wifiEnabled",
  "MAX_Access_num",
  "broadcastSsidEnabled",
  "cipher",
  "NoForwarding",
  "network_type",
  "network_provider",
  "signalbar",
  "rssi",
  "wan_ipaddr",
  "ppp_status",
  "battery_vol_percent",
  "battery_charging",
  "monthly_tx_bytes",
  "monthly_rx_bytes",
  "data_volume_limit_switch",
  "imei",
  "sim_imsi",
  "hardware_version",
  "wa_inner_version",
  "LocalDomain",
  "net_select",
].join(",");

export async function fetchDeviceSettings(ip: string = "192.168.2.1"): Promise<DeviceSettings | null> {
  try {
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=${SETTINGS_CMD}&multi_data=1`,
      { method: "GET", headers: routerHeaders(ip) },
      6000,
    );
    const data = await readPayload(res);
    if (!data) return null;
    const tx = Number(data.monthly_tx_bytes) || 0;
    const rx = Number(data.monthly_rx_bytes) || 0;
    return {
      ssid: String(data.SSID1 || ""),
      authMode: String(data.AuthMode || "WPA2PSK"),
      wifiEnabled: String(data.wifiEnabled) !== "0",
      maxAccess: String(data.MAX_Access_num || ""),
      broadcast: String(data.broadcastSsidEnabled || "1"),
      cipher: String(data.cipher || ""),
      noForwarding: String(data.NoForwarding || "0"),
      networkType: String(data.network_type || ""),
      provider: String(data.network_provider || ""),
      signalbar: String(data.signalbar || "0"),
      rssi: String(data.rssi || ""),
      wanIp: String(data.wan_ipaddr || ""),
      connected: String(data.ppp_status || "").includes("connected"),
      battery: String(data.battery_vol_percent || ""),
      charging: String(data.battery_charging) === "1",
      monthlyBytes: String(tx + rx),
      dataLimit: String(data.data_volume_limit_switch) === "1",
      imei: String(data.imei || ""),
      imsi: String(data.sim_imsi || ""),
      hardware: String(data.hardware_version || ""),
      firmware: String(data.wa_inner_version || ""),
      domain: String(data.LocalDomain || ""),
      netSelect: String(data.net_select || ""),
    };
  } catch {
    return null;
  }
}

function encodeDeviceSecret(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function postForm(ip: string, fields: Record<string, string>): Promise<boolean> {
  try {
    const body = Object.entries({ isTest: "false", ...fields })
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_set_cmd_process`,
      { method: "POST", headers: routerHeaders(ip, true), body },
      8000,
    );
    const data = await readPayload(res);
    return data?.result === "success" || data?.result === "0" || data?.result === 0 || data?.result === true;
  } catch {
    return false;
  }
}

export async function saveWifiSettings(
  ip: string,
  settings: Pick<DeviceSettings, "ssid" | "maxAccess" | "authMode" | "broadcast" | "cipher" | "noForwarding"> & {
    passphrase?: string;
  },
): Promise<boolean> {
  try {
    const fields = [
      "isTest=false",
      "goformId=SET_WIFI_SSID1_SETTINGS",
      `ssid=${encodeURIComponent(settings.ssid)}`,
      `broadcastSsidEnabled=${encodeURIComponent(settings.broadcast || "1")}`,
      `MAX_Access_num=${encodeURIComponent(settings.maxAccess || "10")}`,
      `security_mode=${encodeURIComponent(settings.authMode || "WPA2PSK")}`,
      `cipher=${encodeURIComponent(settings.cipher)}`,
      `NoForwarding=${encodeURIComponent(settings.noForwarding || "0")}`,
      "show_qrcode_flag=0",
    ];
    const secret = settings.passphrase?.trim();
    if (secret && settings.authMode !== "OPEN") {
      const encoded = encodeDeviceSecret(secret);
      fields.push(`security_shared_mode=${encodeURIComponent(settings.cipher || "2")}`);
      fields.push(`passphrase=${encodeURIComponent(encoded)}`);
    }
    const body = fields.join("&");
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_set_cmd_process`,
      { method: "POST", headers: routerHeaders(ip, true), body },
      8000,
    );
    const data = await readPayload(res);
    return data?.result === "success" || data?.result === "0" || data?.result === 0;
  } catch {
    return false;
  }
}

export async function setWifiEnabled(ip: string, enabled: boolean): Promise<boolean> {
  try {
    const body = `isTest=false&goformId=SET_WIFI_INFO&wifiEnabled=${enabled ? "1" : "0"}`;
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_set_cmd_process`,
      { method: "POST", headers: routerHeaders(ip, true), body },
      8000,
    );
    const data = await readPayload(res);
    return data?.result === "success" || data?.result === "0" || data?.result === 0;
  } catch {
    return false;
  }
}

export type LiveLink = {
  txBytes: number;
  rxBytes: number;
  txThrpt: number;
  rxThrpt: number;
  latencyMs: number;
  sim: string;
  battery: string;
  charging: boolean;
  dataOn: boolean;
  wifiOn: boolean;
  users: number;
};

function simLabel(imsi: string, provider: string, spn: string, msisdn: string) {
  const named = (spn || provider).trim();
  const known: Record<string, string> = {
    "41001": "Jazz",
    "41007": "Jazz",
    "41003": "Zong",
    "41004": "Ufone",
    "41006": "Telenor",
  };
  const title = named || known[imsi.slice(0, 5)] || (imsi ? "SIM" : "");
  if (title && msisdn) return `${title} · ${msisdn}`;
  return title || "—";
}

export async function fetchLiveLink(ip: string = "192.168.2.1"): Promise<LiveLink | null> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=realtime_tx_bytes,realtime_rx_bytes,realtime_tx_thrpt,realtime_rx_thrpt,sim_imsi,imsi,msisdn,network_provider,spn_name_data,battery_vol_percent,battery_charging,ppp_status,wifiEnabled,wifi_cur_state,sta_count&multi_data=1`,
      { method: "GET", headers: routerHeaders(ip) },
      4000,
    );
    const data = await readPayload(res);
    if (!data) return null;
    const users = Number(data.sta_count);
    return {
      txBytes: Number(data.realtime_tx_bytes) || 0,
      rxBytes: Number(data.realtime_rx_bytes) || 0,
      txThrpt: Number(data.realtime_tx_thrpt) || 0,
      rxThrpt: Number(data.realtime_rx_thrpt) || 0,
      latencyMs: Math.max(1, Date.now() - started),
      sim: simLabel(String(data.sim_imsi || data.imsi || ""), String(data.network_provider || ""), String(data.spn_name_data || ""), String(data.msisdn || "")),
      battery: String(data.battery_vol_percent || ""),
      charging: String(data.battery_charging) === "1",
      dataOn: String(data.ppp_status) === "ppp_connected",
      wifiOn: String(data.wifiEnabled) === "1" || String(data.wifi_cur_state) === "1",
      users: Number.isFinite(users) ? users : 0,
    };
  } catch {
    return null;
  }
}

export type WifiUser = {
  mac: string;
  name: string;
  ip: string;
  blocked: boolean;
  self: boolean;
};

function splitFields(value: unknown): string[] {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asStations(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function fetchWifiUsers(ip: string = "192.168.2.1"): Promise<WifiUser[] | null> {
  try {
    const [stationsRes, accessRes] = await Promise.all([
      fetchWithTimeout(
        `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=station_list`,
        { method: "GET", headers: routerHeaders(ip) },
        4000,
      ),
      fetchWithTimeout(
        `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=ACL_mode,wifi_mac_black_list,wifi_hostname_black_list,client_mac_address&multi_data=1`,
        { method: "GET", headers: routerHeaders(ip) },
        4000,
      ),
    ]);
    const stations = await readPayload(stationsRes);
    const access = await readPayload(accessRes);
    if (!stations && !access) return null;
    const blockedMacs = splitFields(access?.wifi_mac_black_list);
    const blockedNames = splitFields(access?.wifi_hostname_black_list);
    const selfMac = String(access?.client_mac_address || "").toLowerCase();
    const seen = new Set<string>();
    const users: WifiUser[] = [];
    for (const station of asStations(stations?.station_list)) {
      const mac = String(station?.mac_addr || station?.mac || "");
      if (!mac) continue;
      const key = mac.toLowerCase();
      seen.add(key);
      users.push({
        mac,
        name: String(station?.hostname || station?.hostName || "User"),
        ip: String(station?.ip_addr || station?.ip || ""),
        blocked: blockedMacs.some((item) => item.toLowerCase() === key),
        self: key === selfMac,
      });
    }
    blockedMacs.forEach((mac, index) => {
      const key = mac.toLowerCase();
      if (seen.has(key)) return;
      users.push({
        mac,
        name: blockedNames[index] || "Blocked user",
        ip: "",
        blocked: true,
        self: key === selfMac,
      });
    });
    return users;
  } catch {
    return null;
  }
}

export async function setWifiUserBlocked(ip: string, mac: string, name: string, blocked: boolean): Promise<boolean> {
  const current = await fetchWifiUsers(ip);
  if (!current) return false;
  const next = current.filter((user) => user.blocked && user.mac.toLowerCase() !== mac.toLowerCase());
  if (blocked) next.push({ mac, name: name || "User", ip: "", blocked: true, self: false });
  const macs = next.map((user) => user.mac);
  const names = next.map((user) => user.name || "User");
  try {
    const body = [
      "isTest=false",
      "goformId=WIFI_MAC_FILTER",
      `ACL_mode=${macs.length > 0 ? "2" : "0"}`,
      `wifi_mac_black_list=${encodeURIComponent(macs.join(";"))}`,
      `wifi_hostname_black_list=${encodeURIComponent(names.join(";"))}`,
    ].join("&");
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_set_cmd_process`,
      { method: "POST", headers: routerHeaders(ip, true), body },
      8000,
    );
    const data = await readPayload(res);
    return data?.result === "success" || data?.result === "0" || data?.result === 0;
  } catch {
    return false;
  }
}

export type WifiSetup = {
  ssid: string;
  authMode: string;
  wifiEnabled: boolean;
  dualEnabled: boolean;
  showName: boolean;
  maxAccess: string;
  cipher: string;
  noForwarding: string;
  band: string;
  networkMode: string;
  bandwidth: string;
  country: string;
  channel: string;
  wpsSsid: string;
  wpsIndex: string;
  blacklist: boolean;
};

export type DeviceControls = {
  pinEnabled: boolean;
  sleep: string;
  fastBoot: boolean;
};

export async function fetchWifiSetup(ip: string = "192.168.2.1"): Promise<WifiSetup | null> {
  try {
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=SSID1,AuthMode,wifiEnabled,m_ssid_enable,broadcastSsidEnabled,HideSSID,MAX_Access_num,cipher,EncrypType,NoForwarding,WirelessMode,CountryCode,Channel,wifi_band,wifi_11n_cap,WPS_SSID,wifi_wps_index,ACL_mode&multi_data=1`,
      { method: "GET", headers: routerHeaders(ip) },
      6000,
    );
    const data = await readPayload(res);
    if (!data) return null;
    const shown = String(data.broadcastSsidEnabled || "");
    const hidden = String(data.HideSSID || "");
    const showName = shown === "1" || (shown === "" && hidden !== "1");
    const band = String(data.wifi_band || "");
    return {
      ssid: String(data.SSID1 || ""),
      authMode: String(data.AuthMode || "WPA2PSK"),
      wifiEnabled: String(data.wifiEnabled) !== "0",
      dualEnabled: String(data.m_ssid_enable) === "1",
      showName,
      maxAccess: String(data.MAX_Access_num || "10"),
      cipher: String(data.cipher || (data.EncrypType === "TKIP" ? "0" : data.EncrypType === "AES" ? "1" : "2")),
      noForwarding: String(data.NoForwarding || "0"),
      band: band === "a" ? "5 GHz" : "2.4 GHz",
      networkMode: String(data.WirelessMode || ""),
      bandwidth: String(data.wifi_11n_cap || "1"),
      country: String(data.CountryCode || "PK"),
      channel: String(data.Channel || "auto"),
      wpsSsid: String(data.WPS_SSID || data.SSID1 || ""),
      wpsIndex: String(data.wifi_wps_index || "1"),
      blacklist: String(data.ACL_mode) === "2",
    };
  } catch {
    return null;
  }
}

export async function fetchDeviceControls(ip: string = "192.168.2.1"): Promise<DeviceControls | null> {
  try {
    const res = await fetchWithTimeout(
      `http://${ip}/goform/goform_get_cmd_process?isTest=false&cmd=pin_status,need_sim_pin,Sleep_interval,mgmt_quicken_power_on&multi_data=1`,
      { method: "GET", headers: routerHeaders(ip) },
      6000,
    );
    const data = await readPayload(res);
    if (!data) return null;
    const pin = String(data.pin_status || "");
    return {
      pinEnabled: pin === "1" || pin === "2" || String(data.need_sim_pin) === "yes",
      sleep: String(data.Sleep_interval || "0"),
      fastBoot: String(data.mgmt_quicken_power_on) === "1",
    };
  } catch {
    return null;
  }
}

export async function saveDualAccess(ip: string, enabled: boolean): Promise<boolean> {
  return postForm(ip, { goformId: "SET_WIFI_INFO", m_ssid_enable: enabled ? "1" : "0" });
}

export async function saveRadioSettings(
  ip: string,
  settings: { networkMode: string; country: string; channel: string; bandwidth: string; maxAccess: string },
): Promise<boolean> {
  return postForm(ip, {
    goformId: "SET_WIFI_INFO",
    wifiMode: settings.networkMode,
    countryCode: settings.country || "PK",
    MAX_Access_num: settings.maxAccess || "10",
    selectedChannel: settings.channel || "auto",
    abg_rate: "0",
    wifi_11n_cap: settings.bandwidth,
  });
}

export async function setBlacklistEnabled(ip: string, enabled: boolean): Promise<boolean> {
  const current = await fetchWifiUsers(ip);
  const blocked = (current || []).filter((user) => user.blocked);
  return postForm(ip, {
    goformId: "WIFI_MAC_FILTER",
    ACL_mode: enabled ? "2" : "0",
    wifi_mac_black_list: blocked.map((user) => user.mac).join(";"),
    wifi_hostname_black_list: blocked.map((user) => user.name || "User").join(";"),
  });
}

export async function startWps(ip: string, ssid: string, index: string, mode: "PBC" | "PIN", pin = ""): Promise<boolean> {
  const fields: Record<string, string> = {
    goformId: "WIFI_WPS_SET",
    WPS_SSID: ssid,
    wps_mode: mode,
    wifi_wps_index: index || "1",
  };
  if (mode === "PIN") fields.wps_pin = pin;
  return postForm(ip, fields);
}

export async function setSimPin(ip: string, enabled: boolean, pin: string): Promise<boolean> {
  return postForm(ip, { goformId: enabled ? "ENABLE_PIN" : "DISABLE_PIN", OldPinNumber: pin });
}

export async function savePowerSettings(ip: string, sleep: string, fastBoot: boolean): Promise<boolean> {
  const sleepOk = await postForm(ip, { goformId: "SET_WIFI_SLEEP_INFO", sysIdleTimeToSleep: sleep || "0" });
  const bootOk = await postForm(ip, { goformId: "MGMT_CONTROL_POWER_ON_SPEED", mgmt_quicken_power_on: fastBoot ? "1" : "0" });
  return sleepOk && bootOk;
}

export function rebootDevice(ip: string) {
  return postForm(ip, { goformId: "REBOOT_DEVICE" });
}

export function shutdownDevice(ip: string) {
  return postForm(ip, { goformId: "TURN_OFF_DEVICE" });
}

export function resetFactorySettings(ip: string) {
  return postForm(ip, { goformId: "RESTORE_FACTORY_SETTINGS" });
}
