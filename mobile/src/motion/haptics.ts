/**
 * The haptic vocabulary, in one place to tune. Haptics accompany visible feedback,
 * never replace it: one per meaningful action, none on scroll or plain navigation.
 *
 *   tap      a press that commits something small (toggle, tick)
 *   select   moving a selection (segmented control, picker detent)
 *   soft     paper contact: a stamp's impact, a punch, a card settling
 *   success  a signature moment's result (checked in, task done, vote counted)
 *   warn     something needs a second look (closing soon)
 *   error    the server said no and the motion is playing backwards
 */
import * as Haptics from "expo-haptics";

const fire = (p: Promise<void>) => { p.catch(() => { /* no haptic engine (simulator, old Android) */ }); };

export const haptics = {
  tap: () => fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => fire(Haptics.selectionAsync()),
  soft: () => fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  success: () => fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
} as const;
export type HapticName = keyof typeof haptics;
