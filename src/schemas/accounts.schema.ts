import { z } from "zod";

export const accountSchema = z.object({
  id: z.string().uuid(),
  accountNumber: z.string().min(1),
  currency: z.string().length(3),
  balanceCents: z.number().int(),
});

export const accountsResponseSchema = z.array(accountSchema);

export type Account = z.infer<typeof accountSchema>;
