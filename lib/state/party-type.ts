export const PartyType = {
  Open:   "Open",
  Closed: "Closed",
} as const;

export type PartyType = (typeof PartyType)[keyof typeof PartyType];

export const PARTY_TYPES: readonly PartyType[] = Object.values(PartyType);

export function isPartyType(value: unknown): value is PartyType {
  return typeof value === "string" && (PARTY_TYPES as readonly string[]).includes(value);
}
