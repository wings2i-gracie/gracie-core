// E2.15b: OpenAPI 3.0 composition — merges per-product fragments into one spec.
// Products call registerOpenApiFragment() at startup; GET /openapi returns the merged doc.

const fragments = new Map<string, Record<string, unknown>>();

export function registerOpenApiFragment(productKey: string, fragment: Record<string, unknown>): void {
  fragments.set(productKey, fragment);
}

export function getComposedSpec(): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    openapi: '3.0.3',
    info: {
      title: 'GRACie Platform API',
      version: '2.0',
      description: 'Unified API specification for the GRACie platform suite.',
    },
    servers: [{ url: '/api/v1', description: 'GRACie API' }],
    paths: {} as Record<string, unknown>,
    components: {
      schemas: {} as Record<string, unknown>,
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'Authorization' },
      },
    },
  };

  for (const fragment of fragments.values()) {
    if (fragment.paths && typeof fragment.paths === 'object') {
      Object.assign(merged.paths as Record<string, unknown>, fragment.paths);
    }
    if (fragment.components && typeof fragment.components === 'object') {
      const fragComponents = fragment.components as Record<string, unknown>;
      const mergedComponents = merged.components as Record<string, unknown>;
      for (const [section, sectionValue] of Object.entries(fragComponents)) {
        if (sectionValue && typeof sectionValue === 'object') {
          if (!mergedComponents[section]) mergedComponents[section] = {};
          Object.assign(
            mergedComponents[section] as Record<string, unknown>,
            sectionValue,
          );
        }
      }
    }
  }

  return merged;
}
