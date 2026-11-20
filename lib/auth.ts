import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

export const COOKIE = "mt_auth";

export function sessionValue(): string {
  return createHash("sha256").update(`${env("DASHBOARD_PASSWORD")}|${env("CRON_SECRET")}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function isLoggedIn(): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && safeEqual(c, sessionValue());
}

export function isCron(req: Request): boolean {
  const h = req.headers.get("authorization") ?? "";
  return safeEqual(h, `Bearer ${env("CRON_SECRET")}`);
}
