import { z } from "zod";

export const ConversationReplySchema = z.object({
  assistant_reply: z.string(),
  tone: z.string().default("warm"),
  safety_flags: z.array(z.string()).default([]),
});
