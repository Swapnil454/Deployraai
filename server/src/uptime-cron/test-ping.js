import { runPingCheck } from "./pingChecker.js";

async function runTests() {
  const cases = [
    { name: "Valid Public Domain", target_host: "google.com" },
    { name: "Valid Public IP", target_host: "8.8.8.8" },
    { name: "Invalid Domain", target_host: "thisdomaindoesnotexist.com" },
    { name: "SSRF - Localhost", target_host: "127.0.0.1" },
    { name: "SSRF - Private Network 10.x", target_host: "10.0.0.1" },
    { name: "SSRF - Private Network 192.168.x", target_host: "192.168.1.1" },
    { name: "SSRF - Cloud Metadata", target_host: "169.254.169.254" },
  ];

  console.log("Starting Ping Checker Tests...\n");

  for (const c of cases) {
    console.log(`Testing: ${c.name} (${c.target_host})`);
    const result = await runPingCheck({
      target_host: c.target_host,
      packet_count: 2,
      packet_timeout: 1000
    });
    console.log(`Result: ${JSON.stringify(result)}\n`);
  }
}

runTests().catch(console.error);
