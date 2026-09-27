import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  SafeAreaView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouterStore } from '../store/useRouterStore';
import { mifiService } from '../api/client';
import { IOS_COLORS } from '../constants/colors';

interface SmsScreenProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export const SmsScreen: React.FC<SmsScreenProps> = ({ isDarkMode, toggleTheme }) => {
  const { smsList, fetchSms } = useRouterStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isComposeVisible, setIsComposeVisible] = useState(false);
  const [receiver, setReceiver] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const theme = isDarkMode ? IOS_COLORS.dark : IOS_COLORS.light;
  const blurTint = isDarkMode ? 'dark' : 'light';

  useEffect(() => {
    fetchSms();
  }, []);

  const handleSend = async () => {
    if (!receiver || !message) {
      Alert.alert('Error', 'Please enter both phone number and message text.');
      return;
    }
    setIsSending(true);
    await mifiService.sendSms(receiver, message);
    setIsSending(false);
    setReceiver('');
    setMessage('');
    setIsComposeVisible(false);
    Alert.alert('Success', 'SMS sent via MiFi router SIM!');
    fetchSms();
  };

  const filteredMessages = smsList.filter(
    (item) =>
      item.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16 }}>
        {/* iOS Header Action Buttons */}
        <View className="flex-row justify-between items-center pt-2 pb-1">
          {/* Top Left Glass Pill 'Edit' */}
          <BlurView
            intensity={60}
            tint={blurTint}
            style={{ borderRadius: 9999, overflow: 'hidden' }}
          >
            <TouchableOpacity
              onPress={() => Alert.alert('Edit Mode', 'Select messages to delete or mark as read.')}
              style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
              className="px-4 py-2"
            >
              <Text style={{ color: theme.text }} className="text-sm font-semibold">
                Edit
              </Text>
            </TouchableOpacity>
          </BlurView>

          {/* Top Right Circular Theme / Menu Button */}
          <BlurView
            intensity={60}
            tint={blurTint}
            style={{ borderRadius: 9999, overflow: 'hidden' }}
          >
            <TouchableOpacity
              onPress={toggleTheme}
              style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
              className="w-10 h-10 items-center justify-center"
            >
              <Text style={{ color: theme.text }} className="text-base font-bold">
                ≡
              </Text>
            </TouchableOpacity>
          </BlurView>
        </View>

        {/* iOS Large Header Title */}
        <Text style={{ color: theme.text }} className="text-3xl font-extrabold tracking-tight my-2">
          Messages
        </Text>

        {/* Messages Body List or Empty State */}
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {filteredMessages.length === 0 ? (
            /* iOS Empty State */
            <View className="flex-1 items-center justify-center pt-32 pb-20">
              <View
                style={{ backgroundColor: '#8E8E93' }}
                className="w-20 h-20 rounded-full items-center justify-center mb-4 opacity-90 shadow-sm"
              >
                <Text className="text-white text-3xl">💬</Text>
              </View>

              <Text style={{ color: theme.text }} className="text-xl font-bold mb-1">
                No Messages
              </Text>
              <Text style={{ color: theme.textMuted }} className="text-sm text-center px-8">
                Messages you send or receive will appear here.
              </Text>
            </View>
          ) : (
            /* Populated iOS Message List Thread */
            <View className="pt-2 pb-24">
              {filteredMessages.map((item) => (
                <BlurView
                  key={item.id}
                  intensity={40}
                  tint={blurTint}
                  style={{
                    borderRadius: 20,
                    overflow: 'hidden',
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <View className="p-4">
                    <View className="flex-row justify-between items-center mb-1">
                      <View className="flex-row items-center">
                        <View
                          style={{ backgroundColor: theme.blue }}
                          className="w-8 h-8 rounded-full items-center justify-center mr-2.5"
                        >
                          <Text className="text-white font-bold text-xs">
                            {item.sender.substring(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={{ color: theme.text }} className="font-bold text-base">
                          {item.sender}
                        </Text>
                      </View>
                      <Text style={{ color: theme.textMuted }} className="text-xs">
                        {item.timestamp}
                      </Text>
                    </View>

                    <Text style={{ color: theme.text }} className="text-sm leading-5 mb-2 ml-10">
                      {item.content}
                    </Text>

                    {item.otpCode && (
                      <View
                        style={{
                          backgroundColor: isDarkMode ? 'rgba(255,149,0,0.15)' : 'rgba(255,149,0,0.1)',
                          borderColor: theme.orange,
                        }}
                        className="ml-10 rounded-xl p-2.5 border flex-row justify-between items-center mt-1"
                      >
                        <View>
                          <Text style={{ color: theme.orange }} className="text-xs font-bold uppercase tracking-wider">
                            OTP Code
                          </Text>
                          <Text style={{ color: theme.text }} className="font-mono font-bold text-lg tracking-widest">
                            {item.otpCode}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => Alert.alert('Copied', `OTP ${item.otpCode} copied!`)}
                          style={{ backgroundColor: theme.orange }}
                          className="px-3 py-1.5 rounded-lg"
                        >
                          <Text className="text-black font-bold text-xs">Copy OTP</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </BlurView>
              ))}
            </View>
          )}
        </ScrollView>

        {/* iOS Glass Floating Bottom Bar */}
        <View className="flex-row items-center pb-6 pt-2">
          {/* Glass Search Capsule */}
          <BlurView
            intensity={70}
            tint={blurTint}
            style={{
              flex: 1,
              borderRadius: 9999,
              overflow: 'hidden',
              marginRight: 12,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <View className="flex-row items-center px-4 py-3">
              <Text style={{ color: theme.textMuted }} className="text-base mr-2">
                🔍
              </Text>
              <TextInput
                placeholder="Search"
                placeholderTextColor={theme.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ color: theme.text }}
                className="flex-1 text-base p-0 font-normal"
              />
              <TouchableOpacity onPress={() => Alert.alert('Voice Search', 'Speak to search messages.')}>
                <Text style={{ color: theme.textMuted }} className="text-lg">
                  🎙️
                </Text>
              </TouchableOpacity>
            </View>
          </BlurView>

          {/* Glass Compose Button */}
          <BlurView
            intensity={70}
            tint={blurTint}
            style={{
              borderRadius: 9999,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <TouchableOpacity
              onPress={() => setIsComposeVisible(true)}
              className="w-12 h-12 items-center justify-center"
            >
              <Text style={{ color: theme.text }} className="text-xl">
                📝
              </Text>
            </TouchableOpacity>
          </BlurView>
        </View>

        {/* Compose Modal */}
        <Modal visible={isComposeVisible} animationType="slide" transparent>
          <SafeAreaView className="flex-1 justify-end bg-black/60">
            <View
              style={{ backgroundColor: theme.surface }}
              className="rounded-t-3xl p-5 border-t border-white/10"
            >
              <View className="flex-row justify-between items-center mb-4">
                <Text style={{ color: theme.text }} className="font-bold text-lg">
                  New Message
                </Text>
                <TouchableOpacity onPress={() => setIsComposeVisible(false)}>
                  <Text style={{ color: theme.blue }} className="font-semibold text-base">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                placeholder="To: Phone number"
                placeholderTextColor={theme.textMuted}
                value={receiver}
                onChangeText={setReceiver}
                keyboardType="phone-pad"
                style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}
                className="border rounded-xl px-3.5 py-3 mb-3 text-base"
              />

              <TextInput
                placeholder="Message"
                placeholderTextColor={theme.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}
                className="border rounded-xl px-3.5 py-3 mb-4 h-24 text-base text-top"
              />

              <TouchableOpacity
                onPress={handleSend}
                disabled={isSending}
                style={{ backgroundColor: theme.blue }}
                className="py-3.5 rounded-xl items-center shadow-md active:opacity-90"
              >
                <Text className="text-white font-bold text-base">
                  {isSending ? 'Sending...' : 'Send Message'}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
};
