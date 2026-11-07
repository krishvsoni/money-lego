import type { Metadata } from "next";
import { Suspense } from "react";
import { View } from "./view";

export const instant = false;
export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
