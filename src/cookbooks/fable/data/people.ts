export type Person = {
  id: string;
  name: string;
  first: string;
  avatar?: number | { uri: string };
  phone?: string;
  phones?: string[];
};

export const ME: Person = {
  id: "me",
  name: "You",
  first: "You",
  avatar: require("../../../../assets/cookbooks/fable/avatars/me.jpg"),
};

export const PEOPLE: Person[] = [];

export const PEOPLE_BY_ID: Record<string, Person> = Object.create(null);
PEOPLE_BY_ID[ME.id] = ME;

function indexPhoneVariants(phone: string, person: Person) {
  if (!phone) return;
  PEOPLE_BY_ID[phone] = person;
  const digits = phone.replace(/\D/g, "");
  if (digits) {
    PEOPLE_BY_ID[digits] = person;
  }
  if (digits.length >= 10) {
    const core = digits.slice(-10);
    PEOPLE_BY_ID[core] = person;
    PEOPLE_BY_ID[`0${core}`] = person;
    PEOPLE_BY_ID[`+92${core}`] = person;
    PEOPLE_BY_ID[`+920${core}`] = person;
    PEOPLE_BY_ID[`0092${core}`] = person;
  }
}

export function registerPerson(person: Person) {
  if (person && person.id) {
    PEOPLE_BY_ID[person.id] = person;
    if (person.phone) {
      indexPhoneVariants(person.phone, person);
    }
    if (Array.isArray(person.phones)) {
      for (const p of person.phones) {
        indexPhoneVariants(p, person);
      }
    }
  }
}

export function registerPeople(people: Person[]) {
  for (const person of people) {
    registerPerson(person);
  }
}

export function getPerson(id: string): Person {
  if (PEOPLE_BY_ID[id]) return PEOPLE_BY_ID[id];

  // Try matching phone digits or last 10 digits
  const digits = id.replace(/\D/g, "");
  if (digits && PEOPLE_BY_ID[digits]) {
    return PEOPLE_BY_ID[digits];
  }
  if (digits.length >= 10) {
    const core = digits.slice(-10);
    if (PEOPLE_BY_ID[core]) {
      return PEOPLE_BY_ID[core];
    }
  }

  return {
    id,
    name: id,
    first: id,
    phone: id,
  };
}
