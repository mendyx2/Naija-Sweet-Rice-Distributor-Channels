/** Nigeria's 36 states and the FCT, as stored on delivery areas. */
export const NIGERIAN_STATES = [
  "FCT", "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

export const isNigerianState = (s: string): s is NigerianState => (NIGERIAN_STATES as readonly string[]).includes(s);

/** "FCT" reads as "Abuja (FCT)" to customers; other states as they are. */
export const stateLabel = (s: string) => (s === "FCT" ? "Abuja (FCT)" : s);

/** States in display order: FCT first, then alphabetical. */
export const sortStates = (states: Iterable<string>) =>
  [...new Set(states)].sort((a, b) => (a === "FCT" ? -1 : b === "FCT" ? 1 : a.localeCompare(b)));

/** "Gwarinpa, Abuja" / "Ikeja, Lagos" */
export const areaPlace = (z: { name: string; state: string }) => `${z.name}, ${z.state === "FCT" ? "Abuja" : z.state}`;
