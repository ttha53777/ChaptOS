import "./first-load-splash.css";
import { FirstLoadSplashDriver } from "./FirstLoadSplashDriver";

/**
 * The first load splash, as server-rendered markup, so it's in the first HTML
 * response and paints (and starts drawing, in pure CSS) before any JavaScript
 * arrives. Built 1:1 from _design/First Load Splash Mock.html.
 *
 * It's an overlay and nothing more: the app mounts and fetches underneath from
 * the first frame. FirstLoadSplashDriver (client) emits the boot script that
 * decides whether this is a hard load, then drives beats 2 and 3 off
 * ChapterContext and unmounts it. See lib/first-load-splash.ts.
 *
 * The text and image slots are left empty here and filled by the driver, so a
 * server re-render (router.refresh) has nothing to reconcile against.
 */
export function FirstLoadSplash() {
  return (
    <FirstLoadSplashDriver>
      <div className="fls" id="fls">
        <div className="fls-splash" role="status" aria-live="polite">
          <div className="fls-dots" />
          <div className="fls-shapes" aria-hidden="true">
            <i className="fls-sh-peach fls-ring" data-d="14"><b /></i>
            <i className="fls-sh-sky fls-ring" data-d="26"><b /></i>
            <i className="fls-sh-mint fls-ring" data-d="10"><b /></i>
            <i className="fls-sh-lilac fls-ring" data-d="20"><b /></i>
            <i className="fls-sh-rose" data-d="34"><b /></i>
            <i className="fls-sh-butter" data-d="40"><b /></i>
            <i className="fls-sh-o" data-d="30"><b /></i>
          </div>
          <div className="fls-grain" />
          <div className="fls-stage">
            <div className="fls-lockup">
              <svg className="fls-mark" viewBox="0 0 40 40" aria-label="ChaptOS">
                <defs>
                  <clipPath id="fls-body"><rect className="fls-tile" x="2.5" y="4.5" width="35" height="31" rx="9" /></clipPath>
                </defs>
                <g className="fls-tilt">
                  <g className="fls-squash">
                    <rect className="fls-tile fls-tile-shadow" x="2.5" y="4.5" width="35" height="31" rx="9" />
                    <g clipPath="url(#fls-body)">
                      <rect x="0" y="0" width="40" height="40" fill="var(--fls-paper)" />
                      <g className="fls-fill">
                        <path className="fls-wave" fill="var(--fls-butter)"
                          d="M-40 4 q5 -2.4 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 V44 H-40 Z" />
                      </g>
                      <image className="fls-org-img" x="2" y="2" width="36" height="36" preserveAspectRatio="xMidYMid slice" opacity="0" />
                    </g>
                    <rect className="fls-tile fls-outline" x="2.5" y="4.5" width="35" height="31" rx="9" fill="none"
                      stroke="var(--fls-note-ink)" strokeWidth="2.4" pathLength="1" />
                    <g className="fls-face">
                      <g className="fls-eyes">
                        <circle className="fls-eye-l" cx="14.6" cy="16" r="1.9" fill="var(--fls-note-ink)" />
                        <circle className="fls-eye-r" cx="25.4" cy="16" r="1.9" fill="var(--fls-note-ink)" />
                      </g>
                      <path className="fls-smile" d="M12 21.5c2.2 3.4 5 5 8.4 5 3.2 0 5.9-1.5 8-4.6" fill="none"
                        stroke="var(--fls-note-ink)" strokeWidth="2.4" strokeLinecap="round" pathLength="1" />
                    </g>
                    <text className="fls-org-init" x="20" y="20.6" textAnchor="middle" dominantBaseline="central"
                      fontSize="14.4" fill="var(--fls-note-ink)" opacity="0" />
                  </g>
                </g>
              </svg>
              <div className="fls-words">
                <div className="fls-word" aria-hidden="true">
                  <span>C</span><span>h</span><span>a</span><span>p</span><span>t</span><span className="fls-os">OS</span>
                </div>
                <div className="fls-org"><span className="fls-org-name" /><span className="fls-org-term" /></div>
              </div>
            </div>
            <div className="fls-status">
              <span className="fls-ticks"><i /><i /><i /></span>
              <span className="fls-msg">Signing you in</span>
            </div>
          </div>
        </div>
      </div>
    </FirstLoadSplashDriver>
  );
}
