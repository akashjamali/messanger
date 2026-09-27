import { create } from 'zustand';
import { DeviceStatus, SmsMessage, RouterSettings } from '../types/mifi';
import { mifiService } from '../api/client';

interface RouterStoreState {
  status: DeviceStatus;
  smsList: SmsMessage[];
  settings: RouterSettings;
  isLoading: boolean;
  activeTab: 'home' | 'sms' | 'ussd' | 'settings';
  setActiveTab: (tab: 'home' | 'sms' | 'ussd' | 'settings') => void;
  fetchStatus: () => Promise<void>;
  fetchSms: () => Promise<void>;
  updateSettings: (newSettings: Partial<RouterSettings>) => void;
}

export const useRouterStore = create<RouterStoreState>((set, get) => ({
  status: {
    isConnected: true,
    ipAddress: '192.168.2.1',
    batteryLevel: 85,
    isCharging: false,
    signalStrength: 4,
    networkType: '4G LTE',
    carrierName: 'Jazz',
    connectedDevicesCount: 2,
  },
  smsList: [],
  settings: {
    routerIp: '192.168.2.1',
    wifiSsid: 'Jazz_4G_WiFi_829',
    wifiPasswordHide: true,
    autoRefreshInterval: 5,
  },
  isLoading: false,
  activeTab: 'home',

  setActiveTab: (tab) => set({ activeTab: tab }),

  fetchStatus: async () => {
    set({ isLoading: true });
    const status = await mifiService.getStatus();
    set({ status, isLoading: false });
  },

  fetchSms: async () => {
    const smsList = await mifiService.getSmsInbox();
    set({ smsList });
  },

  updateSettings: (newSettings) => {
    if (newSettings.routerIp) {
      mifiService.setBaseUrl(newSettings.routerIp);
    }
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },
}));
