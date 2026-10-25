import { redirect } from "next/navigation";

// Credentials became Connections: services are now connected by signing in.
export default function Page() {
  redirect("/connections");
}
