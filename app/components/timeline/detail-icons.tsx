import React from "react";
import type { DetailType } from "@/lib/event-details";

// One line-icon set for "More details" — the editor's drawer and page, and the
// timeline rail. Same drawings as _design/Event Details Paper Mock.html.
const ic = (children: React.ReactNode, w = 2) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

export const DETAIL_ICON: Record<DetailType, React.ReactNode> = {
  checklist:  ic(<path d="M4 7l2 2 3-3M4 15l2 2 3-3M13 8h7M13 16h7" />),
  budget:     ic(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
  supplies:   ic(<><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /></>),
  contact:    ic(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4M15 10h3M15 13h3" /></>),
  guests:     ic(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.7 2.2 3 4.4" /></>),
  capacity:   ic(<><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z" /><path d="M14 7v2M14 11v2M14 15v2" /></>),
  dress:      ic(<path d="M8 4 3 7l2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 0 1-8 0z" />),
  directions: ic(<path d="M12 3v18M5 5h11l3 2.5-3 2.5H5zM19 12H8l-3 2.5L8 17h11z" />),
  links:      ic(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  custom:     ic(<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" /></>),
};

export const UI_ICON = {
  plus:   ic(<path d="M12 5v14M5 12h14" />, 2.2),
  x:      ic(<path d="M6 6l12 12M18 6 6 18" />, 2.2),
  up:     ic(<path d="M12 19V5M6 11l6-6 6 6" />),
  down:   ic(<path d="M12 5v14M6 13l6 6 6-6" />),
  trash:  ic(<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />, 1.9),
  chev:   ic(<path d="M6 9l6 6 6-6" />),
  arrow:  ic(<path d="M9 6l6 6-6 6" />),
  back:   ic(<path d="M15 6l-6 6 6 6" />),
  phone:  ic(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />, 1.8),
  msg:    ic(<path d="M4 5h16v11H9l-5 4z" />),
  ext:    ic(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />),
  lock:   ic(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>, 2.2),
  clock:  ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 1.8),
  pin:    ic(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>, 1.8),
  hand:   ic(<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.2-5.3-3.3L4 13.5a1.5 1.5 0 0 1 2.6-1.5L8 14" />, 1.9),
  tick:   ic(<path d="M5 12.5l4.5 4.5L20 5" />, 3.2),
  pages:  ic(<><rect x="7" y="3" width="13" height="15" rx="2" /><path d="M4 7v12a2 2 0 0 0 2 2h10" /><path d="M13.5 8v5M11 10.5h5" /></>, 1.8),
  cal:    ic(<><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>, 1.8),
  grip: (
    <svg viewBox="0 0 12 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
    </svg>
  ),
  doors: {
    members: ic(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" /></>, 1.8),
    plus:    ic(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M18 8v6M15 11h6" /></>, 1.8),
    invite:  ic(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="m3 8 9 6 9-6" /></>, 1.8),
    public:  ic(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>, 1.8),
  },
};
