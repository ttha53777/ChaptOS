/** Set when any API call answers 426 APP_UPDATE_REQUIRED. The root layout then
 *  shows the blocking Update screen instead of anything else. */
import { createStore } from "./store";

export const updateGate = createStore<{ minVersion: string } | null>(null);
export const useUpdateGate = () => updateGate.use();
