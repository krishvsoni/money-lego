import { z } from "zod";
import { createLocalAccount } from "@/server/auth/session";
import { route } from "@/server/http/handler";

const body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(320),
  password: z.string().min(12).max(200),
});

export const POST = route({ auth: false, body, rate: { name: "auth-sign-up", limit: 5, windowSeconds: 900 } }, async ({ body }) => {
  const user = await createLocalAccount(body);
  return { user: { name: user.name } };
});
