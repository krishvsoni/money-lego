import { redirect } from "next/navigation";

// Gated on the signed-in account, which is only known in the browser.
export const instant = false;

export default function Dashboard() {
  redirect("/workflows");
}
