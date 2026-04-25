export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers
    }
  });
}

export function html(markup: string, init?: ResponseInit) {
  return new Response(markup, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...init?.headers
    }
  });
}

export function notFound(pathname: string) {
  return json(
    {
      ok: false,
      error: `No route for ${pathname}`
    },
    { status: 404 }
  );
}
