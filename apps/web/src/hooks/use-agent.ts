import { useEffect, useState } from "react";
import type { AgentStatus, AgentToolApprovalRequest } from "@app/contracts";
import { getDesktopBridge } from "@/desktopBridge";

export function useAgent() {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [text, setText] = useState("");
  const [pendingApproval, setPendingApproval] = useState<AgentToolApprovalRequest | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onAgentStatusChanged((next) => {
      setStatus(next);
      if (next === "listening") setText("");
    });
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onAgentTextDelta((delta) => setText((prev) => prev + delta));
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onAgentToolApprovalRequest(setPendingApproval);
  }, []);

  const respond = (approved: boolean) => {
    const bridge = getDesktopBridge();
    if (!bridge || !pendingApproval) return;
    void bridge.respondToolApproval(pendingApproval.id, approved);
    setPendingApproval(null);
  };

  return { status, text, pendingApproval, respond };
}
