"use client";

import { useChapter, type CurrentUser as ChapterCurrentUser } from "../context/ChapterContext";

export type CurrentUser = Pick<
  ChapterCurrentUser,
  "name" | "role" | "email" | "avatarUrl" | "hasCustomAvatar" | "isAdmin"
>;

export function useCurrentUser(): {
  user: CurrentUser | null;
  loading: boolean;
  avatarRevision: number;
  refetch: () => Promise<void>;
  setAvatarUrl: (avatarUrl: string | null, hasCustomAvatar?: boolean) => void;
} {
  const { currentUser, isLoading, hasLoaded, avatarRevision, setAvatarUrl, refreshChapterData } = useChapter();

  const user = currentUser
    ? {
        name: currentUser.name,
        role: currentUser.role,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
        hasCustomAvatar: currentUser.hasCustomAvatar,
        isAdmin: currentUser.isAdmin,
      }
    : null;

  return {
    user,
    loading: isLoading && !hasLoaded,
    avatarRevision,
    refetch: refreshChapterData,
    setAvatarUrl,
  };
}
