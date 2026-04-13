import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GH_USERNAME;
const repoName = process.env.GH_REPO;

if (!token) {
  console.error("ERROR: Missing GITHUB_TOKEN");
  process.exit(1);
}

const headers = {
  "Authorization": `Bearer ${token}`,
  "Accept": "application/vnd.github+json"
};

// -------------------------------
// 1. SEARCH HELPERS
// -------------------------------

async function searchRepos(query) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20`;

  const res = await fetch(url, { headers });
  const data = await res.json();

  if (!data.items) {
    console.error("GitHub API error:", data);
    return [];
  }

  return data.items;
}

async function searchDormantRepos() {
  console.log("🔍 Searching for dormant repos...");

  // Query 1 — MIT
  const q1 = [
    "stars:10..300",
    "license:mit",
    "pushed:<2023-01-01",
    "archived:false",
    "fork:false"
  ].join(" ");

  // Query 2 — Apache
  const q2 = [
    "stars:10..300",
    "license:apache-2.0",
    "pushed:<2023-01-01",
    "archived:false",
    "fork:false"
  ].join(" ");

  const mitRepos = await searchRepos(q1);
  const apacheRepos = await searchRepos(q2);

  const combined = [...mitRepos, ...apacheRepos];

  // Filter in code (Option B)
  const filtered = combined.map(r => ({
    full_name: r.full_name,
    html_url: r.html_url,
    stars: r.stargazers_count,
    last_push: r.pushed_at,
    license: r.license?.spdx_id || "Unknown"
  }));

  return filtered;
}

// -------------------------------
// 2. FORK LOGIC
// -------------------------------

async function forkRepo(fullName) {
  const url = `https://api.github.com/repos/${fullName}/forks`;

  const res = await fetch(url, {
    method: "POST",
    headers
  });

  if (res.status === 202) {
    return { success: true };
  } else {
    const err = await res.json();
    return { success: false, error: err };
  }
}

// -------------------------------
// 3. MAIN ENGINE
// -------------------------------

async function run() {
  console.log("🔍 GHHarvestScanner: Starting scan...");

  const repos = await searchDormantRepos();

  console.log(`Found ${repos.length} dormant repos.`);

  const results = [];

  for (const r of repos) {
    console.log(`➡️ Forking ${r.full_name}...`);

    const forkResult = await forkRepo(r.full_name);

    results.push({
      repo: r.full_name,
      stars: r.stars,
      last_push: r.last_push,
      license: r.license,
      forked: forkResult.success,
      error: forkResult.error || null
    });
  }

  // Write logs
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join("logs", `scan-${timestamp}.json`);

  if (!fs.existsSync("logs")) fs.mkdirSync("logs");

  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));

  console.log(`📄 Log written to ${logPath}`);
  console.log("✅ GHHarvestScanner complete.");
}

run();
