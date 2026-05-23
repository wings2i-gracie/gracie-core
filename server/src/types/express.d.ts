declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: 'super_admin' | 'org_admin' | 'compliance_manager' | 'leadership' | 'function_owner' | 'context_owner' | 'auditor' | 'viewer';
      tenantId: string | null;
      organisationId: string | null;
      functionId: string | null;
      locationId: string | null;
      isSupportMode?: boolean;
      originalRole?: string;
      organisationName?: string;
    };
  }
}

export {};
