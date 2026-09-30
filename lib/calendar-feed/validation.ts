import { db } from "@/lib/db";
import { auditCalendarFeed, type ScheduleIssue } from "./audit";
import { validZone } from "./schedule";
import { feedRolloutAllowed } from "./config";

type Scoped = ReturnType<typeof db>;

export interface FeedReadiness {
  timeZone: string | null;
  provisioned: boolean;
  issues: ScheduleIssue[];
  /** First unmet data requirement an admin must fix (zone, blocking items). */
  dataProblem: string | null;
  /** Anything that would fail a check, including a link not yet created. */
  problem: string | null;
}

/** The data half of readiness. The projection half is the worker's full pass. */
export async function feedReadiness(scoped: Scoped): Promise<FeedReadiness> {
  const [org, subscription, issues] = await Promise.all([
    scoped.organization.findFirst({ select: { timeZone: true } }),
    scoped.calendarSubscription.find(),
    auditCalendarFeed(scoped),
  ]);
  const timeZone = org?.timeZone && validZone(org.timeZone) ? org.timeZone : null;
  const provisioned = Boolean(subscription?.tokenCiphertext);
  const blocking = issues.filter(issue => issue.blocking).length;
  const dataProblem = !timeZone ? "Confirm the organization's time zone first."
    : blocking ? `Fix the ${blocking} item${blocking === 1 ? "" : "s"} blocking calendar subscriptions first.`
    : null;
  const problem = dataProblem ?? (provisioned ? null : "The subscription link hasn't been created yet.");
  return { timeZone, provisioned, issues, dataProblem, problem };
}

/**
 * Called by the worker after a successful full projection that started after
 * the request was committed. Data that became blocking in the meantime fails
 * the check (the request clears, validatedAt stays unset) rather than passing.
 */
export async function settleRequestedValidation(orgId: number, requestedAt: Date): Promise<boolean> {
  const scoped = db(orgId);
  const { problem } = await feedReadiness(scoped);
  // Runs right after a successful full projection, which is what `enable`
  // otherwise waits for; the rollout gate is re-read in case it closed meanwhile.
  await scoped.calendarSubscription.settleValidation(requestedAt, problem === null, feedRolloutAllowed(orgId));
  return problem === null;
}
