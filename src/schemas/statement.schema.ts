import { z } from "zod";

export const statementEntrySchema = z.object({
  id: z.string().uuid(),
  transferId: z.string().uuid(),
  amountCents: z.number().int(),
  description: z.string().nullable(),
  counterpartAccountNumber: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const statementResponseSchema = z.array(statementEntrySchema);

export type StatementEntry = z.infer<typeof statementEntrySchema>;
