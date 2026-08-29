import { NextResponse } from "next/server";
import { ZodError } from "zod";

type ErrorSummary = {
  type: string;
  message: string;
  status?: number;
  details?: unknown;
};

export function jsonError(error: unknown, status = 500) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", details: error.flatten() }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status });
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
