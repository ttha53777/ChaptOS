import React from "react";
import type { Announcement } from "../AnnouncementCard";

/**
 * Quiet editorial replacement for the big AnnouncementCard. Same data + edit
 * flow (the existing AnnouncementEditor opens via onEdit); the feature gate and
 * admin hide button are composed by the page. `hideButton` is rendered inside so
 * `.dash-group` hover reveals it.
 */
export function PinnedAnnouncement({
  announcement,
  onEdit,
  hideButton,
}: {
  announcement: Announcement | null;
  onEdit: () => void;
  hideButton?: React.ReactNode;
}) {
  const body = announcement?.body.trim() ?? "";
  const hasCta = Boolean(announcement?.ctaLabel && announcement?.ctaUrl);

  return (
    <div className="pinned dash-group">
      {hideButton}
      <span className="pin-tag">PINNED</span>
      <p className="pin-body">
        {announcement ? (
          <>
            <strong className="pin-title">{announcement.title}</strong>
            {body && <span className="pin-text">{body}</span>}
          </>
        ) : (
          <span className="pin-text">Officers can post a chapter-wide announcement here.</span>
        )}
      </p>
      {hasCta && (
        <a className="pin-edit" href={announcement!.ctaUrl!} target="_blank" rel="noopener noreferrer">
          {announcement!.ctaLabel}
        </a>
      )}
      <button type="button" className="pin-edit" onClick={onEdit}>Edit</button>
    </div>
  );
}
