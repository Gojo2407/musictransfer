import { NextResponse } from "next/server";
import { COOKIE, safeEqual, sessionValue } from "@/lib/auth";
import { env } from "@/lib/env";
import { redis } from "@/lib/store";

/** Anti-force brute : 10 essais ratés max par IP sur 15 minutes. */
const MAX_FAILS = 10;
const WINDOW_S = 15 * 60;

function clientIp(req: Request): string {
  // Sur Vercel, x-real-ip est fourni par la plateforme (non falsifiable par le client).
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: Request) {
  const failKey = `mt:login-fail:${clientIp(req)}`;
  const home = new URL("/", req.url);

  const fails = Number((await redis().get<number>(failKey)) ?? 0);
  if (fails >= MAX_FAILS) {
    home.searchParams.set("login", "locked");
    return NextResponse.redirect(home, 303);
  }

  const form = await req.formData();
  const password = String(form.get("password") ?? "");

  if (!safeEqual(password, env("DASHBOARD_PASSWORD"))) {
    const n = await redis().incr(failKey);
    if (n === 1) await redis().expire(failKey, WINDOW_S);
    home.searchParams.set("login", "failed");
    return NextResponse.redirect(home, 303);
  }

  await redis().del(failKey);
  const res = NextResponse.redirect(home, 303);
  res.cookies.set(COOKIE, sessionValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
