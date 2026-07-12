/**
 * Per-kind discovery angles for the /create concierge.
 *
 * A one-word kind answer ("frat", "club", "team") tells the concierge almost
 * nothing about how THIS org actually runs. These angles are the concrete,
 * human things worth asking about once a kind is known — what a person who
 * actually knows fraternities (or robotics teams, or a cappella groups) would
 * probe next, before locking in the page/seat/metric set. Pure data, no
 * React, no DB — consumed only by the concierge prompt (route.ts).
 */

import type { KindId } from "@/lib/onboarding/kinds";

export const KIND_DISCOVERY_ANGLES: Record<KindId, readonly string[]> = {
  fraternity: [
    "social scene vs. professional/service focus (changes whether parties or dues/community-service lead)",
    "rough chapter size",
    "whether they collect dues and run recruitment/rush",
  ],
  sorority: [
    "social scene vs. professional/service focus (changes whether parties or dues/community-service lead)",
    "rough chapter size",
    "whether they collect dues and run recruitment/rush",
  ],
  club: [
    "casual/interest hangout vs. something more structured (pre-professional, competition, cultural)",
    "whether they meet on a regular schedule or ad hoc",
    "whether dues or a treasury are involved",
  ],
  team: [
    "competitive/league team vs. casual or intramural",
    "whether there's a coach or it's player-run",
    "whether there are league fees or travel costs to track",
  ],
  service: [
    "what kind of service they focus on (community, campus, a specific cause)",
    "whether they log volunteer hours per member",
    "whether they fundraise or collect dues",
  ],
  honor: [
    "what the induction/eligibility bar is (GPA, activity, invite-only)",
    "whether they hold regular meetings or mostly just induct/recognize",
    "whether service hours factor in alongside academics",
  ],
  arts: [
    "a production company building toward a show/run vs. an ensemble (band, a cappella, dance crew) doing rehearsals and gigs",
    "rough group size and how often they rehearse",
    "whether dues or ticket/gig revenue are involved",
  ],
  other: [
    "what a typical week actually looks like for the group",
    "whether money (dues, fundraising) is involved at all",
    "roughly how many people are part of it",
  ],
};
