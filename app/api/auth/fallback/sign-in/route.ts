import { z } from "zod";
import { signInLocal } from "@/server/auth/session";
import { route } from "@/server/http/handler";

const body = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

export const POST = route({ auth: false, body, rate: { name: "auth-sign-in", limit: 10, windowSeconds: 900 } }, async ({ body }) => {
  const user = await signInLocal(body.email, body.password);
  return { user: { name: user.name } };
});
