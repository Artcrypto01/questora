import https from "node:https";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasServerSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

async function getRequestBody(request: Request, init?: RequestInit) {
  if (init?.body !== undefined) return init.body;
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  return Buffer.from(await request.arrayBuffer());
}

async function serverFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const body = await getRequestBody(request, init);
  const url = new URL(request.url);

  return new Promise((resolve, reject) => {
    const nodeRequest = https.request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        rejectUnauthorized: process.env.NODE_ENV === "production"
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const status = response.statusCode ?? 500;
          const responseBody = status === 204 || status === 304 ? null : Buffer.concat(chunks);
          resolve(
            new Response(responseBody, {
              status,
              statusText: response.statusMessage,
              headers: response.headers as HeadersInit
            })
          );
        });
      }
    );

    nodeRequest.on("error", reject);
    if (body) nodeRequest.write(body);
    nodeRequest.end();
  });
}

export const serverSupabase = hasServerSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      global: {
        fetch: serverFetch
      }
    })
  : null;
