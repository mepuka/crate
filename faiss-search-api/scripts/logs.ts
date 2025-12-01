#!/usr/bin/env bun
/**
 * Quick log viewer for FAISS Search API on droplet
 *
 * Usage:
 *   bun scripts/logs.ts sync       # View sync logs
 *   bun scripts/logs.ts embed      # View embed logs
 *   bun scripts/logs.ts health     # Check service health
 *   bun scripts/logs.ts status     # Full status overview
 *   bun scripts/logs.ts tail       # Live tail of sync logs
 */

import { $ } from "bun";

const SERVER = "root@64.227.104.135";
const CONTAINER = "kexp-search-api";

type Command = "sync" | "embed" | "health" | "status" | "tail" | "cron" | "search";

async function runSSH(cmd: string): Promise<string> {
  const result = await $`ssh ${SERVER} ${cmd}`.text();
  return result;
}

async function syncLogs(lines = 30) {
  console.log(`\n📡 Last ${lines} sync log entries:\n`);
  const logs = await runSSH(
    `docker exec ${CONTAINER} cat /app/logs/sync.log | tail -${lines}`
  );

  // Parse and format JSON logs
  for (const line of logs.trim().split("\n")) {
    try {
      const entry = JSON.parse(line);
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const level = entry.level === "ERROR" ? "❌" : "✓";

      if (entry.event === "sync_complete") {
        const plays = entry.new_plays > 0 ? `+${entry.new_plays} plays` : "no new";
        console.log(`${time} ${level} ${plays} (${entry.duration_ms}ms) → ID ${entry.last_id}`);
      } else if (entry.message?.includes("still running")) {
        console.log(`${time} ⏳ ${entry.message}`);
      } else if (entry.level === "ERROR") {
        console.log(`${time} ${level} ${entry.message}`);
      }
    } catch {
      console.log(line);
    }
  }
}

async function embedLogs(lines = 20) {
  console.log(`\n🧠 Last ${lines} embed log entries:\n`);
  const logs = await runSSH(
    `docker exec ${CONTAINER} cat /app/logs/embed.log 2>/dev/null | tail -${lines} || echo "No embed logs yet"`
  );

  for (const line of logs.trim().split("\n")) {
    try {
      const entry = JSON.parse(line);
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const level = entry.level === "ERROR" ? "❌" : "✓";

      if (entry.event?.startsWith("embed_")) {
        console.log(`${time} ${level} ${entry.event}: processed=${entry.processed}, vectors=${entry.total_vectors}`);
      } else {
        console.log(`${time} ${level} ${entry.message}`);
      }
    } catch {
      if (line.trim()) console.log(line);
    }
  }
}

async function health() {
  console.log("\n🏥 Service Health:\n");

  try {
    const health = await $`curl -s https://cratemusic.duckdns.org/api/health`.json();
    const status = health.status === "ok" && health.index_loaded ? "✅ Healthy" : "❌ Unhealthy";
    console.log(`Status: ${status}`);
    console.log(`Vectors: ${health.total_vectors?.toLocaleString()}`);
    console.log(`Dimension: ${health.embedding_dimension}d`);
    console.log(`Memory: ${health.memory_usage_mb?.toFixed(0)} MB`);
    console.log(`DB: ${health.database_connected ? "✓ connected" : "✗ disconnected"}`);

    const uptimeHrs = Math.floor((health.uptime_seconds || 0) / 3600);
    const uptimeMins = Math.floor(((health.uptime_seconds || 0) % 3600) / 60);
    console.log(`Uptime: ${uptimeHrs}h ${uptimeMins}m`);
  } catch (e) {
    console.log("❌ Failed to reach health endpoint");
    console.log(e);
  }
}

async function status() {
  console.log("\n📊 FAISS Search API Status\n");
  console.log("=".repeat(50));

  // Health check
  await health();

  // Container status
  console.log("\n🐳 Container:\n");
  const uptime = await runSSH(`docker inspect --format='{{.State.StartedAt}}' ${CONTAINER}`);
  const started = new Date(uptime.trim());
  const uptimeMs = Date.now() - started.getTime();
  const hours = Math.floor(uptimeMs / 3600000);
  const mins = Math.floor((uptimeMs % 3600000) / 60000);
  console.log(`Uptime: ${hours}h ${mins}m`);

  // Crontab
  console.log("\n⏰ Crontab:\n");
  const cron = await runSSH(`docker exec ${CONTAINER} crontab -l | grep -v "^#" | grep -v "^$"`);
  console.log(cron.trim());

  // Recent syncs
  await syncLogs(5);
}

async function tailLogs() {
  console.log("\n📡 Tailing sync logs (Ctrl+C to stop)...\n");
  await $`ssh ${SERVER} "docker exec ${CONTAINER} tail -f /app/logs/sync.log"`;
}

async function showCron() {
  console.log("\n⏰ Current crontab:\n");
  const cron = await runSSH(`docker exec ${CONTAINER} crontab -l`);
  console.log(cron);
}

async function search(query: string) {
  console.log(`\n🔍 Searching for: "${query}"\n`);

  try {
    const body = JSON.stringify({ query, limit: 5 });
    const result = await $`curl -s -X POST "https://cratemusic.duckdns.org/api/search" -H "Content-Type: application/json" -d ${body}`.json();

    if (result.results?.length) {
      console.log(`Found ${result.total} results (${result.query_time_ms?.toFixed(0)}ms)\n`);
      for (const r of result.results) {
        const score = (r.similarity * 100).toFixed(1);
        console.log(`[${score}%] ${r.artist} - ${r.song}`);
        if (r.album) console.log(`        Album: ${r.album}`);
        if (r.comment) console.log(`        ${r.comment.slice(0, 80)}`);
        console.log();
      }
    } else {
      console.log("No results found");
    }
  } catch (e) {
    console.log("❌ Search failed");
    console.log(e);
  }
}

// Main
const command = (process.argv[2] || "status") as Command;
const arg = process.argv[3];

switch (command) {
  case "sync":
    await syncLogs(parseInt(arg) || 30);
    break;
  case "embed":
    await embedLogs(parseInt(arg) || 20);
    break;
  case "health":
    await health();
    break;
  case "status":
    await status();
    break;
  case "tail":
    await tailLogs();
    break;
  case "cron":
    await showCron();
    break;
  case "search":
    if (!arg) {
      console.log("Usage: bun scripts/logs.ts search <query>");
    } else {
      await search(process.argv.slice(3).join(" "));
    }
    break;
  default:
    console.log(`Unknown command: ${command}`);
    console.log(`
Usage: bun scripts/logs.ts <command> [args]

Commands:
  status          Full status overview (default)
  health          Service health check
  sync [n]        View last n sync logs (default: 30)
  embed [n]       View last n embed logs (default: 20)
  tail            Live tail of sync logs
  cron            Show current crontab
  search <query>  Test search endpoint
`);
}
