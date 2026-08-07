import React from "react";
import { useVocab } from "../../../hooks/useVocab";
import type { Announcement } from "../AnnouncementCard";

/**
 * Quiet editorial replacement for the big AnnouncementCard. Same data + edit
 * flow (the existing AnnouncementEditor opens via onEdit); the feature gate and
 * admin hide button are composed by the page. `hideButton` is rendered inside so
 * `.dash-group` hover reveals it.
 *
 * Two things the placeholder must not do. It must not wear the gold PINNED chip
 * and the card fill of a real announcement — that made an empty slot read as a
 * notice nobody posted. And it must not exist at all for a viewer who can't
 * write one: with no announcement AND no permission there is nothing to read and
 * nothing to do, so the bar is dead furniture. (`canEdit` also gates the Edit
 * button on a real announcement, which was rendered unconditionally before and
 * 403'd on save for any ordinary member who pressed it.)
 */
export function PinnedAnnouncement({
  announcement,
  onEdit,
  canEdit = true,
  hideButton,
}: {
  announcement: Announcement | null;
  onEdit: () => void;
  canEdit?: boolean;
  hideButton?: React.ReactNode;
}) {
  const v = useVocab();
  const body = announcement?.body.trim() ?? "";
  const hasCta = Boolean(announcement?.ctaLabel && announcement?.ctaUrl);

  if (!announcement && !canEdit) return null;

  return (
    <div className={announcement ? "pinned dash-group" : "pinned pin-empty dash-group"}>
      {hideButton}
      <span className={announcement ? "pin-tag" : "pin-tag quiet"}>
        {announcement ? "PINNED" : v("Announcement").toUpperCase()}
      </span>
      <p className="pin-body">
        {announcement ? (
          <>
            <strong className="pin-title">{announcement.title}</strong>
            {body && <span className="pin-text">{body}</span>}
          </>
        ) : (
          <span className="pin-text">
            Post something for the chapter — it&apos;s the first thing everyone sees.
          </span>
        )}
      </p>
      {hasCta && (
        <a className="pin-edit" href={announcement!.ctaUrl!} target="_blank" rel="noopener noreferrer">
          {announcement!.ctaLabel}
        </a>
      )}
      {canEdit && (
        <button type="button" className="pin-edit" onClick={onEdit}>
          {announcement ? "Edit" : "Write one"}
        </button>
      )}
    </div>
  );
}
