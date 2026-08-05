/**
 * scrollIntoView that honours `prefers-reduced-motion`.
 *
 * Smooth scrolling is exactly the kind of vestibular trigger the media query
 * exists for, and a long Settings group page can smooth-scroll several
 * viewports at once. Our stylesheets already gate transitions and animations on
 * the query; scripted scrolling has to be gated in JS because `scroll-behavior`
 * in CSS doesn't apply to an explicit `behavior: "smooth"` argument.
 */
export function scrollIntoViewSafe(
  el: Element | null | undefined,
  options: ScrollIntoViewOptions = { behavior: "smooth", block: "start" },
) {
  if (!el) return;
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView(reduced ? { ...options, behavior: "auto" } : options);
}
