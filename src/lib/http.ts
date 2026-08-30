import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const MAX_PUBLIC_JSON_BODY_BYTES = 64 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "RequestBodyTooLargeError";
  }
}

type ErrorSummary = {
  type: string;
  message: string;
  status?: number;
  details?: unknown;
};

export function jsonError(error: unknown, status = 500) {
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json({ error: error.message }, { status: 413 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", details: error.flatten() }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody(request: Request, maxBytes = MAX_PUBLIC_JSON_BODY_BYTES): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return JSON.parse("");
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(bytes));
}

export function summarizeError(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    const summary: ErrorSummary = { type: error.name, message: error.message };
    const status = getErrorField(error, "status");
    const details = getErrorField(error, "details");

    if (typeof status === "number") {
      summary.status = status;
    }

    if (details !== undefined) {
      summary.details = details;
    }

    return summary;
  }

  return { type: "UnknownError", message: String(error) };
}

function getErrorField(error: Error, field: "status" | "details"): unknown {
  return field in error ? (error as Error & Record<typeof field, unknown>)[field] : undefined;
}
