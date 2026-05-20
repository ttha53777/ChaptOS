import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

function withTimeout(ms: number): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

export async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
      global: { fetch: withTimeout(5_000) },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const brother = await prisma.brother.findUnique({
    where: { authUserId: user.id },
    select: { id: true, role: true, isAdmin: true },
  });
  if (!brother) return null;

  return {
    id: brother.id,
    role: brother.role,
    isAdmin: brother.isAdmin,
    authUserId: user.id,
    email: user.email ?? null,
  };
}
