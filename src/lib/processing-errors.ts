export class ProcessingBusyError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Processing is busy. Please retry later.");
    this.name = "ProcessingBusyError";
  }
}

export class ProcessingOwnershipLostError extends Error {
  readonly retryAfterSeconds = 1;
  constructor() {
    super("Processing ownership was lost. Please retry.");
    this.name = "ProcessingOwnershipLostError";
  }
}

export function processingErrorResponse(error: unknown): Response | null {
  if (!(error instanceof ProcessingBusyError) && !(error instanceof ProcessingOwnershipLostError)) return null;
  return Response.json({ error: error.message }, {
    status: 503,
    headers: { "Retry-After": String(Math.max(1, Math.ceil(error.retryAfterSeconds))) }
  });
}
