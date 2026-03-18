import { useState, useRef } from 'react';
import { FleetGraphFAB } from './FleetGraphFAB';
import { ChatDrawer } from './ChatDrawer';
import { useChatSession } from '../hooks/useChatSession';

interface FleetGraphOverlayProps {
  documentId: string | null;
  documentType: string | null;
  documentTitle?: string;
  workspaceId: string;
}

export function FleetGraphOverlay({
  documentId,
  documentType,
  documentTitle,
  workspaceId,
}: FleetGraphOverlayProps) {
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);

  const chatSession = useChatSession({ documentId, documentType, workspaceId });

  return (
    <>
      <FleetGraphFAB
        ref={fabRef}
        onClick={() => setChatDrawerOpen(true)}
        visible={!chatDrawerOpen}
      />
      <ChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        messages={chatSession.messages}
        isLoading={chatSession.isLoading}
        onSend={chatSession.sendMessage}
        onRetry={chatSession.retry}
        documentType={documentType}
        documentTitle={documentTitle}
        fabRef={fabRef}
      />
    </>
  );
}
