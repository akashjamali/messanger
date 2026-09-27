import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouterStore } from '../store/useRouterStore';
import { mifiService } from '../api/client';

export const SettingsScreen: React.FC = () => {
  const { settings, updateSettings } = useRouterStore();
  const [ip, setIp] = useState(settings.routerIp);
  const [ssid, setSsid] = useState(settings.wifiSsid);

  const handleSave = () => {
    updateSettings({ routerIp: ip, wifiSsid: ssid });
    Alert.alert('Saved', 'Router settings updated locally.');
  };

  const handleReboot = () => {
    Alert.alert(
      'Reboot Device',
      'Are you sure you want to reboot your Jazz MiFi router?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reboot Now',
          style: 'destructive',
          onPress: async () => {
            await mifiService.rebootDevice();
            Alert.alert('Rebooting', 'Reboot command sent to router. Connection will resume in 60s.');
          },
        },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-surface-bg p-4">
      {/* Network Configuration Glass Card */}
      <View className="bg-white/10 border border-white/15 rounded-3xl p-5 mb-5 shadow-xl">
        <Text className="text-content-main font-bold text-lg mb-3">Router Configuration</Text>

        <Text className="text-content-muted text-xs font-semibold uppercase mb-1">Router IP Address</Text>
        <TextInput
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.2.1"
          placeholderTextColor="#9E9EA7"
          className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-3 text-content-main mb-3.5 font-mono"
        />

        <Text className="text-content-muted text-xs font-semibold uppercase mb-1">Wi-Fi Network SSID</Text>
        <TextInput
          value={ssid}
          onChangeText={setSsid}
          placeholder="Jazz_4G_WiFi"
          placeholderTextColor="#9E9EA7"
          className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-3 text-content-main mb-4"
        />

        <TouchableOpacity onPress={handleSave} className="bg-brand py-3 rounded-xl items-center shadow-md">
          <Text className="text-white font-bold">Save Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Reboot Section Glass Card */}
      <View className="bg-white/10 border border-status-danger/40 rounded-3xl p-5 shadow-xl">
        <Text className="text-status-danger font-bold text-lg mb-1">Danger Zone</Text>
        <Text className="text-content-muted text-xs mb-4">Restart your MiFi router remotely over local Wi-Fi connection.</Text>

        <TouchableOpacity onPress={handleReboot} className="bg-status-danger py-3 rounded-xl items-center shadow-md">
          <Text className="text-white font-bold">Reboot MiFi Device</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};
