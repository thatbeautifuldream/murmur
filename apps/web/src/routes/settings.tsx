import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SettingsIcon />
          </EmptyMedia>
          <EmptyTitle>Coming soon</EmptyTitle>
          <EmptyDescription>
            Dictation preferences and shortcuts will live here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
