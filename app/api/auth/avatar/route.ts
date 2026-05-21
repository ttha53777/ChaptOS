import { syncBrotherAvatar } from "@/lib/brother-avatar";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    console.error("POST /api/auth/avatar upload failed:", uploadError);
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
    console.error("POST /api/auth/avatar updateUser failed:", updateError);
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
      console.error("DELETE /api/auth/avatar remove failed:", removeError);
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
    console.error("DELETE /api/auth/avatar updateUser failed:", updateError);
    return Response.json({ error: "Failed to remove profile photo" }, { status: 500 });
  }

  await syncBrotherAvatar(user.id, fallback);

  return Response.json({ avatarUrl: fallback });
}
