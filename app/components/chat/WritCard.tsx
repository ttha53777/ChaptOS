"use client";

// The writ card — propose-then-commit, the human-in-the-loop moment. The
// permission model: the permission to do an action gates BOTH proposing and
// approving it. A holder self-approves (Approve / Discard); a non-holder's
// draft is BLOCKED, not routed — the gate names the required permission and
// who holds it, with only a Dismiss. Settling stamps the card (time · actor),
// the audit motif the Approvals record reuses.

import { IcLock, IcTick } from "./icons";
import type { ProposalCard } from "./types";

function GateNote({ card }: { card: ProposalCard }) {
  const { label, holders } = card.perm;
  const role = holders?.roleTitles?.[0];
  const member = holders?.memberName;
  return (
    <div className="gate">
      <span className="lk"><IcLock /></span>
      <span className="gt">
        This needs the <b>{label}</b> permission{role ? <> — held by the <b>{role}</b></> : null}, which you don&apos;t have, so it can&apos;t post.
        {member ? <> Ask <b>{member}</b> to record it.</> : null}
      </span>
    </div>
  );
}

function SettledBar({ card }: { card: ProposalCard }) {
  const approved = card.state === "approved";
  return (
    <div className={`settled${approved ? "" : " declined"}`}>
      <span className="tk">{approved ? <IcTick /> : <>—</>}</span>
      <span className="txt">{card.resultMessage}</span>
      {card.stamp && <span className="stamp">{card.stamp}</span>}
    </div>
  );
}

export function WritCard({ card, onApprove, onDiscard }: {
  card: ProposalCard;
  onApprove: (card: ProposalCard) => void;
  onDiscard: (card: ProposalCard) => void;
}) {
  const blocked = !card.perm.canApprove;
  const settled = card.state === "approved" || card.state === "discarded" || card.state === "dismissed" || card.state === "error";
  return (
    <div className="writ" data-writ={card.state === "pending" ? "" : undefined}>
      <div className="wh">
        <span className="chip-tag">Proposal</span>
        <span className="what">{card.display.title}</span>
      </div>
      <div className="wb">
        {card.display.rows.map(r => (
          <div key={r.k} className="wrow">
            <span className="wk">{r.k}</span>
            <span className={`wv${r.em ? " em" : ""}`}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* The gate spells out the permission itself; caption it otherwise. */}
      {!blocked && !settled && (
        <div className="permline"><span className="lk"><IcLock size={11} /></span>Requires <b>{card.perm.label}</b></div>
      )}
      {blocked && !settled && <GateNote card={card} />}

      {card.state === "pending" && (
        <div className="wfoot">
          <button type="button" className="wbtn primary" disabled={blocked} data-w="ratify" onClick={() => onApprove(card)}>
            Approve
          </button>
          <button type="button" className="wbtn quiet" data-w="decline" onClick={() => onDiscard(card)}>
            {blocked ? "Dismiss" : "Discard"}
          </button>
        </div>
      )}
      {card.state === "confirming" && (
        <div className="wfoot"><span className="wbusy"><span className="arc sm" />Approving…</span></div>
      )}
      {settled && <SettledBar card={card} />}
    </div>
  );
}
