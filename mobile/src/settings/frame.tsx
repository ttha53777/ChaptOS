/**
 * The frame every Settings page sits in: the native Screen (back to where you came
 * from), the unsaved-draft guard, and one floating slot over the scroll for a section's
 * sticky bar (Identity's save bar, the web's `.id-savebar`).
 *
 * The slot is a tiny store, not state: a section sets its bar on every render and only
 * the host re-renders, so the page under it doesn't.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type ScrollViewInstance } from "react-native";
import { Screen } from "~/shell/Screen";
import { createStore } from "~/state/store";
import { DirtyProvider } from "./dirty";

type Slot = ReturnType<typeof createStore<ReactNode>>;
const FloatCtx = createContext<Slot | null>(null);
const TopCtx = createContext<() => void>(() => {});

/** Scroll the page back to its top (Invitations' "Create replacement link"). */
export const useScrollTop = () => useContext(TopCtx);

/** Float `node` over the bottom of the page while this component is mounted. */
export function useFloating(node: ReactNode) {
  const slot = useContext(FloatCtx);
  useEffect(() => { slot?.set(node); });
  useEffect(() => () => slot?.set(null), [slot]);
}

function FloatHost({ slot }: { slot: Slot }) {
  const node = slot.use();
  if (!node) return null;
  return <View style={styles.float} pointerEvents="box-none">{node}</View>;
}

export function SettingsFrame({ title, back, onRefresh, children }: { title: string; back: string; onRefresh?: () => Promise<unknown>; children: ReactNode }) {
  const [slot] = useState(() => createStore<ReactNode>(null));
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const [top] = useState(() => () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  return (
    <FloatCtx.Provider value={slot}>
      <TopCtx.Provider value={top}>
        <DirtyProvider>
          <Screen title={title} back={back} onRefresh={onRefresh} scrollRef={scrollRef} overlay={<FloatHost slot={slot} />}>
            {children}
          </Screen>
        </DirtyProvider>
      </TopCtx.Provider>
    </FloatCtx.Provider>
  );
}

const styles = StyleSheet.create({
  float: { position: "absolute", left: 14, right: 14, bottom: 12 },
});
