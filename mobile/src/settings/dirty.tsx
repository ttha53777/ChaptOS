/**
 * The unsaved-draft guard (the web's SettingsDirtyContext + its ConfirmDialog). A
 * section reports a draft with useDirtyGuard(key, dirty); while any is dirty, leaving
 * the page (back, edge swipe, a tab tap that pops the stack) raises the web's
 * "Discard unsaved changes?" sheet instead of throwing the draft away.
 */
import { DISCARD_COPY } from "@/lib/settings/nav";
import { usePreventRemove } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { haptics } from "~/motion/haptics";
import { Sheet } from "~/shell/sheets";
import { useTheme } from "~/theme/PaperProvider";
import { Button } from "~/paper/Button";
import { View } from "react-native";
import { T } from "~/ui/T";

type Ctx = { set: (key: string, dirty: boolean) => void };
const DirtyCtx = createContext<Ctx>({ set: () => {} });

export function useDirtyGuard(key: string, dirty: boolean) {
  const { set } = useContext(DirtyCtx);
  useEffect(() => { set(key, dirty); }, [key, dirty, set]);
  useEffect(() => () => set(key, false), [key, set]);
}

export function DirtyProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());
  const set = useCallback((key: string, dirty: boolean) => {
    setKeys(prev => {
      if (prev.has(key) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  const ctx = useMemo(() => ({ set }), [set]);
  const anyDirty = keys.size > 0;
  const pending = useRef<(() => void) | null>(null);
  const [asking, setAsking] = useState(false);

  usePreventRemove(anyDirty, ({ repeat }) => {
    pending.current = repeat;
    haptics.warn();
    setAsking(true);
  });

  return (
    <DirtyCtx.Provider value={ctx}>
      {children}
      <DiscardSheet open={asking} onClose={() => { pending.current = null; setAsking(false); }}
        onConfirm={() => {
          const go = pending.current;
          pending.current = null;
          setAsking(false);
          setKeys(new Set());
          // The guard lifts on the next render; then the held navigation runs.
          setTimeout(() => go?.(), 0);
        }} />
    </DirtyCtx.Provider>
  );
}

function DiscardSheet({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} size="fit" tone="rose" icon="alert" title={DISCARD_COPY.title}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button label={DISCARD_COPY.confirmLabel} tone="rose" onPress={onConfirm} style={{ flex: 1 }} block />
        </View>
      }>
      <T v="body" size={14} color={c.ink2}>{DISCARD_COPY.message}</T>
    </Sheet>
  );
}
