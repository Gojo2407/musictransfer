import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { exchangeCode } from "@/lib/spotify";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const home = new URL("/", req.url);
  if (!(await isLoggedIn())) return NextResponse.redirect(home);

  const expected = (await cookies()).get("mt_oauth")?.value;
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code || !expected || url.searchParams.get("state") !== expected) {
    home.searchParams.set("msg", `Connexion Spotify refusée ou invalide (${url.searchParams.get("error") ?? "state"})`);
    return NextResponse.redirect(home);
  }
  await exchangeCode(code);
  home.searchParams.set("msg", "Spotify connecté ✔");
  const res = NextResponse.redirect(home);
  res.cookies.delete("mt_oauth");
  return res;
}
