export interface DeviceStatus {
  isConnected: boolean;
  ipAddress: string;
  batteryLevel: number; // 0 - 100%
  isCharging: boolean;
  signalStrength: number; // 0 - 5 bars
  networkType: '4G LTE' | '3G' | '2G' | 'No Service';
  carrierName: string; // e.g. Jazz / Mobilink
  connectedDevicesCount: number;
  macAddress?: string;
  firmwareVersion?: string;
}

export interface SmsMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  otpCode?: string; // Extracted 4-6 digit OTP code if present
}

export interface UssdResponse {
  success: boolean;
  code: string;
  message: string;
  timestamp: string;
}

export interface RouterSettings {
  routerIp: string;
  adminPassword?: string;
  wifiSsid: string;
  wifiPasswordHide: boolean;
  autoRefreshInterval: number; // in seconds
}

export interface ConnectedDevice {
  id: string;
  deviceName: string;
  ipAddress: string;
  macAddress: string;
  connectedTime: string;
}
