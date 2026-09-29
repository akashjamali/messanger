import * as Contacts from "expo-contacts/legacy";
import { registerPeople, type Person } from "../cookbooks/fable/data/people";
import { generateNormalizedChatId, generateChatId } from "../utils/phone";

export { generateNormalizedChatId, generateChatId };

let cachedContacts: Person[] = [];

/**
 * Extracts core subscriber digits (last 10 digits for mobile numbers).
 * E.g.:
 * "+9203009204986" -> "3009204986"
 * "03009204986"    -> "3009204986"
 * "+923009204986"   -> "3009204986"
 * "00923009204986" -> "3009204986"
 */
export function getCorePhoneDigits(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function normalizeForContactSearch(phone: string): string {
  return generateNormalizedChatId(phone);
}

/**
 * Finds a matching contact in the provided contacts list based on normalized phone number.
 * Supports +920, 0092, +92, local 03, and international formats.
 */
export function findContactByNumber(
  rawNumber: string,
  contacts: Person[],
): Person | null {
  if (!rawNumber || !contacts.length) return null;
  const rawClean = rawNumber.trim().replace(/[\s\-().]/g, "");
  const targetCore = getCorePhoneDigits(rawNumber);

  for (const contact of contacts) {
    const candidateNumbers: string[] = [];
    if (contact.phone) candidateNumbers.push(contact.phone);
    if (Array.isArray(contact.phones)) candidateNumbers.push(...contact.phones);

    for (const num of candidateNumbers) {
      if (!num) continue;
      const numClean = num.trim().replace(/[\s\-().]/g, "");
      if (numClean === rawClean) return contact;
      const candCore = getCorePhoneDigits(num);
      if (targetCore && candCore && targetCore === candCore) {
        return contact;
      }
    }
  }
  return null;
}

/**
 * Loads device contacts securely and caches them in memory.
 */
export async function loadDeviceContacts(): Promise<Person[]> {
  try {
    let { status } = await Contacts.getPermissionsAsync();
    if (status !== Contacts.PermissionStatus.GRANTED) {
      const req = await Contacts.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== Contacts.PermissionStatus.GRANTED) {
      return cachedContacts;
    }

    let allData: Contacts.Contact[] = [];
    let pageOffset = 0;
    const pageSize = 1000;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Image,
        ],
        sort: Contacts.SortTypes.FirstName,
        pageSize,
        pageOffset,
      });

      if (result.data && result.data.length > 0) {
        allData = allData.concat(result.data);
      }
      hasNextPage = Boolean(
        result.hasNextPage && result.data && result.data.length > 0,
      );
      pageOffset += pageSize;
      if (pageOffset > 10000) break;
    }

    if (allData.length > 0) {
      cachedContacts = allData
        .filter(
          (c) =>
            c.name ||
            c.firstName ||
            c.lastName ||
            (c.phoneNumbers && c.phoneNumbers.length > 0),
        )
        .map((c) => {
          const name =
            c.name ||
            [c.firstName, c.lastName].filter(Boolean).join(" ") ||
            c.phoneNumbers?.[0]?.number ||
            "Contact";
          const allPhones = (c.phoneNumbers || [])
            .map((p) => p.number)
            .filter((n): n is string => Boolean(n));
          const primaryPhone = allPhones[0] || "";

          return {
            id:
              (c as any).id ||
              `contact-${name.toLowerCase().replace(/\s+/g, "-")}`,
            name,
            first: c.firstName || name.split(" ")[0] || name,
            avatar:
              c.imageAvailable && c.image?.uri
                ? { uri: c.image.uri }
                : undefined,
            phone: primaryPhone,
            phones: allPhones,
          };
        });

      // Register into global PEOPLE_BY_ID immediately
      registerPeople(cachedContacts);
    }
    return cachedContacts;
  } catch {
    return cachedContacts;
  }
}

/**
 * Returns numeric milliseconds from raw router timestamp for strict chronological sorting.
 */
export function parseSMSTimestampMillis(rawDate: string): number {
  if (!rawDate) return Date.now();

  const clean = rawDate.trim();
  const parts = clean.split(/[,;\s:-]/).filter(Boolean);

  if (parts.length >= 5) {
    let year = parseInt(parts[0] || "26", 10);
    if (year < 100) year += 2000;
    const month = parseInt(parts[1] || "1", 10);
    const day = parseInt(parts[2] || "1", 10);
    const hour = parseInt(parts[3] || "0", 10);
    const min = parseInt(parts[4] || "0", 10);
    const sec = parseInt(parts[5] || "0", 10);

    // Use local time numeric constructor to prevent UTC/Hermes timezone skew
    const localDate = new Date(year, month - 1, day, hour, min, sec);
    const time = localDate.getTime();
    if (!isNaN(time)) {
      // Guard against future dates due to router clock skew:
      // If router time is in the future compared to device clock + 30s, clamp to Date.now()
      if (time > Date.now() + 30000) {
        return Date.now();
      }
      return time;
    }
  }

  try {
    const d = new Date(rawDate);
    const time = d.getTime();
    if (!isNaN(time)) {
      return time > Date.now() + 30000 ? Date.now() : time;
    }
  } catch {}

  return Date.now();
}

/**
 * Extracts and parses timestamp directly from the API's payload
 * so the date and time reflect the exact date/time received by the SIM card.
 */
export function parseSMSTimestamp(rawDate: string): string {
  if (!rawDate) return "now";

  // Formats like "26,09,29,20,15,00,+20" or "26;09;29;20;15;00;+5"
  const parts = rawDate.split(/[,;\s:-]/).filter(Boolean);
  if (parts.length >= 5) {
    let year = parts[0] || "26";
    if (year.length === 2) year = "20" + year;
    const month = (parts[1] || "1").padStart(2, "0");
    const day = (parts[2] || "1").padStart(2, "0");
    const hour = (parts[3] || "0").padStart(2, "0");
    const min = (parts[4] || "0").padStart(2, "0");

    const msgDate = new Date(`${year}-${month}-${day}T${hour}:${min}:00`);
    if (!isNaN(msgDate.getTime())) {
      const now = new Date();
      const isToday =
        msgDate.getDate() === now.getDate() &&
        msgDate.getMonth() === now.getMonth() &&
        msgDate.getFullYear() === now.getFullYear();

      const timeStr = msgDate.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });

      if (isToday) return timeStr;

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        msgDate.getDate() === yesterday.getDate() &&
        msgDate.getMonth() === yesterday.getMonth() &&
        msgDate.getFullYear() === yesterday.getFullYear();

      if (isYesterday) return `Yesterday ${timeStr}`;

      return `${msgDate.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
    }
  }

  // Fallback for standard ISO / parseable date string
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  } catch {
    // Ignore error and return rawDate
  }

  return rawDate;
}
