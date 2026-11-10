"use client";

// Receipt (_design/Ask Chapt List Forms Mock.html §09) — payments, and what they
// add up to. The figure asked for leads, each entry is a line with its amount in
// one column, and the lines visibly sum at the bottom. In and out are told apart
// by sign and colour. A cut set shows its lines and no sum.

import { fmtUsd } from "@/lib/money";
import type { AnswerRow, ReceiptShape } from "../types";
import { fmtDay, iv, RowButton, type RowHandlers } from "./common";

function money(cents: number, signed = false) {
  const s = fmtUsd(Math.abs(cents) / 100);
  return cents < 0 ? `− ${s}` : signed ? `+ ${s}` : s;
}

/** "$1,228.40" with the cents set small, as the mock's figure. */
function Figure({ cents }: { cents: number }) {
  const whole = fmtUsd(Math.floor(Math.abs(cents) / 100));
  const frac = Math.abs(cents) % 100;
  return <div className="rcp-n">{cents < 0 ? "− " : ""}{whole}{frac ? <small>.{String(frac).padStart(2, "0")}</small> : null}</div>;
}

export function ReceiptSheet({ shape, rows, h }: { shape: ReceiptShape; rows: AnswerRow[]; h: RowHandlers }) {
  const t = shape.totals;
  const nOut = shape.items.filter(i => i.cents < 0).length;
  const nIn = shape.items.length - nOut;
  const lead = !t ? null : shape.headline === "out" ? t.out : shape.headline === "in" ? t.in : t.net;
  const leadWord = shape.headline === "out" ? "paid out" : shape.headline === "in" ? "came in" : "net";
  // When the lead is one side and the other side exists, the net rides beside it.
  const delta = t && shape.headline !== "net" && nIn > 0 && nOut > 0 ? t.net : null;

  return (
    <div className="shp shp-rcp in in-3">
      <div className="rcp-top">
        <div>
          <span className="shp-kicker">{shape.kicker}{t ? ` · ${leadWord}` : ""}</span>
          {lead != null
            ? <Figure cents={lead} />
            : <div className="rcp-cut">Latest {shape.items.length} of {shape.truncated?.of ?? shape.items.length} lines</div>}
        </div>
        {delta != null && <span className={`rcp-d${delta < 0 ? " neg" : ""}`}>{money(delta, true)} net</span>}
      </div>
      <div className="rcp-tear" />
      <div className="rcp-rows">
        {shape.items.map((it, i) => {
          const r = rows[i];
          const day = fmtDay(it.date);
          const sub = r?.subtitle?.startsWith(`${day} · `) ? r.subtitle.slice(day.length + 3).replace(/ · pending$/, "") : r?.subtitle;
          return (
            <RowButton key={i} row={r} i={i} h={h} className={`rcp-r${it.cents > 0 ? " in" : ""}`} style={iv(i)} label={`${r?.title ?? ""}, ${money(it.cents, true)}`}>
              <span className="dt">{day}</span>
              <span className="rb">
                <span className="t">{r?.title}{it.pending && <span className="pend">pending</span>}</span>
                {sub && <span className="s">{sub}</span>}
              </span>
              <span className="a">{money(it.cents, true)}</span>
            </RowButton>
          );
        })}
      </div>
      {t && (
        <>
          <div className="rcp-tear" />
          <div className="rcp-sum">
            {nOut > 0 && <div><span>Paid out · {nOut}</span><span className="mono">{money(-t.out)}</span></div>}
            {nIn > 0 && <div className="in"><span>Came in · {nIn}</span><span className="mono">{money(t.in, true)}</span></div>}
            {nOut > 0 && nIn > 0 && <div className="net"><span>Net</span><span className="mono">{money(t.net, true)}</span></div>}
          </div>
        </>
      )}
    </div>
  );
}
