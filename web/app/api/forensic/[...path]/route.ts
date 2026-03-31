import { NextRequest, NextResponse } from "next/server";

import { buildBackendHeaders, buildBackendUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const joinedPath = `/${path.join("/")}`;
  const upstreamUrl = new URL(buildBackendUrl(joinedPath));

  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const headers = buildBackendHeaders();
  const accept = request.headers.get("accept");
  const requestContentType = request.headers.get("content-type");
  const authorization = request.headers.get("authorization");

  if (accept) {
    headers.set("accept", accept);
  }
  if (requestContentType) {
    headers.set("content-type", requestContentType);
  }
  if (authorization && !headers.has("authorization")) {
    headers.set("authorization", authorization);
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown upstream proxy error";
    return NextResponse.json(
      { error: `forensic proxy failed: ${message}` },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) {
    responseHeaders.set("content-type", upstreamContentType);
  }
  const cacheControl = upstream.headers.get("cache-control");
  if (cacheControl) {
    responseHeaders.set("cache-control", cacheControl);
  }
  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentDisposition) {
    responseHeaders.set("content-disposition", contentDisposition);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
