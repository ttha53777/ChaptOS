/**
 * A poll as a sealed ballot (mock `.tq-blt`), respecting the blind ballot:
 *
 *   sealed      an open poll I haven't voted on arrives as an envelope: the question, a
 *               wax seal, and "N sealed". Tapping opens it: the flap folds back (rotateX
 *               about its top edge, 360ms) and the seal lifts, then the options slide out
 *               (a layout entering). No counts anywhere: voteCount is null until I vote.
 *   voting      tap an option: the X is drawn as a pen stroke (light haptic), the vote is
 *               sent (optimistic, ~/tasks/vote), and when the server's answer reveals the
 *               counts the bars grow (success haptic when they land).
 *   voted       my X in place, bars and percentages. Tapping another option changes my
 *               vote (the server upserts; the web allows it too): the X moves.
 *   closed      read-only; bars, the winner in bold, "Decided · X won."
 *   refused     the X un-draws (and returns to my old pick on a change); a toast says why.
 *
 * Counts show only when the server sends them (`sealed` false) and I've voted or it's
 * closed, so an officer peeking server-side still sees a sealed ballot here, as on the
 * web's list card. Reduced motion: the flap and seal cross-fade, options fade in, the X
 * fades in whole, bars cross-fade.
 */
import type { Poll } from "@/lib/api-types";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Icon } from "~/icons/Icon";
import { PEN_MS, PenX, VoteBar } from "~/moments/Vote";
import { DUR, EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { soft } from "~/theme/shadow";
import { T } from "~/ui/T";
import { closesText, leaderOf, revealed } from "./model";
import { castVote, onVoteRefused } from "./vote";

export function Ballot({ poll, today, canVote }: { poll: Poll; today: string; canVote: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const closed = poll.status === "closed";
  const mine = poll.myVoteOptionId;
  const live = !closed && canVote;
  const [opened, setOpened] = useState(closed || mine != null || !canVote);
  // Set when I cast a vote here; the bars landing then earns the success haptic.
  const justVoted = useRef(false);

  useEffect(() => onVoteRefused(id => { if (id === poll.id) justVoted.current = false; }), [poll.id]);

  const show = (closed || mine != null) && revealed(poll);
  const total = poll.options.reduce((n, o) => n + (o.voteCount ?? 0), 0);
  const lead = show ? leaderOf(poll) : null;
  const winner = closed && lead != null ? poll.options.find(o => o.id === lead)?.label : null;

  const vote = (optionId: number) => {
    if (!live || optionId === mine) return;
    haptics.tap();
    justVoted.current = true;
    castVote(poll, optionId);
  };

  const onGrown = () => {
    if (!justVoted.current) return;
    justVoted.current = false;
    haptics.success();
  };

  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(320)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const optionsIn = m.reduced
    ? FadeIn.duration(m.t(DUR.fade)).reduceMotion(ReduceMotion.Never)
    : FadeInDown.duration(m.t(360)).delay(m.t(200)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);

  const foot = closed
    ? (winner ? `Decided · ${winner} won.` : "Closed with no votes.")
    : mine != null ? "Your vote is in. Tap another to change it."
    : canVote ? `${poll.totalVotes} sealed · counts open once you vote. Nobody sees who picked what.`
    : "Only the people on it vote.";

  return (
    <Animated.View layout={layout} style={[styles.card, { backgroundColor: c.card, borderColor: c.line2 }, soft(c.sh1)]}>
      <View style={[styles.stub, { backgroundColor: c.pastel.lilac.soft }]}>
        <T v="kicker" color={c.pastel.lilac.ink} style={{ fontSize: 10 }}>Ballot · {closesText(poll, today)}</T>
        <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{show ? `${poll.totalVotes} of ${poll.assigneeCount} voted` : `${poll.totalVotes} sealed`}</T>
      </View>
      <Perforation />
      <Pressable disabled={opened} onPress={() => setOpened(true)} accessibilityRole="button"
        accessibilityLabel={opened ? poll.question : `Sealed ballot: ${poll.question}. ${poll.totalVotes} sealed.`}
        accessibilityHint={opened ? undefined : "Opens the ballot"}>
        <T v="subhead" style={styles.q}>{poll.question}</T>
        <Envelope open={opened} />
      </Pressable>

      {opened ? (
        <Animated.View entering={optionsIn} style={styles.options}>
          {[...poll.options].sort((a, b) => a.position - b.position).map((o, i) => {
            const share = show && total ? (o.voteCount ?? 0) / total : 0;
            const isMine = o.id === mine;
            return (
              <Pressable key={o.id} onPress={() => vote(o.id)} disabled={!live}
                accessibilityRole="radio" accessibilityState={{ checked: isMine, disabled: !live }}
                accessibilityLabel={`${o.label}${show ? `, ${Math.round(share * 100)} percent` : ""}${isMine ? ", your vote" : ""}`}
                style={({ pressed }) => [styles.opt, i > 0 && { borderTopColor: c.line, borderTopWidth: 1 }, pressed && live && { opacity: 0.85 }]}>
                <VoteBar share={share} show={show} delay={justVoted.current ? PEN_MS : i * 60} color={c.pastel.lilac.soft} onGrown={onGrown} />
                <View style={[styles.box, { borderColor: mine != null && !isMine ? c.line2 : c.ink2, backgroundColor: c.card }]}>
                  <PenX drawn={isMine} instant={isMine && !justVoted.current} />
                </View>
                <T v="callout" style={[{ flex: 1 }, closed && o.id === lead && { fontWeight: "700" }]}>
                  {o.label}{isMine ? <T v="pill" color={c.pastel.lilac.ink}>  yours</T> : null}
                </T>
                {show ? <T v="mono" color={o.id === lead ? c.pastel.lilac.ink : c.ink3} style={{ fontSize: 12 }}>{Math.round(share * 100)}%</T> : null}
              </Pressable>
            );
          })}
        </Animated.View>
      ) : null}

      <View style={styles.foot}>
        <Icon name={closed ? "check" : mine != null ? "lock" : "envelope"} size={13} color={closed || mine != null ? c.pastel.mint.ink : c.ink3} />
        <T v="meta" color={c.ink3} style={{ flex: 1, fontSize: 12 }}>{foot}</T>
      </View>
    </Animated.View>
  );
}

/** The dashed tear line with half-punched holes at each side (mock `.tq-perf`). */
function Perforation() {
  const { c } = useTheme();
  return (
    <View style={styles.perf}>
      <View style={styles.dashes}>
        {Array.from({ length: 48 }, (_, i) => <View key={i} style={[styles.dash, { backgroundColor: c.line2 }]} />)}
      </View>
      <View style={[styles.hole, { left: -9.5, backgroundColor: c.paper, borderColor: c.line2 }]} />
      <View style={[styles.hole, { right: -9.5, backgroundColor: c.paper, borderColor: c.line2 }]} />
    </View>
  );
}

/**
 * The envelope's flap and wax seal, under the question until it's opened. The flap folds
 * back about its top edge and fades as it passes edge-on; the seal lifts and fades. Height
 * collapses with the card's layout transition once it's gone.
 */
export function Envelope({ open }: { open: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const [gone, setGone] = useState(open);
  const p = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    if (!open || gone) return;
    p.value = withTiming(1, m.timing(m.reduced ? DUR.fade : 360, m.reduced ? "out" : "standard"));
    const t = setTimeout(() => setGone(true), m.t(m.reduced ? DUR.fade : 380));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const flap = useAnimatedStyle(() => m.reduced
    ? { opacity: 1 - p.value }
    : { opacity: p.value < 0.5 ? 1 : 1 - (p.value - 0.5) * 2, transform: [{ perspective: 600 }, { rotateX: `${p.value * 160}deg` }] });
  const seal = useAnimatedStyle(() => m.reduced
    ? { opacity: 1 - p.value }
    : { opacity: 1 - Math.min(1, p.value * 1.6), transform: [{ translateY: -18 * p.value }, { scale: 1 + 0.25 * p.value }] });
  const hint = useAnimatedStyle(() => ({ opacity: 1 - p.value }));

  if (gone) return null;
  const ink = c.pastel.lilac.ink;
  return (
    <View style={styles.env} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.flap, flap]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
          <Path d="M0 0 L50 38 L100 0 Z" fill={c.pastel.lilac.soft} stroke={alpha(ink, 0.35)} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.seal, { backgroundColor: c.pastel.lilac.fill, borderColor: ink }, seal]}>
        <Icon name="lock" size={14} color={ink} />
      </Animated.View>
      <Animated.View style={[styles.hint, hint]}>
        <T v="pill" color={c.ink3}>Tap to open</T>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingBottom: 14 },
  stub: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10, paddingBottom: 9, paddingHorizontal: 16, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  perf: { height: 1.5 },
  dashes: { flexDirection: "row", gap: 4, overflow: "hidden", height: 1.5, marginHorizontal: 8 },
  dash: { width: 5, height: 1.5, borderRadius: 1 },
  hole: { position: "absolute", top: -7.5, width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  q: { paddingTop: 14, paddingHorizontal: 16 },
  env: { height: 92, marginTop: 10, marginHorizontal: 16, alignItems: "center" },
  flap: { position: "absolute", left: 0, right: 0, top: 0, height: 56, transformOrigin: "top" },
  seal: { position: "absolute", top: 40, width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  hint: { position: "absolute", bottom: 0 },
  options: { paddingTop: 8, paddingHorizontal: 8 },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8 },
  box: { width: 24, height: 24, borderWidth: 1.8, borderRadius: 5 },
  foot: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, paddingHorizontal: 16 },
});
