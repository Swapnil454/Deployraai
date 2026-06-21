import WorkflowRun from "../models/WorkflowRun.js";

const workflows = {};

class SleepInterrupt extends Error {
  constructor(resumeAt, stepName) {
    super("SLEEP_INTERRUPT");
    this.name = "SleepInterrupt";
    this.resumeAt = resumeAt;
    this.stepName = stepName;
  }
}

export const defineWorkflow = (name, version, handler) => {
  if (!workflows[name]) workflows[name] = {};
  workflows[name][version] = handler;
  console.log(`[Workflow] Registered: ${name} v${version}`);
};

const parseDuration = (str) => {
  if (typeof str === 'number') return str;
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60000;
  if (unit === 'h') return val * 3600000;
  if (unit === 'd') return val * 86400000;
  return 0;
};

export const triggerWorkflow = async (projectId, name, payload, existingRunId = null) => {
  if (!workflows[name]) throw new Error(`Workflow ${name} not found`);

  let run;
  if (existingRunId) {
    run = await WorkflowRun.findById(existingRunId);
    if (!run) throw new Error("Run not found");
    
    // Resume uses the exact version the run started with
    const handler = workflows[name][run.workflowVersion];
    if (!handler) throw new Error(`Workflow ${name} v${run.workflowVersion} handler not found`);
  } else {
    // New run uses the highest registered version
    const versions = Object.keys(workflows[name]).map(Number).sort((a, b) => b - a);
    const latestVersion = versions[0];
    
    run = await WorkflowRun.create({
      projectId,
      workflowName: name,
      workflowVersion: latestVersion,
      payload,
    });
  }

  const handler = workflows[run.workflowName][run.workflowVersion];

  // Ensure ledger exists
  if (!run.ledger) {
    run.ledger = {};
  }

  const step = {
    run: async (stepName, fn, options = {}) => {
      const { maxAttempts = 1, backoff = '30s', timeout, cache = true } = options;
      
      const stepState = run.ledger[stepName] || { attempts: 0 };
      
      // Deterministic replay: if already completed and cache is enabled, return cached result
      if (cache !== false && stepState.status === 'completed') {
        return stepState.result;
      }

      console.log(`[Workflow:${run._id}] Executing step: ${stepName} (Attempt ${stepState.attempts + 1}/${maxAttempts})`);
      try {
        const executeFn = async () => {
          if (!timeout) return await fn();
          
          const timeoutMs = parseDuration(timeout);
          let timeoutHandle;
          const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
              const err = new Error(`Step execution timed out after ${timeout}`);
              err.code = 'ETIMEOUT';
              reject(err);
            }, timeoutMs);
          });
          
          try {
            return await Promise.race([fn(), timeoutPromise]);
          } finally {
            clearTimeout(timeoutHandle);
          }
        };

        const result = await executeFn();
        run.ledger[stepName] = { 
          status: 'completed', 
          result, 
          attempts: stepState.attempts + 1,
          executedAt: new Date(),
          label: options.label || stepName
        };
        
        await WorkflowRun.updateOne(
          { _id: run._id }, 
          { 
            $set: { [`ledger.${stepName}`]: run.ledger[stepName] },
            $push: { events: { stepName, ...run.ledger[stepName] } }
          }
        );
        return result;
      } catch (err) {
        console.error(`[Workflow:${run._id}] Step ${stepName} failed:`, err);
        
        const attempts = stepState.attempts + 1;
        
        if (attempts < maxAttempts) {
          // Durable Retry: Sleep with backoff!
          const ms = parseDuration(backoff);
          const resumeAt = new Date(Date.now() + ms);
          
          run.ledger[stepName] = { 
            status: 'failed_retrying', 
            attempts,
            maxAttempts,
            nextRetryAt: resumeAt,
            lastError: { message: err.message || err.toString(), code: err.code || 'UNKNOWN' },
            executedAt: new Date(),
            label: options.label || stepName
          };
          await WorkflowRun.updateOne(
            { _id: run._id }, 
            { 
              $set: { [`ledger.${stepName}`]: run.ledger[stepName] },
              $push: { events: { stepName, ...run.ledger[stepName] } }
            }
          );
          
          console.log(`[Workflow:${run._id}] Step ${stepName} retrying at ${resumeAt.toISOString()} (Attempt ${attempts})`);
          throw new SleepInterrupt(resumeAt, stepName);
        } else {
          // Exhausted maxAttempts
          run.ledger[stepName] = { 
            status: 'failed', 
            attempts,
            maxAttempts,
            lastError: { message: err.message || err.toString(), code: err.code || 'UNKNOWN' },
            executedAt: new Date(),
            label: options.label || stepName
          };
          await WorkflowRun.updateOne(
            { _id: run._id }, 
            { 
              $set: { [`ledger.${stepName}`]: run.ledger[stepName] },
              $push: { events: { stepName, ...run.ledger[stepName] } }
            }
          );
          throw err; // Stop execution, will be caught by outer try-catch
        }
      }
    }
  };

  const sleep = async (stepName, durationStr) => {
    const stepState = run.ledger[stepName];
    // Deterministic replay: skip if already slept
    if (stepState && stepState.status === 'completed') {
      return;
    }

    if (stepState && stepState.status === 'sleeping') {
      if (Date.now() >= new Date(stepState.resumeAt).getTime()) {
        // Sleep duration has passed, wake up and mark completed!
        run.ledger[stepName] = { status: 'completed', executedAt: new Date() };
        await WorkflowRun.updateOne(
          { _id: run._id },
          { 
            $set: { [`ledger.${stepName}`]: run.ledger[stepName] },
            $push: { events: { stepName, ...run.ledger[stepName] } }
          }
        );
        return;
      } else {
        // Still sleeping (e.g. if the cron triggered early somehow)
        throw new SleepInterrupt(stepState.resumeAt, stepName);
      }
    }

    // First time hitting this sleep step
    const ms = parseDuration(durationStr);
    const resumeAt = new Date(Date.now() + ms);
    
    run.ledger[stepName] = { status: 'sleeping', resumeAt, executedAt: new Date() };
    await WorkflowRun.updateOne(
      { _id: run._id },
      { 
        $set: { 
          [`ledger.${stepName}`]: run.ledger[stepName],
          status: 'sleeping',
          resumeAt
        },
        $push: { events: { stepName, ...run.ledger[stepName] } }
      }
    );
    console.log(`[Workflow:${run._id}] Sleeping at ${stepName} until ${resumeAt.toISOString()}`);
    throw new SleepInterrupt(resumeAt, stepName);
  };

  try {
    console.log(`[Workflow:${run._id}] Starting/Resuming...`);
    await handler({ payload: run.payload, step, sleep });
    
    run.status = 'completed';
    run.lockedAt = null; // Clear atomic lock
    console.log(`[Workflow:${run._id}] Completed successfully!`);
    await run.save();
  } catch (err) {
    run.lockedAt = null; // Always clear atomic lock on pause or failure
    
    if (err instanceof SleepInterrupt) {
      run.status = 'sleeping';
      run.resumeAt = err.resumeAt;
      await run.save();
    } else {
      run.status = 'failed';
      run.error = err.message || err.toString();
      
      // Find the step that failed from the ledger
      const failedStepName = Object.keys(run.ledger).find(k => run.ledger[k].status === 'failed');
      if (failedStepName) {
        run.failedStep = failedStepName;
        run.errorMessage = run.ledger[failedStepName].lastError?.message || run.error;
        run.lastErrorCode = run.ledger[failedStepName].lastError?.code;
      }
      
      console.log(`[Workflow:${run._id}] Failed: ${run.error}`);
      await run.save();
    }
  }

  return run;
};
