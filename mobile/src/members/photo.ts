/**
 * Changing my photo: pick (library) or take (camera) → the picker's square crop → shrink to
 * 512px JPEG → POST /api/auth/avatar. The print develops while it uploads
 * (~/moments/Develop). The remote URL is prefetched before the wash clears, so the swap
 * underneath never flashes blank. A failure fades the new print off the old photo and
 * says why; nothing in the cache moved, so there's nothing to restore.
 *
 * Remove: DELETE /api/auth/avatar answers with the fallback (the Google picture, or none).
 */
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image } from "react-native";
import { errorMessage } from "~/api/errors";
import { patchMe, refreshMe, removeAvatar, shrinkPhoto, uploadAvatar } from "~/data/members";
import type { DevelopState } from "~/moments/Develop";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";

export type Source = "library" | "camera";

export function useMyPhoto(meId: number) {
  const [state, setState] = useState<DevelopState>("idle");
  const [next, setNext] = useState<string | null>(null);

  const choose = async (source: Source) => {
    if (state === "developing") return;
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast.error("Camera is off for Chapt", { detail: "Turn it on in Settings, or pick a photo instead." });
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    let local: string;
    try { local = await shrinkPhoto(asset.uri); } catch (e) {
      haptics.error();
      toast.error("Couldn't use that photo", { detail: errorMessage(e) });
      return;
    }
    haptics.tap();
    setNext(local);
    setState("developing");
    try {
      const url = await uploadAvatar(local);
      if (url) await Image.prefetch(url).catch(() => false);
      patchMe(meId, { avatarUrl: url, hasCustomAvatar: true });
      setState("developed");
    } catch (e) {
      haptics.error();
      toast.error("Couldn't change your photo", { detail: errorMessage(e) });
      setState("failed");
    }
  };

  const onDone = () => {
    if (state === "developed") { haptics.success(); toast.show("New photo", { detail: "Every chapter you're in sees it." }); void refreshMe(); }
    setState("idle");
    setNext(null);
  };

  const remove = async () => {
    haptics.tap();
    try {
      const url = await removeAvatar();
      patchMe(meId, { avatarUrl: url, hasCustomAvatar: false });
      toast.show("Photo removed", { detail: url ? "Back to your Google picture." : undefined });
      void refreshMe();
    } catch (e) {
      haptics.error();
      toast.error("Couldn't remove your photo", { detail: errorMessage(e) });
    }
  };

  return { state, next, choose, remove, onDone };
}
