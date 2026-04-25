export interface Env {
  APP_NAME?: string;
  APP_ENV?: string;
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    ...init
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return json({
        ok: true,
        app: env.APP_NAME ?? "AI SEO Manager",
        environment: env.APP_ENV ?? "development"
      });
    }

    return json({
      ok: true,
      app: env.APP_NAME ?? "AI SEO Manager",
      message: "Open-source AI SEO Manager worker scaffold is running.",
      docs: {
        architecture: "/docs/architecture.md",
        roadmap: "/ROADMAP.md"
      }
    });
  }
};
