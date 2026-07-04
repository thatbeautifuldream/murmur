import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/layout/page-layout";

export const Route = createFileRoute("/getting-started")({
  component: GettingStartedRoute,
});

/** Getting started — the template's setup walkthrough. */
function GettingStartedRoute() {
  return (
    <PageLayout>
      {`Run \`bun install\` then \`bun run dev\` to start.
Edit NAV_ITEMS in app-sidebar.tsx and add files to src/routes.
Declare IPC calls in @app/contracts — they stay typed end to end.`}
    </PageLayout>
  );
}
