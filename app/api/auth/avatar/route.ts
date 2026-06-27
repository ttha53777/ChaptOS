import { syncBrotherAvatar } from "@/lib/brother-avatar";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

const MAX_BYTES = 2 * 1024 * 1024;
const BUCKET = "avatars";

function extForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Throttle uploads per user — guards the Supabase storage bucket against
  // runaway/abusive loops. CSRF is covered centrally by the proxy (/api/*).
  const limit = rateLimit(`avatar:${user.id}`, 10, 60_000); // 10 uploads/min/user
  if (!limit.ok) return tooManyRequests(limit);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No image file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Image must be under 2 MB" }, { status: 400 });
  }

  const ext = extForType(file.type);
  const path = `${user.id}/avatar.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    logError(uploadError, { route: "/api/auth/avatar upload", method: "POST", userId: user?.id });
    return Response.json(
      { error: "Failed to upload image. Ensure the avatars storage bucket exists." },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: avatarUrl, custom_avatar: true },
  });

  if (updateError) {
    logError(updateError, { route: "/api/auth/avatar updateUser", method: "POST", userId: user?.id });
    return Response.json({ error: "Failed to save profile photo" }, { status: 500 });
  }

  await syncBrotherAvatar(user.id, avatarUrl);

  return Response.json({ avatarUrl });
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: files } = await supabase.storage.from(BUCKET).list(user.id);
  if (files?.length) {
    const paths = files.map(f => `${user.id}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) {
      logError(removeError, { route: "/api/auth/avatar remove", method: "DELETE", userId: user?.id });
    }
  }

  const meta = user.user_metadata ?? {};
  const fallback =
    (typeof meta.picture === "string" ? meta.picture : null) ??
    (typeof meta.avatar_url === "string" && !meta.custom_avatar ? meta.avatar_url : null);

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      avatar_url: fallback,
      custom_avatar: false,
    },
  });

  if (updateError) {
    logError(updateError, { route: "/api/auth/avatar updateUser", method: "DELETE", userId: user?.id });
    return Response.json({ error: "Failed to remove profile photo" }, { status: 500 });
  }

  await syncBrotherAvatar(user.id, fallback);

  return Response.json({ avatarUrl: fallback });
}
