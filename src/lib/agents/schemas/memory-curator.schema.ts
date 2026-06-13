import { z } from "zod";

export const MemoryExtractionSchema = z.object({
  new_memories: z.array(
    z.object({
      type: z.enum([
        "health_memory",
        "routine_memory",
        "preference_memory",
        "relationship_memory",
        "relay_memory",
        "emotional_signal",
      ]),
      content: z.string(),
      importance: z.enum(["low", "medium", "high"]),
      confidence: z.number().min(0).max(1),
      write_to: z.string().default("elder_profile"),
      requires_review: z.boolean().default(false),
    })
  ),
});
