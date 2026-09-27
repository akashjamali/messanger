import { Contact, ContactField, requestPermissionsAsync } from "expo-contacts";

export type SavedContact = {
  name: string;
  phone: string;
};

export function phoneKeys(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (!digits) return [];
  const keys = new Set<string>([digits]);
  if (digits.length > 10) keys.add(digits.slice(-10));
  if (digits.startsWith("92") && digits.length > 10) keys.add(`0${digits.slice(2)}`);
  if (digits.startsWith("0") && digits.length > 1) keys.add(`92${digits.slice(1)}`);
  return [...keys];
}

export function lookupName(number: string, book: SavedContact[]): string | null {
  const wanted = new Set(phoneKeys(number));
  if (wanted.size === 0) return null;
  for (const person of book) {
    if (phoneKeys(person.phone).some((key) => wanted.has(key))) return person.name;
  }
  return null;
}

export function samePhone(left: string, right: string): boolean {
  const keys = new Set(phoneKeys(left));
  return phoneKeys(right).some((key) => keys.has(key));
}

export async function loadPhoneBook(): Promise<SavedContact[]> {
  const permission = await requestPermissionsAsync();
  if (permission.status !== "granted") return [];
  const rows = await Contact.getAllDetails([ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.PHONES]);
  const people: SavedContact[] = [];
  for (const row of rows) {
    const name = [row.givenName, row.familyName].filter(Boolean).join(" ").trim();
    if (!name) continue;
    for (const phone of row.phones ?? []) {
      if (phone.number) people.push({ name, phone: phone.number });
    }
  }
  return people;
}

export async function savePhoneContact(name: string, phone: string): Promise<boolean> {
  const permission = await requestPermissionsAsync();
  if (permission.status !== "granted") return false;
  await Contact.create({
    givenName: name.trim(),
    phones: [{ label: "mobile", number: phone }],
  });
  return true;
}
