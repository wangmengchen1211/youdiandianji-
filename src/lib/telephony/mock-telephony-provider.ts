import type {
  TelephonyProvider,
  StartCallInput,
  StartCallResult,
} from "./telephony-provider";

/**
 * Mock telephony provider for Demo/Hackathon.
 * Always returns "answered" to simulate a successful call connection.
 */
export class MockTelephonyProvider implements TelephonyProvider {
  async startCall(input: StartCallInput): Promise<StartCallResult> {
    // Simulate a brief dialing delay
    await new Promise((r) => setTimeout(r, 300));

    return {
      providerCallId: `mock_call_${input.callSessionId}_${Date.now()}`,
      status: "answered",
    };
  }

  async endCall(_callSessionId: string): Promise<void> {
    // Nothing to clean up in mock
    return;
  }
}
