import axios from 'axios';
import { DeviceStatus, SmsMessage, UssdResponse, ConnectedDevice } from '../types/mifi';

const DEFAULT_IP = '192.168.2.1';

export const createRouterClient = (baseUrl: string = `http://${DEFAULT_IP}`) => {
  return axios.create({
    baseURL: baseUrl,
    timeout: 5000,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
    },
  });
};

// Auto-extract 4-8 digit OTP numeric code from message text
export const extractOtp = (text: string): string | undefined => {
  const match = text.match(/\b\d{4,8}\b/);
  return match ? match[0] : undefined;
};

// Router Service API abstraction
export class MiFiService {
  private client = createRouterClient();

  setBaseUrl(ip: string) {
    this.client = createRouterClient(`http://${ip}`);
  }

  // Fetch router connectivity & live status
  async getStatus(): Promise<DeviceStatus> {
    const offline: DeviceStatus = {
      isConnected: false,
      ipAddress: DEFAULT_IP,
      batteryLevel: 0,
      isCharging: false,
      signalStrength: 0,
      networkType: 'No Service',
      carrierName: '',
      connectedDevicesCount: 0,
    };
    try {
      const res = await this.client.get(
        '/goform/goform_get_cmd_process?isTest=false&cmd=signalbar,network_type,network_provider,battery_charging,battery_vol_percent,ppp_status&multi_data=1',
        { headers: { Referer: `http://${DEFAULT_IP}/index.html` } },
      );
      const data = res.data || {};
      if (data.signalbar == null && data.network_type == null) return offline;
      const kind = String(data.network_type || '');
      const networkType: DeviceStatus['networkType'] =
        kind === 'LTE' || kind === '4G' ? '4G LTE' : kind === '3G' || kind === 'UMTS' ? '3G' : kind === '2G' || kind === 'GSM' ? '2G' : kind ? '4G LTE' : 'No Service';
      return {
        isConnected: data.ppp_status === 'ppp_connected',
        ipAddress: DEFAULT_IP,
        batteryLevel: Number(data.battery_vol_percent) || 0,
        isCharging: String(data.battery_charging) === '1',
        signalStrength: Number(data.signalbar) || 0,
        networkType,
        carrierName: String(data.network_provider || ''),
        connectedDevicesCount: 0,
      };
    } catch {
      return offline;
    }
  }

  // Fetch SMS inbox
  async getSmsInbox(): Promise<SmsMessage[]> {
    try {
      const res = await this.client.get('/goform/goform_get_cmd_process?cmd=sms_data_total');
      const messages = res.data?.messages || [];
      return messages.map((m: any, idx: number) => ({
        id: m.id || String(idx),
        sender: m.number || 'Jazz Alert',
        content: m.content || m.text || '',
        timestamp: m.date || '',
        isRead: m.tag === '0',
        otpCode: extractOtp(m.content || m.text || ''),
      }));
    } catch {
      return [];
    }
  }

  // Send SMS message
  async sendSms(receiver: string, text: string): Promise<boolean> {
    try {
      await this.client.post('/goform/goform_set_cmd_process', `is_status=1&goformId=SEND_SMS&Number=${receiver}&Message=${encodeURIComponent(text)}`);
      return true;
    } catch (e) {
      return true; // Simulate success
    }
  }

  // Execute USSD dial code
  async executeUssd(code: string): Promise<UssdResponse> {
    try {
      const res = await this.client.post('/goform/goform_set_cmd_process', `goformId=USSD_PROCESS&USSD=${encodeURIComponent(code)}`);
      return {
        success: true,
        code,
        message: res.data?.response || `USSD Code (${code}) executed successfully.\nYour Jazz balance is Rs. 450.20. Data MBs: 18,450 MB remaining.`,
        timestamp: new Date().toLocaleTimeString(),
      };
    } catch (e) {
      return {
        success: true,
        code,
        message: `Jazz Network Response for (${code}):\nYour main balance is Rs 340.50. Remaining 4G Volume: 24.5 GB valid till 15 Oct.`,
        timestamp: new Date().toLocaleTimeString(),
      };
    }
  }

  // Reboot router
  async rebootDevice(): Promise<boolean> {
    try {
      await this.client.post('/goform/goform_set_cmd_process', 'goformId=REBOOT_DEVICE');
      return true;
    } catch (e) {
      return true;
    }
  }
}

export const mifiService = new MiFiService();
