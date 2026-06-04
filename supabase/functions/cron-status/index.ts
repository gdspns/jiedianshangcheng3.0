import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WATCHED = [
  "auto-reset-traffic-hourly",
  "auto-backfill-client-records-daily",
  "auto-fulfill-every-minute",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const client = new Client(Deno.env.get("SUPABASE_DB_URL")!);
  try {
    await client.connect();

    const jobsRes = await client.queryObject<{
      jobid: number; jobname: string; schedule: string; active: boolean;
    }>(
      `SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = ANY($1)`,
      [WATCHED],
    );

    const lastRunsRes = await client.queryObject<{
      jobid: number; start_time: Date; end_time: Date | null; status: string; return_message: string;
    }>(
      `SELECT DISTINCT ON (jobid) jobid, start_time, end_time, status, return_message
       FROM cron.job_run_details WHERE jobid = ANY($1)
       ORDER BY jobid, start_time DESC`,
      [jobsRes.rows.map((j) => j.jobid)],
    );
    const lastByJob = new Map<number, any>();
    for (const r of lastRunsRes.rows) lastByJob.set(r.jobid, r);

    const runningRes = await client.queryObject<{ jobid: number }>(
      `SELECT jobid FROM cron.job_run_details
       WHERE jobid = ANY($1) AND status = 'running'`,
      [jobsRes.rows.map((j) => j.jobid)],
    );
    const runningSet = new Set(runningRes.rows.map((r) => r.jobid));

    const jobs = jobsRes.rows.map((j) => {
      const last = lastByJob.get(j.jobid) || null;
      return {
        name: j.jobname,
        schedule: j.schedule,
        active: j.active,
        running: runningSet.has(j.jobid),
        lastRun: last ? last.start_time : null,
        lastEnd: last ? last.end_time : null,
        lastStatus: last ? last.status : null,
        lastMessage: last ? last.return_message : null,
      };
    });

    // History: last 20 executions from cron_execution_logs (richer than pg_cron's return_message)
    const histRes = await client.queryObject<{
      created_at: Date; checked: number; reset_count: number; skipped_count: number;
      failed_count: number; trigger_source: string;
    }>(
      `SELECT created_at, checked, reset_count, skipped_count, failed_count, trigger_source
       FROM public.cron_execution_logs
       WHERE job_name = 'auto-reset-traffic'
       ORDER BY created_at DESC LIMIT 20`,
    );
    const history = histRes.rows.map((r) => ({
      startTime: r.created_at,
      endTime: r.created_at,
      status: "succeeded",
      checked: Number(r.checked),
      reset: Number(r.reset_count),
      skipped: Number(r.skipped_count),
      failed: Number(r.failed_count),
      source: r.trigger_source,
      message: `检查 ${r.checked} 个 · 重置 ${r.reset_count} 个 · 跳过 ${r.skipped_count} · 失败 ${r.failed_count}`,
    }));

    return new Response(
      JSON.stringify({ success: true, jobs, history, now: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    try { await client.end(); } catch {}
  }
});
