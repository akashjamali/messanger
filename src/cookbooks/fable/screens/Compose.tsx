import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { Pressable, Text, TextInput, View } from "react-native";
import { Avatar } from "../components/ui/avatar";
import { GlassButton } from "../components/ui/glass-button";
import { registerPerson } from "../data/people";
import { useDeviceContacts } from "../hooks/use-contacts";
import { useTheme } from "../hooks/use-theme";
import { generateNormalizedChatId } from "../../../utils/phone";

export default function Compose() {
  const [query, setQuery] = useState("");
  const theme = useTheme();
  const { contacts, loading } = useDeviceContacts();

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return contacts;
    const q = trimmed.toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const matches = contacts.filter((c) => {
      // 1. Name match (case-insensitive substring)
      if (c.name && c.name.toLowerCase().includes(q)) return true;
      if (c.first && c.first.toLowerCase().includes(q)) return true;

      // 2. Direct string phone match
      if (c.phone && c.phone.toLowerCase().includes(q)) return true;
      if (
        c.phones &&
        c.phones.some((p) => p.toLowerCase().includes(q))
      ) {
        return true;
      }

      // 3. Digit-based search (ignoring formatting like dashes, spaces, parentheses, +92)
      if (qDigits.length >= 2) {
        const allCandidatePhones = [
          c.phone,
          ...(c.phones || []),
        ].filter(Boolean) as string[];
        for (const phone of allCandidatePhones) {
          const phoneDigits = phone.replace(/\D/g, "");
          if (!phoneDigits) continue;

          // Exact digit match or substring
          if (
            phoneDigits.includes(qDigits) ||
            qDigits.includes(phoneDigits)
          ) {
            return true;
          }

          // Core subscriber digits match (last 10 digits, e.g. 3001234567)
          const phoneCore =
            phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
          const qCore =
            qDigits.length >= 10 ? qDigits.slice(-10) : qDigits;
          if (phoneCore.includes(qCore) || qCore.includes(phoneCore)) {
            return true;
          }
        }
      }

      return false;
    });

    if (
      /[0-9+]/.test(trimmed) &&
      !matches.some((m) => {
        const mDigits = (m.phone || "").replace(/\D/g, "");
        return mDigits === qDigits || m.phone === trimmed;
      })
    ) {
      return [
        {
          id: trimmed,
          name: trimmed,
          first: trimmed,
          phone: trimmed,
        },
        ...matches,
      ];
    }
    return matches;
  }, [contacts, query]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 28 }}>
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 24,
          alignItems: "center",
          gap: 16,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 26,
            fontWeight: "600",
            color: theme.label,
          }}
        >
          New message
        </Text>
        <GlassButton
          symbol="xmark"
          accessibilityLabel="Close new message"
          onPress={() => router.back()}
        />
      </View>
      <TextInput
        accessibilityLabel="Find a contact"
        placeholder="Find a contact"
        placeholderTextColor={theme.secondary}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        style={{
          margin: 24,
          padding: 16,
          borderRadius: 24,
          borderCurve: "continuous",
          fontSize: 17,
          color: theme.label,
          backgroundColor: theme.surface,
        }}
      />
      <FlashList
        data={filtered}
        keyExtractor={(person) => person.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${item.name}`}
            onPress={() => {
              const targetId = item.phone
                ? generateNormalizedChatId(item.phone)
                : item.id;
              registerPerson({
                id: targetId,
                name: item.name,
                first: item.first,
                avatar: item.avatar,
                phone: item.phone,
              });
              router.replace({
                pathname: "/fable/chat/[id]",
                params: { id: targetId },
              });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingVertical: 12,
            }}
          >
            <Avatar source={item.avatar} name={item.name} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.label, fontSize: 17, fontWeight: "500" }}>
                {item.name}
              </Text>
              {Boolean(item.phone) && (
                <Text style={{ color: theme.secondary, fontSize: 14, marginTop: 2 }}>
                  {item.phone}
                </Text>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text
            style={{
              color: theme.secondary,
              paddingVertical: 32,
              textAlign: "center",
            }}
          >
            {loading ? "Loading contacts..." : "No contacts found."}
          </Text>
        }
      />
    </View>
  );
}
