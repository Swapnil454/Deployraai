import { parentPort, workerData, isMainThread } from "worker_threads";
import jmespath from "jmespath";

function resolveDotPath(obj, path) {
  if (!path) return obj;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const arrayMatch = part.match(/^([^\[]*)(?:\[(\d+)\])?$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = arrayMatch[2];
      if (key) {
        current = current[key];
      }
      if (index !== undefined && current !== null && current !== undefined) {
        current = current[parseInt(index, 10)];
      }
    } else {
      current = current[part];
    }
  }
  return current;
}

function tryParse(val) {
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === "null") return null;
  const num = Number(val);
  if (!isNaN(num) && String(val).trim() !== "") return num;
  try { return JSON.parse(val); } catch { return val; }
}

export function runAssertions(jsonData, assertions, logic = "all_must_pass") {
  const results = [];
  
  if (!Array.isArray(assertions) || assertions.length === 0) {
    return { success: true, details: "No assertions configured.", cause: null, results: [] };
  }

  for (const assertion of assertions) {
    const { path, operator, expected, path_mode } = assertion;
    let actualValue;

    try {
      if (path_mode === "jmespath") {
        actualValue = jmespath.search(jsonData, path || "@");
      } else {
        actualValue = resolveDotPath(jsonData, path);
      }
    } catch (e) {
      // If JMESPath syntax is invalid or resolution fails, treat as path not found
      actualValue = undefined;
    }

    let passed = false;
    try {
      switch (operator) {
        case "equals":
          passed = String(actualValue) === String(expected) || JSON.stringify(actualValue) === expected || actualValue === tryParse(expected);
          break;
        case "not_equals":
          passed = String(actualValue) !== String(expected) && JSON.stringify(actualValue) !== expected && actualValue !== tryParse(expected);
          break;
        case "exists":
          passed = actualValue !== undefined && actualValue !== null;
          break;
        case "not_exists":
          passed = actualValue === undefined || actualValue === null;
          break;
        case "contains":
          if (Array.isArray(actualValue) || typeof actualValue === "string") {
            passed = actualValue.includes(tryParse(expected)) || String(actualValue).includes(expected);
          } else {
            passed = false;
          }
          break;
        case "greater_than":
          passed = Number(actualValue) > Number(expected);
          break;
        case "less_than":
          passed = Number(actualValue) < Number(expected);
          break;
        case "type_is":
          if (expected === "array") passed = Array.isArray(actualValue);
          else if (expected === "null") passed = actualValue === null;
          else passed = typeof actualValue === expected;
          break;
        case "matches_regex":
          if (typeof actualValue === "string") {
            // ReDoS protection is handled by worker termination timeout in parent process!
            passed = new RegExp(expected).test(actualValue);
          } else {
            passed = false;
          }
          break;
        default:
          passed = false;
      }
    } catch (e) {
      passed = false;
    }
    
    results.push({ assertion, passed, actual: actualValue });
  }

  const allPass = results.every(r => r.passed);
  const anyPass = results.some(r => r.passed);
  const success = logic === "any_must_pass" ? anyPass : allPass;

  const failed = results.filter(r => !r.passed);
  let details = "";
  if (failed.length > 0) {
    details = `${failed.length} of ${results.length} assertions failed:\n\n` + failed.map(r => {
      let actualStr = r.actual === undefined ? "undefined" : typeof r.actual === "object" ? JSON.stringify(r.actual) : String(r.actual);
      if (actualStr.length > 100) actualStr = actualStr.substring(0, 100) + "...";
      return `${r.assertion.path} — expected ${r.assertion.operator} ${r.assertion.expected || ''}, got ${actualStr}`;
    }).join("\n");
  }

  return { success, details, cause: success ? null : "assertion_failed", results };
}

if (!isMainThread) {
  parentPort.postMessage(runAssertions(workerData.jsonData, workerData.assertions, workerData.logic));
}
