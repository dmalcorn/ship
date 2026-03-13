import { WorkspaceMembership } from '@ship/shared';

declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      userId: string;
      workspaceId: string;
      isSuperAdmin?: boolean;
      isApiToken?: boolean;
      workspaceMembership?: WorkspaceMembership;
      user?: {
        id: string;
        email: string;
        name: string;
        workspaceId: string;
      };
    }
  }
}

export {};