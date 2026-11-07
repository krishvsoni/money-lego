import { Suspense } from "react";
import { View } from "./view";

// Gated on the signed-in account, which is only known in the browser.
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
