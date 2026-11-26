/**
 * A fake Expo Push API, so the sender can be tested without the network.
 *
 *   vi.mock("@/lib/push/expo", () => expoMockModule());   // top level, hoisted
 *   beforeEach(() => resetExpoMock());
 *   expoMock.send.mockResolvedValueOnce([{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }]);
 *
 * By default every message gets an ok ticket (id "t<n>") and every receipt is ok.
 */
import { vi } from "vitest";
import type { ExpoMessage, ExpoReceipt, ExpoTicket } from "@/lib/push/expo";

let n = 0;
export const expoMock = {
  send:     vi.fn<(messages: ExpoMessage[]) => Promise<ExpoTicket[]>>(),
  receipts: vi.fn<(ids: string[]) => Promise<Record<string, ExpoReceipt>>>(),
};

export function resetExpoMock() {
  n = 0;
  expoMock.send.mockReset();
  expoMock.receipts.mockReset();
  expoMock.send.mockImplementation(async messages => messages.map(() => ({ status: "ok" as const, id: `t${++n}` })));
  expoMock.receipts.mockImplementation(async ids => Object.fromEntries(ids.map(id => [id, { status: "ok" as const }])));
}

/** Every message the sender handed to Expo, across all calls. */
export function sentMessages(): ExpoMessage[] {
  return expoMock.send.mock.calls.flatMap(c => c[0]);
}

export function expoMockModule() {
  return {
    SEND_BATCH: 100,
    RECEIPT_BATCH: 1000,
    expoSend:     (m: ExpoMessage[]) => expoMock.send(m),
    expoReceipts: (ids: string[]) => expoMock.receipts(ids),
  };
}
