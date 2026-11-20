/**
 * Ask Chapt (U8). A modal over the tabs: on iOS a page sheet you pull down to close, on
 * Android a slide-up screen that back closes. The page fits the keyboard
 * (react-native-keyboard-controller): the composer rides on top of it and the landing
 * compacts while it's up.
 *
 *   empty         Landing: greeting, the note, three starter tickets
 *   a turn        your question as a slip on the right; the ledger working down the
 *                 margin; then the answer block (~/chat/Answer)
 *   a row / name  opens its record in a sheet (GET /api/ai/peek)
 *   a citation    opens the cited passage of an attached file
 *   off           Ask Chapt is switched off for this chapter: says so, no composer
 *
 * The thread is this chapter's, kept on the phone (~/chat/thread); New starts over and
 * forgets the attached files on the server too.
 */
import type { AnswerCitation, EntityRef } from "@/lib/api-types";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import Animated, { FadeInDown, FadeIn, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AssistantTurn } from "~/chat/Answer";
import { Composer } from "~/chat/Composer";
import { clearFiles, openFiles, takeForSend } from "~/chat/files";
import { Landing } from "~/chat/Landing";
import { LocalSheet } from "~/chat/LocalSheet";
import { PeekBody } from "~/chat/PeekBody";
import { ActionsContext, type AnswerActions } from "~/chat/shapes/common";
import { clearThread, freshIds, openThread, send, setReducedMotion, stop, threadNow, useThread } from "~/chat/thread";
import type { ChatMsg } from "~/chat/types";
import { config } from "~/config";
import { useChatAvailability, usePeek, useUnit } from "~/data/chat";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { CloseX } from "~/shell/sheets";
import { EmptyState, ErrorState, SkeletonCard } from "~/shell/states";
import { useActiveOrg } from "~/state/org";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export default function Ask() {
  const { c } = useTheme();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const entry = useEntryOf("ready");
  const slug = useActiveOrg().slug;
  const thread = useThread();
  const avail = useChatAvailability();
  const kbUp = useKeyboardState(s => s.isVisible);
  // ?q= arrives from a page's ask button (Parties: "Ask what the door cleared"): it
  // waits in the composer, one tap from sent.
  const { q: seed } = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState(typeof seed === "string" ? seed : "");
  const [peek, setPeek] = useState<EntityRef | null>(null);
  const [cite, setCite] = useState<AnswerCitation | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const atEnd = useRef(true);

  useEffect(() => { setReducedMotion(m.reduced); }, [m.reduced]);
  useEffect(() => { if (slug) { void openThread(slug); void openFiles(slug); } }, [slug]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const limits = avail.data?.files && avail.data.fileLimits ? avail.data.fileLimits : null;

  const ask = useCallback((q: string) => {
    const text = q.trim();
    if (!text || threadNow().streaming) return; // read outside React so a double tap can't queue a second turn
    setDraft("");
    atEnd.current = true;
    void send(text, takeForSend());
  }, []);

  const actions = useMemo<AnswerActions>(() => ({
    peek: r => { input.current?.blur(); setPeek(r); },
    ask,
    cite: ct => { input.current?.blur(); setCite(ct); },
    screen: path => { if (slug) void WebBrowser.openBrowserAsync(`${config.apiUrl}/org/${slug}${path.startsWith("/") ? path : `/${path}`}`); },
  }), [ask, slug]);

  const fresh = () => { haptics.tap(); stop(); clearThread(); clearFiles(); setDraft(""); };
  const first = entry ? entry.me.name.split(" ")[0] || entry.me.name : "";
  const orgName = entry?.me.org?.name ?? "";
  const empty = thread.loaded && thread.messages.length === 0;

  return (
    <ActionsContext.Provider value={actions}>
      <View style={[styles.root, { backgroundColor: c.paper }]}>
        <View style={[styles.bar, { paddingTop: Platform.OS === "ios" ? 14 : insets.top + 10, borderBottomColor: empty ? "transparent" : c.line }]}>
          <View style={[styles.mark, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
            <Icon name="spark" size={15} color={c.pastel.lilac.ink} />
          </View>
          <T v="subhead" style={{ flex: 1 }} accessibilityRole="header">Ask Chapt</T>
          {thread.messages.length ? <Button label="New" icon="plus" variant="soft" size="sm" onPress={fresh} /> : null}
          <CloseX onPress={close} />
        </View>

        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {avail.data && !avail.data.enabled ? (
            <View style={{ flex: 1, justifyContent: "center", padding: 18 }}>
              <EmptyState
                pictures={[{ icon: "spark", tone: "lilac", label: "Ask in words" }, { icon: "board", tone: "butter", label: "It reads the records" }, { icon: "check", tone: "mint", label: "You get the answer" }]}
                title="Ask Chapt is off for this chapter."
                line="An officer can switch it on in Settings on chaptos.com."
              />
            </View>
          ) : !thread.loaded ? (
            <View style={{ flex: 1, padding: 18, gap: 12 }}><SkeletonCard lines={2} /><SkeletonCard lines={3} /></View>
          ) : empty ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
              <Landing first={first} org={orgName} compact={kbUp} onAsk={ask} />
            </ScrollView>
          ) : (
            <ScrollView
              ref={scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{ padding: 18, gap: 22, paddingBottom: 24 }}
              onScroll={e => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
              }}
              scrollEventThrottle={64}
              onContentSizeChange={() => { if (atEnd.current) scroll.current?.scrollToEnd({ animated: !m.reduced }); }}
            >
              {thread.messages.map((msg, i) => msg.role === "user"
                ? <UserSlip key={msg.id} msg={msg} />
                : <AssistantTurn key={msg.id} msg={msg} streaming={thread.streaming && i === thread.messages.length - 1} />)}
            </ScrollView>
          )}

          {avail.data?.enabled === false ? null : (
            <View style={[styles.dock, { paddingBottom: kbUp ? 8 : Math.max(insets.bottom, 12), borderTopColor: empty ? "transparent" : c.lineSoft, backgroundColor: c.paper }]}>
              {avail.isError && !avail.data ? <T v="meta" color={c.ink3}>Couldn't check Ask Chapt. You can still try asking.</T> : null}
              <Composer value={draft} onChange={setDraft} onSend={() => ask(draft)} onStop={stop} streaming={thread.streaming} limits={limits} inputRef={input} />
            </View>
          )}
        </KeyboardAvoidingView>

        <LocalSheet open={!!peek} onClose={() => setPeek(null)} kicker={peek ? KICKER[peek.type] : undefined}>
          {peek ? <PeekSheetBody refx={peek} /> : null}
        </LocalSheet>
        <LocalSheet open={!!cite} onClose={() => setCite(null)} kicker={cite?.locator} title={cite?.name}>
          {cite ? <CiteBody cite={cite} /> : null}
        </LocalSheet>
      </View>
    </ActionsContext.Provider>
  );
}

const KICKER: Record<string, string> = { member: "Member", event: "Event", task: "Task", transaction: "Transaction" };

function UserSlip({ msg }: { msg: ChatMsg }) {
  const { c } = useTheme();
  const m = useMotion();
  const fresh = freshIds.has(msg.id);
  const body = (
    <View style={[styles.slip, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
      <T v="body">{msg.content}</T>
      {msg.attachments?.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {msg.attachments.map(n => (
            <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="clip" size={11} color={c.ink3} />
              <T v="meta" color={c.ink3} numberOfLines={1}>{n}</T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
  if (!fresh) return body;
  return <Animated.View entering={(m.reduced ? FadeIn.duration(m.t(160)) : FadeInDown.duration(m.t(220))).reduceMotion(ReduceMotion.Never)}>{body}</Animated.View>;
}

function PeekSheetBody({ refx }: { refx: EntityRef }) {
  const q = usePeek(refx);
  if (q.data) return <PeekBody card={q.data} />;
  if (q.isError) return <ErrorState compact title="Couldn't open this record." error={q.error} onRetry={() => void q.refetch()} />;
  return <View style={{ gap: 10 }}><SkeletonCard lines={2} /><SkeletonCard lines={3} /></View>;
}

function CiteBody({ cite }: { cite: AnswerCitation }) {
  const { c } = useTheme();
  const q = useUnit(cite.attachmentId, cite.unit);
  if (q.isError) return <ErrorState compact title="Couldn't open this passage." error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <SkeletonCard lines={4} />;
  const u = q.data;
  return (
    <View style={{ gap: 10 }}>
      <T v="label" color={c.ink3}>{u.label}</T>
      {u.text ? <T v="body" selectable>{u.text}</T> : null}
      {u.grid ? (
        <ScrollView keyboardShouldPersistTaps="handled" horizontal>
          <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 8 }}>
            {u.grid.map((row, i) => (
              <View key={i} style={{ flexDirection: "row", borderTopWidth: i ? 1 : 0, borderTopColor: c.lineSoft }}>
                {row.map((cell, j) => (
                  <View key={j} style={{ width: 110, padding: 6, borderLeftWidth: j ? 1 : 0, borderLeftColor: c.lineSoft }}>
                    <T v="mono" style={{ fontSize: 11.5 }} numberOfLines={3}>{cell == null ? "" : String(cell)}</T>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {!u.text && !u.grid ? <T v="meta" color={c.ink3}>This passage is empty.</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1 },
  mark: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  dock: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, gap: 6 },
  slip: { alignSelf: "flex-end", maxWidth: "86%", borderWidth: 1, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
});
