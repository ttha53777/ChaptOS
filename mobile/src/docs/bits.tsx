/**
 * The Docs page's pieces at web phone width (app/org/[slug]/docs/* with app/paper-docs.css):
 *
 *   Fav           the kind tile: the site's favicon, or the kind's glyph on its pastel
 *                 (Doc sky · Sheet mint · Form lilac · Drive butter · Link peach)
 *   PinnedCard    a taped index card on the shelf: tile + kind chip, rose head-rule, title,
 *                 the ruled note ("No description yet."), host and "Open ↗", the ⋯ menu
 *   LedgerRow     one reference in a folder: tile, title, description, ⋯
 *   FolderSection a manila tab (chevron, folder, name, "N docs", pin) on an ink ledger body
 *                 with its section colour as a hard shadow; Unfiled is dashed; folded, the
 *                 tab closes onto a striped lip
 *   GhostAdd      "Add to {folder}…", the dashed last row for officers
 *   ActionSheet   the ⋯ menu as a sheet (the web's popover), word for word
 *
 * At phone width the web hides the row's host, kind and date and the fold hint; so do we.
 * Rows open the link in the in-app browser.
 */
import type { Doc, DocFolder } from "@/lib/api-types";
import { docCountLabel, hostOf, KIND_LABEL, kindOf, type FolderHue, type Kind } from "@/lib/docs/library";
import * as WebBrowser from "expo-web-browser";
import { memo, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { pressedDim } from "~/motion/press";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export const KIND_TONE: Record<Kind, Tone> = { doc: "sky", sheet: "mint", form: "lilac", drive: "butter", link: "peach" };
export const KIND_ICON: Record<Kind, IconName> = { doc: "doc", sheet: "sheet", form: "form", drive: "drive", link: "link" };

export function openDoc(url: string) {
  if (!/^https?:\/\//i.test(url)) { toast.error("Can't open that link", { detail: "It isn't a web address." }); return; }
  void WebBrowser.openBrowserAsync(url).catch(() => toast.error("Couldn't open that link"));
}

export function Fav({ kind, favicon, size = 32 }: { kind: Kind; favicon?: string | null; size?: number }) {
  const { c } = useTheme();
  const p = c.pastel[KIND_TONE[kind]];
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.fav, { width: size, height: size, backgroundColor: p.soft, borderColor: p.border }]}>
      {favicon && !failed
        ? <Image source={{ uri: favicon }} style={{ width: 16, height: 16 }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
        : <Icon name={KIND_ICON[kind]} size={16} color={p.ink} />}
    </View>
  );
}

export function KindChip({ kind }: { kind: Kind }) {
  const { c } = useTheme();
  const p = c.pastel[KIND_TONE[kind]];
  return (
    <View style={[styles.kind, { backgroundColor: p.soft, borderColor: p.border }]}>
      <T v="kicker" size={10} ls={0.09} color={p.ink}>{KIND_LABEL[kind]}</T>
    </View>
  );
}

function MenuBtn({ label, onPress, dim }: { label: string; onPress: () => void; dim?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [styles.menuBtn, { opacity: dim ? 0.55 : 1 }, pressed && pressedDim]}>
      <View style={{ transform: [{ rotate: "90deg" }] }}><Icon name="dots" size={16} color={c.ink3} /></View>
    </Pressable>
  );
}

/* ── the shelf ───────────────────────────────────────────────────────────────── */

const ROT = [-0.8, 0.7, -0.3];

export const PinnedCard = memo(function PinnedCard({ doc, index, onMenu }: { doc: Doc; index: number; onMenu: (d: Doc) => void }) {
  const { c } = useTheme();
  const kind = kindOf(doc.url);
  const p = c.pastel[KIND_TONE[kind]];
  return (
    <Pressable onPress={() => openDoc(doc.url)} accessibilityRole="link" accessibilityLabel={`${doc.title}, pinned. Opens ${hostOf(doc.url)}`}
      style={({ pressed }) => [styles.card, {
        backgroundColor: c.card, borderColor: c.ink, boxShadow: `4px 4px 0 ${p.fill}`,
        transform: [{ rotate: `${ROT[index % 3]}deg` }, { scale: pressed ? 0.98 : 1 }],
      }]}>
      <View style={[styles.tape, { backgroundColor: p.fill, borderColor: c.line2 }]} />
      <View style={[styles.cardTop, { borderBottomColor: c.pastel.rose.fill }]}>
        <Fav kind={kind} favicon={doc.faviconUrl} />
        <KindChip kind={kind} />
      </View>
      <T v="subhead" size={17} ls={-0.022} lh={1.2} style={{ marginTop: 11 }}>{doc.title}</T>
      <View style={{ marginTop: 5 }}>
        <T v="meta" size={13} lh={1.58} color={doc.description ? c.ink2 : c.ink3}
          style={[styles.ruled, { borderBottomColor: c.pastel.sky.border }]}>{doc.description || "No description yet."}</T>
      </View>
      <View style={styles.cardFoot}>
        <T v="mono" size={11.5} color={c.ink3} numberOfLines={1} style={{ flex: 1 }}>{hostOf(doc.url)}</T>
        <T v="buttonSm" size={12.5} color={c.ink2}>Open</T>
        <Icon name="out" size={12} color={c.ink2} />
      </View>
      <View style={styles.cardMenu}><MenuBtn label="Doc actions" onPress={() => onMenu(doc)} /></View>
    </Pressable>
  );
});

/* ── the ledgers ─────────────────────────────────────────────────────────────── */

export const LedgerRow = memo(function LedgerRow({ doc, first, onMenu }: { doc: Doc; first: boolean; onMenu: (d: Doc) => void }) {
  const { c } = useTheme();
  const kind = kindOf(doc.url);
  return (
    <Pressable onPress={() => openDoc(doc.url)} accessibilityRole="link" accessibilityLabel={`${doc.title}. Opens ${hostOf(doc.url)}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.paper2 }]}>
      {!first ? <View style={[styles.rowRule, { borderTopColor: c.lineSoft }]} /> : null}
      <Fav kind={kind} favicon={doc.faviconUrl} />
      <View style={{ flex: 1, gap: 1 }}>
        <T v="bodyStrong" size={14.5} ls={-0.01} lh={1.3}>{doc.title}</T>
        {doc.description ? <T v="meta" size={12.5} color={c.ink3}>{doc.description}</T> : null}
      </View>
      <MenuBtn label="Doc actions" onPress={() => onMenu(doc)} dim />
    </Pressable>
  );
});

export function GhostAdd({ name, onPress }: { name: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { marginTop: 4 }, pressed && { backgroundColor: c.paper2 }]}>
      <View style={[styles.fav, { width: 32, height: 32, borderStyle: "dashed", borderColor: c.line2 }]}><Icon name="plus" size={14} color={c.ink3} /></View>
      <T v="callout" size={14.5} color={c.ink3} style={{ flex: 1 }}>{`Add to ${name}…`}</T>
    </Pressable>
  );
}

export function FolderSection({ folder, name, hue, count, open, canFold, onToggle, onMenu, children }: {
  folder: DocFolder | null; name: string; hue: FolderHue | null; count: number; open: boolean; canFold: boolean;
  onToggle: () => void; onMenu: (() => void) | null; children: ReactNode;
}) {
  const { c } = useTheme();
  const fc = hue ? c.pastel[hue].fill : c.line2;
  const unfiled = folder == null;
  const dash = unfiled ? "dashed" as const : "solid" as const;
  return (
    <View style={{ marginTop: 28 }}>
      <View style={styles.head}>
        <Pressable onPress={canFold ? onToggle : undefined} accessibilityRole="button" accessibilityState={{ expanded: open }}
          accessibilityLabel={`${name}, ${docCountLabel(count)}`}
          style={[styles.tab, { borderColor: c.ink, borderStyle: dash, backgroundColor: c.card, borderBottomColor: open ? c.card : c.ink }]}>
          <View style={[styles.tabStripe, { backgroundColor: fc }]} />
          <View style={{ transform: [{ rotate: open ? "0deg" : "-90deg" }] }}><Icon name="chev-d" size={14} color={c.ink3} /></View>
          <Icon name="folder" size={17} color={c.ink2} />
          <T v="subhead" size={17} ls={-0.022} numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
          <T v="mono" size={11} color={c.ink3}>{docCountLabel(count)}</T>
          {folder?.pinnedAt ? <View style={{ transform: [{ rotate: "-14deg" }] }}><Icon name="tack" size={14} color={c.pastel.rose.ink} /></View> : null}
        </Pressable>
        <View style={[styles.rule, { borderBottomColor: c.line2 }]} />
        {onMenu ? <View style={{ marginBottom: 1 }}><MenuBtn label="Folder actions" onPress={onMenu} /></View> : null}
      </View>
      {open ? (
        <View style={[styles.ledger, {
          backgroundColor: c.card, borderColor: c.ink, borderStyle: dash,
          boxShadow: unfiled ? undefined : `5px 5px 0 ${fc}`,
        }]}>{children}</View>
      ) : (
        <View style={[styles.lip, { borderColor: c.ink, borderStyle: dash, backgroundColor: c.card, boxShadow: unfiled ? undefined : `4px 4px 0 ${fc}` }]}>
          <View style={[styles.lipLine, { backgroundColor: c.paper3 }]} />
          <View style={[styles.lipLine, { backgroundColor: c.paper3, top: 6 }]} />
        </View>
      )}
    </View>
  );
}

export function NoneLine({ text }: { text: string }) {
  const { c } = useTheme();
  return <T v="meta" size={13.5} color={c.ink3} style={styles.none}>{text}</T>;
}

/* ── the ⋯ menu ──────────────────────────────────────────────────────────────── */

export function ActionSheet<A extends string>({ open, title, items, onPick, onClose }: {
  open: boolean; title: string; items: { id: A; label: string; danger?: boolean }[]; onPick: (a: A) => void; onClose: () => void;
}) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title={title} size="fit" tone="butter" icon="dots">
      <View style={{ gap: 2 }}>
        {items.map(i => (
          <Pressable key={i.id} onPress={() => { onClose(); onPick(i.id); }} accessibilityRole="button"
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: i.danger ? c.pastel.rose.soft : c.paper2 }]}>
            <T v="callout" size={15} color={i.danger ? c.pastel.rose.ink : c.ink}>{i.label}</T>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fav: { borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  kind: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  menuBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  card: { padding: 15, paddingBottom: 12, borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12 },
  tape: { position: "absolute", top: -9, alignSelf: "center", left: "50%", marginLeft: -29, width: 58, height: 17, opacity: 0.7, transform: [{ rotate: "-3deg" }], borderLeftWidth: 1, borderRightWidth: 1, borderStyle: "dashed" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, paddingRight: 30, borderBottomWidth: 1.5 },
  ruled: { borderBottomWidth: 1, alignSelf: "flex-start" },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 12 },
  cardMenu: { position: "absolute", top: 16, right: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 6, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12 },
  rowRule: { position: "absolute", left: 54, right: 10, top: 0, borderTopWidth: 1 },
  head: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  tab: { flexDirection: "row", alignItems: "center", gap: 9, flexShrink: 1, marginBottom: -1.5, zIndex: 1, paddingTop: 9, paddingBottom: 8, paddingLeft: 10, paddingRight: 12, borderWidth: 1.5, borderTopLeftRadius: 14, borderTopRightRadius: 18 },
  tabStripe: { position: "absolute", left: 14, right: 14, top: -1.5, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  rule: { flex: 1, minWidth: 12, borderBottomWidth: 1.5, borderStyle: "dashed", marginBottom: 10 },
  ledger: { borderWidth: 1.5, borderTopRightRadius: 22, borderBottomRightRadius: 22, borderBottomLeftRadius: 22, paddingVertical: 6 },
  lip: { height: 11, marginTop: -1.5, borderWidth: 1.5, borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: "hidden" },
  lipLine: { position: "absolute", left: 0, right: 0, top: 2, height: 1.5 },
  none: { paddingTop: 12, paddingBottom: 10, paddingLeft: 58, paddingRight: 18 },
  item: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
});
