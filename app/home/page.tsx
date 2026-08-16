"use client";

import { useRouter } from "next/navigation";
import CommandCenterDashboard from "@/components/command-center-dashboard";

export default function Home() {
  const router = useRouter();

  return (
    <CommandCenterDashboard
      onToggleShowroom={() => router.push("/showroom")}
    />
  );
}
