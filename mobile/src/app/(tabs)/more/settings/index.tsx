/** More → Settings: the index (src/settings/Index.tsx). Everyone reaches it, as on the web. */
import { queryClient } from "~/data/query";
import { SettingsFrame } from "~/settings/frame";
import { SettingsIndex } from "~/settings/Index";

export default function SettingsPage() {
  return (
    <SettingsFrame title="Settings" back="More" onRefresh={() => queryClient.invalidateQueries()}>
      <SettingsIndex />
    </SettingsFrame>
  );
}
