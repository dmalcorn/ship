export type Severity = 'critical' | 'warning' | 'info';

export interface ProposedAction {
  id: string;
  label: string;
  description: string;
}

export interface Finding {
  id: string;
  threadId: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  affectedDocumentId: string | null;
  affectedDocumentType: string | null;
  affectedDocumentTitle: string | null;
  affectedDocumentCount: number;
  proposedActions: ProposedAction[];
  createdAt: string;
}

export interface FindingsResponse {
  findings: Finding[];
  lastScanAt: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

export interface ChatResponse {
  summary: string;
  findings: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    evidence: string;
    recommendation: string;
  }>;
  severity: 'warning' | 'clean' | 'info' | 'critical';
  proposedActions: Array<{
    findingId: string;
    action: string;
    requiresConfirmation: boolean;
  }>;
}
