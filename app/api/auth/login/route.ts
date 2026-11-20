import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { authorizeUrl } from "@/lib/spotify";

export async function GET(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.redirect(new URL("/", req.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("mt_oauth", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
