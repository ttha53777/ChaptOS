/**
 * Press feedback for plain Pressables (icon buttons, text links, row openers, steppers):
 * a brief dim while the finger is down, the platform's TouchableOpacity answer. Buttons
 * with a hard shadow press into it instead (see paper/Button); selection chips answer by
 * changing state, so they don't need this.
 *
 *   style={({ pressed }) => [styles.x, pressed && pressedDim]}
 */
import type { ViewStyle } from "react-native";

export const pressedDim: ViewStyle = { opacity: 0.6 };
