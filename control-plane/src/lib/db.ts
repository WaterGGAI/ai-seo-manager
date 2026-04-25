export async function getDatabaseHealth(env: Cloudflare.Env) {
  if (!env.DB) {
    return {
      connected: false,
      error: "D1 binding is not configured yet."
    };
  }

  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return {
      connected: row?.ok === 1
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
