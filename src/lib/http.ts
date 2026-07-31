import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(error: unknown, status = 500) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", details: error.flatten() }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status });
}

export function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return { type: error.name, message: error.message };
  }

  return { type: "UnknownError", message: String(error) };
}
