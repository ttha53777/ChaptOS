/**
 * Every hand-drawn glyph the landing page uses, as one <symbol> sprite.
 * Rendered once at the top of the .lp tree; <Doodle id="check" /> references
 * them with <use href="#d-check" />.
 */
export function DoodleSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="d-check" viewBox="0 0 24 24">
          <path d="M4.5 13.2 9.4 18 19.5 6.4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-spark" viewBox="0 0 24 24">
          <path d="M12 2.6c.7 5.1 3.6 8 8.7 8.8-5.1.7-8 3.6-8.7 8.7-.7-5.1-3.6-8-8.7-8.7 5.1-.8 8-3.7 8.7-8.8Z" fill="currentColor" />
        </symbol>
        <symbol id="d-arrow-r" viewBox="0 0 24 24">
          <path d="M4 12h15m0 0-6-6m6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-shield" viewBox="0 0 24 24">
          <path d="M12 2.8 4.6 5.7c-.3 6.6 1.6 12 7.4 15.5 5.8-3.5 7.7-8.9 7.4-15.5L12 2.8Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <path d="M8.6 12.1 11 14.6l4.6-4.9" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-receipt" viewBox="0 0 24 24">
          <path d="M6 2.9h12v18.4l-2.4-1.7-2.4 1.7-2.4-1.7-2.4 1.7L6 19.6V2.9Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <path d="M9.4 8h5.2M9.4 12.2h5.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-export" viewBox="0 0 24 24">
          <path d="M12 15.4V3.6m0 0L8.2 7.4M12 3.6l3.8 3.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.4 14v5.2c0 .8.6 1.4 1.4 1.4h12.4c.8 0 1.4-.6 1.4-1.4V14" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-cal" viewBox="0 0 24 24">
          <rect x="3.3" y="5.2" width="17.4" height="15.4" rx="2.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M3.6 10h16.8M8.2 3.2v3.6M15.8 3.2v3.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-wallet" viewBox="0 0 24 24">
          <path d="M3.4 7.6c0-1.3 1-2.3 2.3-2.3h12.6c1.3 0 2.3 1 2.3 2.3v9.2c0 1.3-1 2.3-2.3 2.3H5.7a2.3 2.3 0 0 1-2.3-2.3V7.6Z" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M15.6 12.2h4.9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </symbol>
        <symbol id="d-hand" viewBox="0 0 24 24">
          <path d="M8.6 11V5.4a1.5 1.5 0 0 1 3 0V10m0-1.1a1.5 1.5 0 0 1 3 0v1.4m0-.7a1.5 1.5 0 0 1 3 0v4.6c0 3.4-2.4 6.1-5.8 6.1-3 0-4.6-1.5-6.2-4.2l-1.7-3a1.4 1.4 0 0 1 2.2-1.7l1.5 1.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-people" viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M2.8 20.4c.4-3.6 3-5.8 6.2-5.8s5.8 2.2 6.2 5.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M16.2 5.2a3.2 3.2 0 0 1 0 6M17.6 14.9c2.2.5 3.6 2.5 3.8 5.1" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-chat" viewBox="0 0 24 24">
          <path d="M20.6 11.6c0 4.2-3.9 7.6-8.6 7.6-1 0-2-.2-2.9-.5l-5 1.6 1.6-4a7 7 0 0 1-2.3-4.7C3.4 7.4 7.3 4 12 4s8.6 3.4 8.6 7.6Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-swirl" viewBox="0 0 120 46">
          <path d="M2 34c14-16 34-28 52-28 12 0 18 7 15 14-3 6-13 7-16 1-4-7 4-16 17-18 12-2 26 3 34 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="m97 8 8 7-9 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-star" viewBox="0 0 24 24">
          <path d="M12 3.4c.9 4.2 2.6 6 6.6 6.9-4 .9-5.7 2.7-6.6 6.9-.9-4.2-2.6-6-6.6-6.9 4-.9 5.7-2.7 6.6-6.9Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-mug" viewBox="0 0 24 24">
          <path d="M4.2 7.4h12.2v7.4a5 5 0 0 1-5 5h-2.2a5 5 0 0 1-5-5V7.4Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <path d="M16.6 9.4h1.8a2.6 2.6 0 0 1 0 5.2h-1.8" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M8 4.4c.7-.9.7-1.5 0-2.2M11.8 4.4c.7-.9.7-1.5 0-2.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </symbol>
        <symbol id="d-plant" viewBox="0 0 24 24">
          <path d="M12 21v-8.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M12 13.4C9 13.4 6.6 11 6.6 8c3 0 5.4 2.4 5.4 5.4ZM12 12.2c0-3 2.4-5.4 5.4-5.4 0 3-2.4 5.4-5.4 5.4Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <path d="M8.4 21h7.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-clip" viewBox="0 0 24 24">
          <rect x="4.4" y="4.2" width="15.2" height="16.6" rx="2.4" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M9 4.2c0-1.2 1.3-2 3-2s3 .8 3 2" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M8.4 11.4h7.2M8.4 15.4h4.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-loop" viewBox="0 0 24 24">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M20.4 3.2v4.4h-4.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-pencil" viewBox="0 0 24 24">
          <path d="M4 20.2 4.9 16 16.4 4.5a2.1 2.1 0 0 1 3 3L7.9 19.1 4 20.2Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <path d="M14.6 6.4 17.8 9.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-folder" viewBox="0 0 24 24">
          <path d="M3.2 6.6c0-1 .8-1.8 1.8-1.8h4l2.2 2.6h8.8c1 0 1.8.8 1.8 1.8v8.6c0 1-.8 1.8-1.8 1.8H5c-1 0-1.8-.8-1.8-1.8V6.6Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-board" viewBox="0 0 24 24">
          <path d="M4.6 3.4v17.2M12 3.4v10.4M19.4 3.4v14.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </symbol>
        <symbol id="d-key" viewBox="0 0 24 24">
          <circle cx="8" cy="8.4" r="4.4" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="m11.2 11.6 8.4 8.4M16.4 16.8l2-2M13.6 14l2-2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-clock" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.8" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M12 6.8V12l3.6 2.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-heart" viewBox="0 0 24 24">
          <path d="M12 20.4C6.4 16.8 3 13.6 3 9.8A4.6 4.6 0 0 1 7.6 5.2c1.8 0 3.4 1 4.4 2.6 1-1.6 2.6-2.6 4.4-2.6A4.6 4.6 0 0 1 21 9.8c0 3.8-3.4 7-9 10.6Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-link" viewBox="0 0 24 24">
          <path d="M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-phone" viewBox="0 0 24 24">
          <rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M10.6 18.4h2.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-bars" viewBox="0 0 24 24">
          <path d="M5.4 20.4V12M12 20.4V4.4M18.6 20.4v-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </symbol>
        <symbol id="d-camera" viewBox="0 0 24 24">
          <rect x="3.4" y="6.4" width="17.2" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <circle cx="12" cy="13.4" r="3.4" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M8.6 6.4 10 3.6h4l1.4 2.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        </symbol>
        <symbol id="d-note" viewBox="0 0 24 24">
          <path d="M9.4 18V5.2l9.4-2v12.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <circle cx="7" cy="18.4" r="2.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <circle cx="16.4" cy="15.8" r="2.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
        </symbol>
        <symbol id="d-flag" viewBox="0 0 24 24">
          <path d="M5.4 21V3.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M5.4 4.6h11.8l-2.2 3.8 2.2 3.8H5.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        </symbol>
      </defs>
    </svg>
  );
}

/** The wordmark, used by the nav and the footer. */
export function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2.5" y="4.5" width="35" height="31" rx="9" fill="#FFE5A0" stroke="#26211B" strokeWidth="2.4" />
      <path d="M12 21.5c2.2 3.4 5 5 8.4 5 3.2 0 5.9-1.5 8-4.6" fill="none" stroke="#26211B" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="14.6" cy="16" r="1.9" fill="#26211B" />
      <circle cx="25.4" cy="16" r="1.9" fill="#26211B" />
    </svg>
  );
}
