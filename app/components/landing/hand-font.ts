// The landing page's handwriting face (the mock's --hand): sticky notes, the
// "in a normal month, we…" prompt, the margin notes. Its own module rather than
// fonts.ts, which app/layout.tsx imports, so only "/" downloads it.
import { Caveat } from "next/font/google";

export const hand = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
  variable: "--font-caveat",
});
