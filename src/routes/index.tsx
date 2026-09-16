import { createFileRoute } from "@tanstack/react-router";
import { NexusGame } from "@/components/nexus-game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="h-dvh bg-bg">
      <NexusGame />
    </main>
  );
}
