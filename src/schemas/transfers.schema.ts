import { z } from "zod";

export const transferResponseSchema = z.object({
  id: z.string().uuid(),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type TransferResponse = z.infer<typeof transferResponseSchema>;
