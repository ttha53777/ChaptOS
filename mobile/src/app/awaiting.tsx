/**
 * A request is in; an officer hasn't decided (U2). The request as a sealed letter,
 * postmarked with the chapter and the day it went in, addressed in the name I asked
 * under. It checks back on its own every 30s (and on "Check again").
 *
 * The letter is remembered on this phone (~/entry/letter): when the request is approved
 * the root layout opens it as the "Join approved" moment, whether that happens while
 * this screen is up or the next time the app opens.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { keys } from "~/data/hooks";
import { useEntryOf } from "~/entry/EntryContext";
import { rememberLetter } from "~/entry/letter";
import { signOutHere } from "~/entry/session";
import { SealedLetter } from "~/moments/Letter";
import { Button } from "~/paper/Button";
import { useTheme } from "~/theme/PaperProvider";
import { Fine, Page } from "~/ui/Page";
import { T } from "~/ui/T";

export default function Awaiting() {
  const { c } = useTheme();
  const entry = useEntryOf("awaiting");
  const qc = useQueryClient();
  const recheck = () => {
    void qc.invalidateQueries({ queryKey: keys.joinRequests });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };
  useEffect(() => {
    const t = setInterval(recheck, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const req = entry?.request;
  // requestedAt / logoUrl arrived after the first builds' cache: tolerate them missing.
  const requestedAt = req?.requestedAt ?? new Date().toISOString();
  const logoUrl = req?.org.logoUrl ?? null;
  useEffect(() => {
    if (req) rememberLetter({ slug: req.org.slug, name: req.org.name, logoUrl, requestedAt, submittedName: req.submittedName });
  }, [req?.id, req?.org.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const org = req?.org.name ?? "your chapter";
  return (
    <Page
      kicker="In the post"
      tone="lilac"
      title={`Waiting on ${org}.`}
      lede="An officer will look at your request. The moment they let you in, this opens."
      footer={<>
        <Button label="Check again" icon="refresh" block onPress={recheck} />
        <Button label="Sign out" variant="soft" block onPress={() => void signOutHere()} />
      </>}
    >
      {req ? (
        <>
          <SealedLetter headroom={0} chapter={req.org.name} logoUrl={logoUrl} to={req.submittedName} requestedAt={requestedAt} />
          <T v="meta" color={c.ink3} align="center">{`You asked as “${req.submittedName}”. That's the name the chapter will see.`}</T>
        </>
      ) : null}
      <Fine>Wrong name? You can change it from your card once you're in.</Fine>
    </Page>
  );
}
