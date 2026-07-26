import { memo } from "react";
import { Streamdown } from "streamdown";
import { getDesktopBridge } from "@/desktopBridge";
import { shikiCodePlugin } from "@/lib/shiki-code-plugin";
import { cn } from "@/lib/utils";

// Module-level so the object identity is stable — Streamdown memoizes blocks
// on prop identity, and a fresh object each render would re-highlight every
// code block on every streamed delta.
const PLUGINS = { code: shikiCodePlugin };

const COMPONENTS = {
  // The pill is a frameless, always-on-top window with no chrome and no way
  // back, so an in-window navigation would strand the user on whatever page
  // the agent linked to. Hand the URL to the OS instead.
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <button
      type="button"
      className="underline underline-offset-2"
      onClick={() => {
        if (href) void getDesktopBridge()?.openExternal(href);
      }}
    >
      {children}
    </button>
  ),
};

/** Renders the agent's reply as markdown while it streams. Sized for the
 *  dictation pill: see `.agent-markdown` in index.css for the compact
 *  spacing/type overrides on top of Streamdown's defaults. */
export const AgentMarkdown = memo(function AgentMarkdown({
  children,
  animating,
  dark,
}: {
  children: string;
  animating: boolean;
  dark: boolean;
}) {
  return (
    <Streamdown
      plugins={PLUGINS}
      components={COMPONENTS}
      caret="block"
      isAnimating={animating}
      // Copy is worth the row of pixels for code (voice replies are often a
      // command to run); tables are already too wide for the pill to bother.
      controls={{ code: true, table: false }}
      // The confirmation modal has nowhere to render in a 288px pill, and
      // links never navigate here anyway — `a` above routes them to the OS.
      linkSafety={{ enabled: false }}
      className={cn("agent-markdown", dark && "dark")}
    >
      {children}
    </Streamdown>
  );
});
