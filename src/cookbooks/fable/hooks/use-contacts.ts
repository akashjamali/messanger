import * as Contacts from "expo-contacts/legacy";
import { useCallback, useEffect, useState } from "react";
import type { Person } from "../data/people";
import { loadDeviceContacts } from "../../../services/contact-matcher";

export function useDeviceContacts() {
  const [contacts, setContacts] = useState<Person[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<
    Contacts.PermissionStatus | "loading"
  >("loading");
  const [loading, setLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshIndex((i) => i + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (cancelled) return;
        setPermissionStatus(status);
        if (status === Contacts.PermissionStatus.GRANTED) {
          const loaded = await loadDeviceContacts();
          if (cancelled) return;
          setContacts(loaded);
        } else {
          setContacts([]);
        }
      } catch (err) {
        console.warn("Failed to load device contacts:", err);
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshIndex]);

  return {
    contacts,
    permissionStatus,
    loading,
    refresh,
  };
}
