import { NextResponse } from 'next/server';

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type ApiSuccessEnvelope<T> = {
  ok: true;
  data: T;
  meta?: JsonObject;
};

export type ApiErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: JsonValue;
  };
};

export function jsonOk<T>(data: T, meta?: JsonObject): NextResponse<ApiSuccessEnvelope<T>> {
  if (meta) {
    return NextResponse.json({ ok: true, data, meta });
  }
  return NextResponse.json({ ok: true, data });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: JsonValue
): NextResponse<ApiErrorEnvelope> {
  if (details !== undefined) {
    return NextResponse.json(
      { ok: false, error: { code, message, details } },
      { status }
    );
  }
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
