/**
 * Getting a receipt off the phone: the camera, a photo already taken, or a PDF (an
 * emailed receipt saved to Files). Photos are shrunk to a ≤1600px JPEG
 * (~/data/money prepareReceipt); anything over the server's 4 MB is refused here first,
 * with the same words the server would use.
 */
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { errorMessage } from "~/api/errors";
import { prepareReceipt, type ReceiptFile } from "~/data/money";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";

export type ReceiptSource = "camera" | "library" | "pdf";
export const RECEIPT_MAX = 4 * 1024 * 1024;

/** A chosen receipt, ready to upload, plus what to show on the taped print. */
export interface PickedReceipt extends ReceiptFile { preview: string | null }

export async function pickReceipt(source: ReceiptSource): Promise<PickedReceipt | null> {
  try {
    if (source === "pdf") {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      const a = res.canceled ? null : res.assets[0];
      if (!a) return null;
      if ((a.size ?? 0) > RECEIPT_MAX) { refuse("Receipt must be under 4 MB"); return null; }
      return { ...(await prepareReceipt({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/pdf" })), preview: null };
    }
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast.error("Camera is off for Chapt", { detail: "Turn it on in Settings, or choose a photo instead." });
        return null;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.canceled ? null : res.assets[0];
    if (!a) return null;
    const file = await prepareReceipt({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType ?? null });
    return { ...file, preview: file.uri };
  } catch (e) {
    refuse(errorMessage(e, "Couldn't read that file."));
    return null;
  }
}

function refuse(detail: string) {
  haptics.error();
  toast.error("Couldn't use that receipt", { detail });
}
