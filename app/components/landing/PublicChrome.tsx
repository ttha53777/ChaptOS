// The top bar on every public page (/blog, /pricing, /help, /contact,
// /trust): the same <SiteNav> the landing page renders, pointed back into it.
// The bar is fixed, so these pages, which were laid out under a bar that took
// room in the flow, get a spacer of its height.
import { SiteNav, type SiteNavHere } from "./SiteNav";

/** Which nav link renders as "you are here". /help has no link of its own. */
export type PublicNavHere = "help" | "pricing" | "blog" | null;

export function PublicNav({ here = null }: { here?: PublicNavHere }) {
  const navHere: SiteNavHere = here === "pricing" || here === "blog" ? here : null;
  return (
    <>
      <SiteNav here={navHere} />
      <div className="sn-spacer" aria-hidden="true" />
    </>
  );
}
