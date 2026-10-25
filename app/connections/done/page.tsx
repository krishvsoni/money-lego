import { Suspense } from "react";
import { View } from "./view";

export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
