import { json } from "./http";

const BASIC_AUTH_REALM = "AI SEO Control";
const encoder = new TextEncoder();

function isHealthCheckRequest(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const url = new URL(request.url);
  return url.pathname === "/healthz";
}

function unauthorizedResponse() {
  return json(
    {
      ok: false,
      error: "Authentication required."
    },
    {
      status: 401,
      headers: {
        "www-authenticate": `Basic realm="${BASIC_AUTH_REALM}"`
      }
    }
  );
}

function missingConfigurationResponse() {
  return json(
    {
      ok: false,
      error: "Basic Auth is not configured for this deployment."
    },
    {
      status: 503
    }
  );
}

function parseBasicAuthorizationHeader(header: string | null) {
  if (!header) {
    return null;
  }

  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return null;
  }

  try {
    const decoded = atob(match[1]);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

async function timingSafeEqualString(left: string, right: string) {
  const [leftDigestBuffer, rightDigestBuffer] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);

  const leftDigest = new Uint8Array(leftDigestBuffer);
  const rightDigest = new Uint8Array(rightDigestBuffer);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(leftDigest, rightDigest);
  }

  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index] ^ rightDigest[index];
  }

  return difference === 0;
}

export async function enforceBasicAuth(request: Request, env: Cloudflare.Env) {
  if (isHealthCheckRequest(request)) {
    return null;
  }

  const expectedUsername = env.BASIC_AUTH_USERNAME;
  const expectedPassword = env.BASIC_AUTH_PASSWORD;
  if (!expectedUsername || !expectedPassword) {
    return missingConfigurationResponse();
  }

  const credentials = parseBasicAuthorizationHeader(request.headers.get("authorization"));
  if (!credentials) {
    return unauthorizedResponse();
  }

  const [usernameMatches, passwordMatches] = await Promise.all([
    timingSafeEqualString(credentials.username, expectedUsername),
    timingSafeEqualString(credentials.password, expectedPassword)
  ]);

  if (!usernameMatches || !passwordMatches) {
    return unauthorizedResponse();
  }

  return null;
}
