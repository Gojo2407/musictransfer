import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { authorizeUrl } from "@/lib/spotify";

export async function GET(req: Request) {
  const home = new URL("/", req.url);
  if (!(await isLoggedIn())) return NextResponse.redirect(home);
  const state = randomBytes(16).toString("hex");
  let target: string;
  try {
    target = authorizeUrl(state);
  } catch (e) {
    home.searchParams.set("msg", `Erreur : ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.redirect(home);
  }
  const res = NextResponse.redirect(target);
  res.cookies.set("mt_oauth", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
