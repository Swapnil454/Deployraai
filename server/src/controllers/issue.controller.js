import { pool } from '../config/postgres.js';

export const getIssues = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, severity, search, sort = 'last_seen_at' } = req.query;
    
    // Explicit columns — exclude heavy stacktrace blobs not needed in list view
    let query = `
      SELECT id, project_id, fingerprint, title, message, exception_type, severity, status,
             event_count, affected_users, first_seen_at, last_seen_at, resolved_at, ignored_at,
             status_changed_at, assignee_id, updated_at
      FROM issues WHERE project_id = $1`;
    const params = [projectId];


    let paramIdx = 2;

    if (status) {
      query += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (severity) {
      query += ` AND severity = $${paramIdx++}`;
      params.push(severity);
    }
    if (search) {
      query += ` AND (title ILIKE $${paramIdx} OR message ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (sort === 'event_count') {
      query += ` ORDER BY event_count DESC`;
    } else if (sort === 'affected_users') {
      query += ` ORDER BY affected_users DESC`;
    } else {
      query += ` ORDER BY last_seen_at DESC`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
};

export const getIssue = async (req, res) => {
  try {
    const { projectId, issueId } = req.params;
    const result = await pool.query(`SELECT * FROM issues WHERE project_id = $1 AND id = $2`, [projectId, issueId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Issue not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
};

export const updateIssueStatus = async (req, res) => {
  try {
    const { projectId, issueId } = req.params;
    const { status } = req.body;
    
    if (!['open', 'resolved', 'ignored', 'regressed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let query = `UPDATE issues SET status = $1, status_changed_at = NOW()`;
    if (status === 'resolved') {
      query += `, resolved_at = NOW()`;
    } else if (status === 'ignored') {
      query += `, ignored_at = NOW()`;
    } else if (status === 'regressed' || status === 'open') {
      query += `, resolved_at = NULL`;
    }

    query += ` WHERE project_id = $2 AND id = $3 RETURNING *`;
    
    const result = await pool.query(query, [status, projectId, issueId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Issue not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update issue status' });
  }
};

export const updateIssueAssignee = async (req, res) => {
  try {
    const { projectId, issueId } = req.params;
    const { assignee_id } = req.body;
    
    const result = await pool.query(
      `UPDATE issues SET assignee_id = $1, updated_at = NOW() WHERE project_id = $2 AND id = $3 RETURNING *`, 
      [assignee_id || null, projectId, issueId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Issue not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign issue' });
  }
};

export const getIssueEvents = async (req, res) => {
  try {
    const { projectId, issueId } = req.params;
    const result = await pool.query(
      `SELECT * FROM issue_events WHERE project_id = $1 AND issue_id = $2 ORDER BY occurred_at DESC LIMIT 50`, 
      [projectId, issueId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issue events' });
  }
};

export const getIssueComments = async (req, res) => {
  try {
    const { issueId } = req.params;
    const result = await pool.query(
      `SELECT * FROM issue_comments WHERE issue_id = $1 ORDER BY created_at ASC`, 
      [issueId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
};

export const createIssueComment = async (req, res) => {
  try {
    const { issueId } = req.params;
    const { body } = req.body;
    const userId = req.user?.userId || null;
    
    if (!body) return res.status(400).json({ error: 'Comment body required' });

    const result = await pool.query(
      `INSERT INTO issue_comments (issue_id, user_id, body) VALUES ($1, $2, $3) RETURNING *`, 
      [issueId, userId, body]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

export const ignoreIssue = async (req, res) => {
  try {
    const { projectId, issueId } = req.params;
    const result = await pool.query(
      `UPDATE issues SET status = 'ignored', ignored_at = NOW(), updated_at = NOW() WHERE project_id = $1 AND id = $2 RETURNING *`,
      [projectId, issueId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Issue not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to ignore issue' });
  }
};

export const resolveIssue = async (req, res) => {
  try {
    const { projectId, issueId } = req.params;
    const result = await pool.query(
      `UPDATE issues SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE project_id = $1 AND id = $2 RETURNING *`,
      [projectId, issueId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Issue not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve issue' });
  }
};

import { generateIssueDiagnosis } from '../services/ai.service.js';

export const diagnoseIssue = async (req, res) => {
  const client = await pool.connect();
  try {
    const { projectId, issueId } = req.params;

    // 1. Check if already diagnosed
    const existingRes = await client.query(`SELECT * FROM issue_analysis WHERE issue_id = $1`, [issueId]);
    if (existingRes.rows.length > 0) {
      return res.json(existingRes.rows[0]);
    }

    // 2. Fetch issue details
    const issueRes = await client.query(`SELECT * FROM issues WHERE id = $1 AND project_id = $2`, [issueId, projectId]);
    if (issueRes.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    const issue = issueRes.rows[0];

    // 3. Fetch the most recent event to get the stack trace and context
    const eventRes = await client.query(`
      SELECT stacktrace as stack_trace, message, null as error_type, null as http_url, null as http_method 
      FROM issue_events 
      WHERE issue_id = $1 
      ORDER BY occurred_at DESC 
      LIMIT 1
    `, [issueId]);
    
    const latestEvent = eventRes.rows[0];
    if (!latestEvent || !latestEvent.stack_trace) {
      return res.status(400).json({ error: 'Not enough context (missing stack trace) to generate an AI diagnosis.' });
    }

    // 4. Call AI Service
    const aiResult = await generateIssueDiagnosis(issue, latestEvent);

    // 5. Save the analysis
    const insertRes = await client.query(`
      INSERT INTO issue_analysis (issue_id, analysis_text, suggested_fix)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [issueId, aiResult.analysis_text, aiResult.suggested_fix]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error("AI Diagnosis Error:", err);
    res.status(500).json({ error: err.message || 'Failed to generate AI diagnosis' });
  } finally {
    client.release();
  }
};

export const getIssueDiagnosis = async (req, res) => {
  try {
    const { issueId } = req.params;
    const result = await pool.query(`SELECT * FROM issue_analysis WHERE issue_id = $1`, [issueId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No diagnosis found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch diagnosis' });
  }
};
