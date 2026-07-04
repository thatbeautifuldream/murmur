import { createFileRoute } from "@tanstack/react-router";
import { Item, ItemContent, ItemGroup, ItemDescription, ItemTitle } from "@/components/ui/item";

declare const __APP_VERSION__: string;

export const Route = createFileRoute("/about")({
  component: AboutRoute,
});

function AboutRoute() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-8">
      <h1 className="text-lg font-semibold tracking-tight">About</h1>
      <ItemGroup>
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Murmur</ItemTitle>
            <ItemDescription>A hotkey-driven dictation tool for your Mac.</ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Version</ItemTitle>
            <ItemDescription className="tabular-nums">{__APP_VERSION__}</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}
