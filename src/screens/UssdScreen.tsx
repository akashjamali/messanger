import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { mifiService } from '../api/client';
import { UssdResponse } from '../types/mifi';

export const UssdScreen: React.FC = () => {
  const [code, setCode] = useState('*111#');
  const [response, setResponse] = useState<UssdResponse | null>(null);
  const [isDialing, setIsDialing] = useState(false);

  const handleDial = async (dialCode: string) => {
    setIsDialing(true);
    const res = await mifiService.executeUssd(dialCode);
    setResponse(res);
    setIsDialing(false);
  };

  const quickCodes = [
    { label: 'Check Balance', code: '*111#' },
    { label: 'Check Data MBs', code: '*100#' },
    { label: 'SIM Number', code: '*99#' },
    { label: 'Package Status', code: '*444#' },
  ];

  return (
    <ScrollView className="flex-1 bg-surface-bg p-4">
      {/* Dial Input Glass Card */}
      <View className="bg-white/10 border border-white/15 rounded-3xl p-5 mb-5 shadow-xl">
        <Text className="text-content-main font-bold text-lg mb-2">Dial USSD Code</Text>
        <TextInput
          placeholder="e.g. *111#"
          placeholderTextColor="#9E9EA7"
          value={code}
          onChangeText={setCode}
          className="bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-content-main font-mono text-lg mb-4"
        />
        <TouchableOpacity
          onPress={() => handleDial(code)}
          disabled={isDialing}
          className="bg-brand py-3.5 rounded-xl items-center shadow-md active:opacity-85"
        >
          <Text className="text-white font-bold text-base">{isDialing ? 'Executing...' : 'Dial Code'}</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Dial Glass Buttons */}
      <Text className="text-content-main font-bold text-base mb-3">Quick Actions</Text>
      <View className="flex-row flex-wrap justify-between mb-4">
        {quickCodes.map((item) => (
          <TouchableOpacity
            key={item.code}
            onPress={() => {
              setCode(item.code);
              handleDial(item.code);
            }}
            className="w-[48%] bg-white/10 border border-white/15 rounded-2xl p-3.5 mb-3 flex-row justify-between items-center shadow-md"
          >
            <View>
              <Text className="text-content-main font-medium text-sm">{item.label}</Text>
              <Text className="text-brand font-mono text-xs font-bold mt-0.5">{item.code}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Network Response Dialog */}
      {response && (
        <View className="bg-white/10 border border-status-accent/40 rounded-3xl p-5 shadow-2xl">
          <View className="flex-row justify-between items-center mb-2.5">
            <Text className="text-status-accent font-bold text-sm">USSD Response ({response.code})</Text>
            <Text className="text-content-muted text-xs font-medium">{response.timestamp}</Text>
          </View>
          <Text className="text-content-main text-sm font-mono leading-6 bg-black/40 p-4 rounded-2xl border border-white/10">
            {response.message}
          </Text>
        </View>
      )}
    </ScrollView>
  );
};
