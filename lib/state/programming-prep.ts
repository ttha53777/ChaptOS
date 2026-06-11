export const ROOM_STATUSES = ["na", "not_submitted", "submitted", "confirmed"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export function isRoomStatus(value: string): value is RoomStatus {
  return (ROOM_STATUSES as readonly string[]).includes(value);
}

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  na:             "N/A",
  not_submitted:  "Not submitted",
  submitted:      "Submitted",
  confirmed:      "Confirmed",
};

export const ROOM_STATUS_PILL: Record<RoomStatus, { text: string; bg: string; ring: string }> = {
  na:             { text: "text-slate-300",   bg: "bg-slate-500/20",   ring: "ring-slate-400/30"   },
  not_submitted:  { text: "text-amber-300",   bg: "bg-amber-500/25",   ring: "ring-amber-500/40"   },
  submitted:      { text: "text-sky-300",     bg: "bg-sky-500/20",     ring: "ring-sky-500/35"     },
  confirmed:      { text: "text-emerald-300", bg: "bg-emerald-500/20", ring: "ring-emerald-500/35" },
};

// Backwards-compatible aliases while older components are replaced.
export const ROOM_CONFIRMED_STATUSES = ROOM_STATUSES;
export type RoomConfirmedStatus = RoomStatus;
export const ROOM_CONFIRMED_LABELS = ROOM_STATUS_LABELS;
export const ROOM_CONFIRMED_PILL = ROOM_STATUS_PILL;
