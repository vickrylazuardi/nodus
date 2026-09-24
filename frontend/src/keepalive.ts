/**
 * Scheduled keepalive for the NODUS deployment.
 *
 * WHY THIS EXISTS ALONGSIDE THE LOCAL CRON JOB
 * --------------------------------------------
 * The Hermes cron job runs on the Mac, so it stops when the laptop is asleep or
 * shut, which is most of the night. Render's free tier sleeps a web service
 * after 15 minutes idle, so a keepalive with an overnight hole means the first
 * morning visitor waits about a minute for a cold start. This Worker runs on
 * Cloudflare's edge and fires whether or not the Mac is awake. Cron Triggers are
 * included on the Workers free plan at no extra cost.
 *
 * WHAT IT PINGS, AND WHY NOT THE PAGE
 * -----------------------------------
 * The deployed /peta page is a 1,139-byte JavaScript shell. Measured: the served
 * HTML contains no backend URL and no data, because everything arrives later in
 * the browser. Curling that page keeps only the Cloudflare edge awake, and the
 * edge never sleeps, so it would leave Render and Neon asleep.
 *
 * GET /api is the wake-up call: it reads no database, so it keeps Render warm
 * while costing Neon nothing. Neon bills a 0.25 CU minimum each time the compute
 * wakes and grants 100 CU-hours/month, so touching the database every 12 minutes
 * would burn roughly 75 CU-hours. The daily /api/health call below is what keeps
 * the Neon project from being archived for inactivity, at about 2 CU-hours/month.
 *
 * FAILURE BEHAVIOUR
 * -----------------
 * This handler does not throw on a non-200 response, because a thrown error is
 * recorded as a failed invocation and repeated failures can get a Worker
 * disabled. It logs instead, and the log is what to check.
 */

/**
 * The three Workers runtime types this handler uses, declared locally.
 *
 * Deliberately not `@cloudflare/workers-types`: that package declares `fetch`,
 * `Response` and `Request` as globals, which collide with the DOM lib this
 * project's tsconfig already loads, so installing it would mean resolving a
 * global type conflict for three stable names. The runtime shapes below are the
 * documented contract, and wrangler type-checks and bundles this file itself.
 */
interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const API_BASE = "https://nodus-0qo0.onrender.com";

/** A cold Render instance takes about a minute to wake. */
const TIMEOUT_MS = 120_000;

/** A response slower than this means the instance had slept and this woke it. */
const COLD_MS = 2_000;

async function ping(path: string, label: string): Promise<void> {
  const url = `${API_BASE}${path}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "nodus-keepalive-worker/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!response.ok) {
      // Logged, not thrown: a failed invocation count can disable the Worker.
      console.error(`${label}: HTTP ${response.status} from ${url} after ${ms}ms`);
      return;
    }
    // A slow success means the instance had slept, so the schedule is not
    // achieving its purpose. Worth seeing in the log.
    console.log(`${label}: HTTP ${response.status} in ${ms}ms${ms > COLD_MS ? " (woke from sleep)" : ""}`);
  } catch (error) {
    console.error(`${label}: request to ${url} failed: ${String(error)}`);
  }
}

export default {
  async scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    // waitUntil keeps the invocation alive until the pings settle. Without it
    // the handler could return and the requests be cancelled mid-flight.
    ctx.waitUntil(
      (async () => {
        // Every tick: keep Render warm. No DB session, so Neon stays asleep.
        await ping("/api", "backend");

        // Once a day: touch the database so the Neon project is not archived.
        // 00:00 UTC is 07:00 WIB.
        if (new Date().getUTCHours() === 0) {
          await ping("/api/health", "database");
        }
      })(),
    );
  },
};
