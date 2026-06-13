export type StartCallInput = {
  phone: string;
  elderId: string;
  callSessionId: string;
};

export type StartCallResult = {
  providerCallId: string;
  status: "dialing" | "answered" | "no_answer" | "failed";
};

export interface TelephonyProvider {
  startCall(input: StartCallInput): Promise<StartCallResult>;
  endCall(callSessionId: string): Promise<void>;
}
