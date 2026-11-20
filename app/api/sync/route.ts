import { NextResponse } from "next/server";
import { isCron, isLoggedIn } from "@/lib/auth";
import { describeResult } from "@/lib/describe";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const cron = isCron(req);
  if (!cron && !(await isLoggedIn())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const url = new URL(req.url);
  let force = url.searchParams.get("force") === "1";
  if (!cron) {
    const form = await req.formData().catch(() => null);
    force ||= form?.get("force") === "1";
  }

  try {
    const result = await runSync({ force });
    if (cron) return NextResponse.json(result);
    const home = new URL("/", req.url);
    home.searchParams.set("msg", describeResult(result).text);
    return NextResponse.redirect(home, 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (cron) return NextResponse.json({ error: msg }, { status: 500 });
    const home = new URL("/", req.url);
    home.searchParams.set("msg", `Erreur : ${msg}`);
    return NextResponse.redirect(home, 303);
  }
}
