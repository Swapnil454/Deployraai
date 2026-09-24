import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";
import { runAssertions } from "./apiCheckerWorker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function evaluateApiAssertions(jsonData, assertions, logic = "all_must_pass") {
  return new Promise((resolve) => {
    if (!Array.isArray(assertions) || assertions.length === 0) {
      return resolve({ success: true, details: "No assertions configured.", cause: null, results: [] });
    }

    // Determine if we actually need a worker thread (ReDoS/hang risk)
    const needsWorker = assertions.some(a => 
      a.operator === "matches_regex" || a.path_mode === "jmespath"
    );

    if (!needsWorker) {
      // Fast path: Synchronously evaluate safe assertions inline
      return resolve(runAssertions(jsonData, assertions, logic));
    }

    const worker = new Worker(path.join(__dirname, "apiCheckerWorker.js"), {
      workerData: { jsonData, assertions, logic }
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({ 
        success: false, 
        cause: "assertion_timeout", 
        details: "Assertion evaluation timed out (likely due to a slow regular expression or large JMESPath query).", 
        results: [] 
      });
    }, 500); // Strict 500ms limit!

    worker.on("message", (result) => {
      clearTimeout(timeout);
      resolve(result);
    });

    worker.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        cause: "assertion_error",
        details: `Worker encountered an error: ${error.message}`,
        results: []
      });
    });

    worker.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve({
          success: false,
          cause: "assertion_worker_crashed",
          details: `Worker crashed with exit code ${code}`,
          results: []
        });
      }
    });
  });
}
