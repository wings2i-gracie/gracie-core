declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: string;
      tenantId: string | null;
      organisationId: string | null;
      locationId: string | null;
      isSupportMode?: boolean;
      originalRole?: string;
      organisationName?: string;
    };
  }
}

export {};
