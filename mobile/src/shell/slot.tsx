/**
 * Which record a screen's sheet is showing, kept outside the screen's own state.
 *
 *   const peek = useSlot<CalendarEvent>();
 *   <Row onPress={() => peek.set(e)} />
 *   <SlotView slot={peek}>{(e, close) => <EventSheet event={e} onClose={close} />}</SlotView>
 *
 * Opening a sheet with useState re-renders the whole screen (every card and row under
 * it) in the frames the sheet starts travelling, which is what made taps feel late and
 * the slide stutter. With a slot only the SlotView re-renders. `set` is stable, so it's
 * safe to hand to memoized rows.
 */
import { useState, type ReactNode } from "react";
import { createStore } from "~/state/store";

export type Slot<T> = ReturnType<typeof createStore<T | null>>;

export function useSlot<T>(): Slot<T> {
  const [slot] = useState(() => createStore<T | null>(null));
  return slot;
}

export function SlotView<T>({ slot, children }: { slot: Slot<T>; children: (value: T | null, close: () => void) => ReactNode }) {
  const value = slot.use();
  return <>{children(value, () => slot.set(null))}</>;
}
