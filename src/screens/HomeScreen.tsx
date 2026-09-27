import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouterStore } from '../store/useRouterStore';

export const HomeScreen: React.FC = () => {
  const { status, fetchStatus } = useRouterStore();

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <ScrollView className="flex-1 bg-surface-bg p-4">
      {/* Header Glass Banner */}
      <View className="bg-white/10 border border-white/15 rounded-3xl p-5 mb-4 shadow-2xl backdrop-blur-xl">
        <View className="flex-row justify-between items-center mb-3">
          <View>
            <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider">Device Model</Text>
            <Text className="text-content-main text-2xl font-bold mt-0.5">Jazz MiFi 4G</Text>
          </View>
          <View className="bg-brand/20 px-3.5 py-1.5 rounded-full border border-brand/50">
            <Text className="text-brand text-xs font-bold">{status.networkType}</Text>
          </View>
        </View>

        <View className="bg-black/30 px-3 py-2 rounded-xl border border-white/10 flex-row justify-between items-center">
          <Text className="text-content-muted text-xs font-medium">Gateway IP</Text>
          <Text className="text-content-main font-mono text-xs font-semibold">{status.ipAddress}</Text>
        </View>
      </View>

      {/* Grid Quick Glass Cards */}
      <View className="flex-row justify-between mb-4">
        {/* Signal Glass Card */}
        <View className="flex-1 bg-white/10 border border-white/15 rounded-2xl p-4 mr-2 shadow-lg">
          <Text className="text-content-muted text-xs font-semibold">Signal Strength</Text>
          <Text className="text-status-success text-xl font-bold mt-1">
            {'⚡'.repeat(status.signalStrength)} ({status.signalStrength}/5)
          </Text>
          <Text className="text-content-muted text-xs mt-1.5">{status.carrierName} Network</Text>
        </View>

        {/* Battery Glass Card */}
        <View className="flex-1 bg-white/10 border border-white/15 rounded-2xl p-4 ml-2 shadow-lg">
          <Text className="text-content-muted text-xs font-semibold">Battery Status</Text>
          <Text className="text-content-main text-xl font-bold mt-1">{status.batteryLevel}%</Text>
          <Text className="text-content-muted text-xs mt-1.5">
            {status.isCharging ? '🔌 Charging...' : '🔋 Discharging'}
          </Text>
        </View>
      </View>

      {/* Connected Devices Glass Card */}
      <View className="bg-white/10 border border-white/15 rounded-2xl p-4 mb-5 shadow-lg">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-content-main font-bold text-base">Connected Wi-Fi Users</Text>
            <Text className="text-content-muted text-xs mt-0.5">{status.connectedDevicesCount} active clients connected</Text>
          </View>
          <View className="bg-status-accent/20 px-3 py-1.5 rounded-xl border border-status-accent/40">
            <Text className="text-status-accent text-xs font-bold">{status.connectedDevicesCount} Devices</Text>
          </View>
        </View>
      </View>

      {/* iOS Primary Glass Action Button */}
      <TouchableOpacity
        onPress={() => fetchStatus()}
        className="bg-brand py-4 rounded-2xl items-center shadow-lg active:opacity-85"
      >
        <Text className="text-white font-bold text-base tracking-wide">Refresh Status</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
