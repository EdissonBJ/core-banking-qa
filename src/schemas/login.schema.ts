import { z } from "zod";

export const loginResponseSchema = z.object({
  token: z.string().min(1),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string().min(1),
  }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
