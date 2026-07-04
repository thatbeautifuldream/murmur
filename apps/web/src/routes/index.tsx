import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/layout/page-layout";

export const Route = createFileRoute("/")({
  component: OverviewRoute,
});

/** Overview — the template's landing page. */
function OverviewRoute() {
  return (
    <PageLayout>
      {`A starter template for Electron + React desktop apps.
Typed IPC, an animated sidebar, and theming are wired up.
Replace this page with your own.`}
    </PageLayout>
  );
}
