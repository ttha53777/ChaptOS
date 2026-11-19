/**
 * The pinned note's editor (MANAGE_ANNOUNCEMENTS, stage 6), the web's AnnouncementEditor
 * (app/components/dashboard/AnnouncementEditor.tsx) on the phone: a title (120), the body
 * (2000) and an optional link (label 40 + an http(s) address, both or neither). Saving is
 * PUT /api/announcement, which replaces the one note; the web has no "clear", so neither
 * does this. Opened from the note's Edit on Today, "Write one" when there's none, and
 * Create → Pinned note.
 *
 * `noteOn` / `canPin` are the web's gates: the "announcement" section of the operations
 * workflow isn't switched off (OrganizationConfig.disabledFeatures), and MANAGE_ANNOUNCEMENTS.
 */
import type { Announcement, MeResponse } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { errorMessage } from "~/api/errors";
import { saveAnnouncement } from "~/data/home";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { T } from "~/ui/T";

/** lib/permissions.ts MANAGE_ANNOUNCEMENTS. */
const MANAGE_ANNOUNCEMENTS = 1 << 10;

export const noteOn = (me: MeResponse) => !(me.org?.disabledFeatures?.operations ?? []).includes("announcement");
export const canPin = (me: MeResponse) => noteOn(me) && (me.isAdmin || (me.permissions & MANAGE_ANNOUNCEMENTS) !== 0);

const URL_RE = /^https?:\/\/\S+\.\S+/i;

export function NoteEditor({ open, current, onClose, onSaved }: { open: boolean; current: Announcement | null | undefined; onClose: () => void; onSaved?: () => void }) {
  const { c } = useTheme();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(current?.title ?? ""); setBody(current?.body ?? ""); setLabel(current?.ctaLabel ?? ""); setUrl(current?.ctaUrl ?? "");
    setBusy(false); setErr(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasLabel = label.trim().length > 0, hasUrl = url.trim().length > 0;
  const urlBad = hasUrl && !URL_RE.test(url.trim());

  const save = async () => {
    if (busy) return;
    let problem: string | null = null;
    if (!title.trim()) problem = "Give the note a title.";
    else if (hasLabel !== hasUrl) problem = "A link needs both its label and its address, or leave both blank.";
    else if (urlBad) problem = "The address has to start with https://";
    if (problem) { haptics.error(); setErr(problem); return; }
    setBusy(true); setErr(null);
    try {
      await saveAnnouncement({ title: title.trim(), body: body.trim(), ctaLabel: hasLabel ? label.trim() : null, ctaUrl: hasUrl ? url.trim() : null });
      haptics.success();
      onClose();
      onSaved?.();
      toast.show(current ? "Note updated" : "Note pinned", { detail: "Everyone sees it on Today." });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="butter" icon="pin"
      kicker="One message for everyone" title={current ? "Edit the pinned note" : "Pin a note"}
      footer={
        <View style={{ gap: 8 }}>
          {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
          <Button label={busy ? "Saving…" : current ? "Save note" : "Pin it"} icon="pin" tone="butter" block onPress={() => void save()} disabled={busy || !title.trim()} />
        </View>
      }>
      <View style={{ gap: 18 }}>
        <Field label="Title" value={title} onChangeText={t => { setTitle(t); setErr(null); }} placeholder="Rush kickoff Saturday" maxLength={120} autoFocus={!current} />
        <Field label="Message" value={body} onChangeText={setBody} placeholder="Doors open at 8pm. Wear letters." maxLength={2000} multiline
          style={{ minHeight: 110, textAlignVertical: "top" }} />
        <View style={{ gap: 10 }}>
          <T v="label" color={c.ink2}>Link (optional)</T>
          <Field label="Button label" value={label} onChangeText={t => { setLabel(t); setErr(null); }} placeholder="RSVP" maxLength={40} />
          <Field label="Address" value={url} onChangeText={t => { setUrl(t); setErr(null); }} placeholder="https://" maxLength={500}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" error={urlBad ? "Starts with https://" : null} />
        </View>
        <T v="meta" color={c.ink3}>It replaces whatever is pinned now, signed with your name.</T>
      </View>
    </Sheet>
  );
}
