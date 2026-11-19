/**
 * Ask Chapt thread state on the phone. The wire shapes come from @/lib/api-types
 * (chat.ts); these are the client's own records of a turn, persisted per chapter.
 */
import type { AnswerData, ChatNotice, ChatProposal, EntityRef } from "@/lib/api-types";

export interface LedgerStep {
  id: string;
  verb: string;
  source?: string;
  status: "pending" | "active" | "done";
  finding?: string;
  /** A keyword guess shown while the model decides (~/chat/intent). Never persisted. */
  provisional?: boolean;
}

export type ProposalState = "pending" | "confirming" | "approved" | "discarded" | "error";

export interface ProposalCard extends ChatProposal {
  id: string;
  state: ProposalState;
  resultMessage?: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  /** User text, or the assistant's streamed plain-text reply. */
  content: string;
  /** User turns: names of files this message was the first to carry. */
  attachments?: string[];
  answer?: AnswerData;
  steps?: LedgerStep[];
  intent?: string;
  composing?: boolean;
  proposals?: ProposalCard[];
  notice?: ChatNotice;
  noteRefs?: Array<{ text: string; ref: EntityRef }>;
  /** The user stopped it; how many steps had finished. */
  stopped?: boolean;
  /** The stream broke (network, HTTP). `at` = the source the active step was reading. */
  error?: { at?: string; status?: number; message?: string };
  /** Ask-back replies already sent from this answer (so the block reads as answered). */
  replied?: boolean;
}
