import { NextResponse } from "next/server";
import { COOKIE, safeEqual, sessionValue } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  if (safeEqual(password, env("DASHBOARD_PASSWORD"))) {
    res.cookies.set(COOKIE, sessionValue(), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }
  return res;
}
