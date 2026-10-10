import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_LOGIN_PATH, SESSION_COOKIE } from "@/server/auth/constants";

/**
 * Admini optimistlik kaitse: kui sessiooniküpsist pole, suunatakse kohe sisselogimisele.
 * See EI ole ainus kontroll — sessiooni kehtivust kontrollitakse andmebaasist admini layout'is ja
 * igas server action'is (proxy ei tee andmebaasipäringuid).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === ADMIN_LOGIN_PATH;

  if (!isLogin && !request.cookies.has(SESSION_COOKIE)) {
    const url = new URL(ADMIN_LOGIN_PATH, request.url);
    if (pathname !== "/admin") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  // Admin ei kuulu otsingumootoritesse ega iframe'idesse; vastuseid ei puhverdata
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
