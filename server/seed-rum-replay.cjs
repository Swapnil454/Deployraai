const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/observability',
});

const PROJECT_ID = '6aa6c88d397c2ec071a05583';

// rrweb event types
const EventType = { DomContentLoaded: 0, Load: 1, FullSnapshot: 2, IncrementalSnapshot: 3, Meta: 4, Custom: 5 };
const IncrementalSource = { Mutation: 0, MouseMove: 1, MouseInteraction: 2, Scroll: 3, ViewportResize: 4, Input: 5 };

function buildFullSnapshot(baseTs) {
  return {
    type: EventType.FullSnapshot,
    data: {
      node: {
        type: 0, // Document
        childNodes: [
          { type: 1, name: 'html', childNodes: [] }, // DocumentType
          {
            type: 2, tagName: 'html', attributes: { lang: 'en' }, id: 1,
            childNodes: [
              {
                type: 2, tagName: 'head', attributes: {}, id: 2,
                childNodes: [
                  { type: 2, tagName: 'title', attributes: {}, id: 3, childNodes: [{ type: 3, textContent: 'Dashboard — TracePilot', id: 4 }] },
                  { type: 2, tagName: 'meta', attributes: { charset: 'utf-8' }, id: 5, childNodes: [] },
                ]
              },
              {
                type: 2, tagName: 'body', attributes: { style: 'background:#050505;margin:0;font-family:Inter,sans-serif' }, id: 6,
                childNodes: [
                  {
                    type: 2, tagName: 'div', attributes: { id: 'root', style: 'display:flex;min-height:100vh' }, id: 7,
                    childNodes: [
                      {
                        type: 2, tagName: 'aside', attributes: { style: 'width:200px;background:#0a0a0a;border-right:1px solid #27272a;padding:24px 16px;display:flex;flex-direction:column;gap:8px' }, id: 8,
                        childNodes: [
                          { type: 2, tagName: 'div', attributes: { style: 'color:#fff;font-size:15px;font-weight:600;margin-bottom:16px;padding:0 8px' }, id: 9, childNodes: [{ type: 3, textContent: '⚡ TracePilot', id: 10 }] },
                          ...[['Deployments','#3b82f6'], ['Logs','#a1a1aa'], ['Alerts','#a1a1aa'], ['RUM & Vitals','#fff']].map(([label, color], i) => ({
                            type: 2, tagName: 'div', attributes: { style: `padding:8px;border-radius:6px;color:${color};font-size:13px;cursor:pointer;background:${label === 'RUM & Vitals' ? '#1a1a1a' : 'transparent'}` }, id: 20 + i, childNodes: [{ type: 3, textContent: label, id: 30 + i }]
                          }))
                        ]
                      },
                      {
                        type: 2, tagName: 'main', attributes: { style: 'flex:1;padding:32px;overflow:auto' }, id: 40,
                        childNodes: [
                          {
                            type: 2, tagName: 'h1', attributes: { style: 'color:#fff;font-size:22px;font-weight:600;margin:0 0 24px' }, id: 41,
                            childNodes: [{ type: 3, textContent: 'Real User Monitoring', id: 42 }]
                          },
                          {
                            type: 2, tagName: 'div', attributes: { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:32px' }, id: 43,
                            childNodes: [
                              ...['LCP · 2619ms', 'INP · 289ms', 'CLS · 0.201', 'FCP · 1342ms', 'TTFB · 843ms'].map((label, i) => ({
                                type: 2, tagName: 'div', attributes: { style: 'background:#0a0a0a;border:1px solid #27272a;border-radius:12px;padding:16px' }, id: 50 + i,
                                childNodes: [
                                  { type: 2, tagName: 'div', attributes: { style: 'color:#a1a1aa;font-size:12px;margin-bottom:8px' }, id: 60 + i, childNodes: [{ type: 3, textContent: ['LCP','INP','CLS','FCP','TTFB'][i], id: 70 + i }] },
                                  { type: 2, tagName: 'div', attributes: { style: `color:${i < 2 ? '#f59e0b' : '#34d399'};font-size:24px;font-weight:600` }, id: 80 + i, childNodes: [{ type: 3, textContent: label.split('· ')[1], id: 90 + i }] }
                                ]
                              }))
                            ]
                          },
                          {
                            type: 2, tagName: 'div', attributes: { style: 'background:#0a0a0a;border:1px solid #27272a;border-radius:12px;padding:20px' }, id: 100,
                            childNodes: [
                              { type: 2, tagName: 'h2', attributes: { style: 'color:#fff;font-size:16px;margin:0 0 16px' }, id: 101, childNodes: [{ type: 3, textContent: 'Recent User Sessions', id: 102 }] },
                              {
                                type: 2, tagName: 'div', attributes: { style: 'display:flex;flex-direction:column;gap:1px' }, id: 103,
                                childNodes: [
                                  ...Array.from({ length: 5 }).map((_, i) => ({
                                    type: 2, tagName: 'div', attributes: { style: 'display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid #18181b' }, id: 110 + i,
                                    childNodes: [
                                      { type: 2, tagName: 'span', attributes: { style: 'font-family:monospace;color:#a1a1aa;font-size:13px' }, id: 120 + i, childNodes: [{ type: 3, textContent: `session-${crypto.randomBytes(4).toString('hex')}`, id: 130 + i }] },
                                      { type: 2, tagName: 'button', attributes: { style: 'background:#1e1e3a;color:#818cf8;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer' }, id: 140 + i, childNodes: [{ type: 3, textContent: 'Play', id: 150 + i }] }
                                    ]
                                  }))
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      initialOffset: { top: 0, left: 0 }
    },
    timestamp: baseTs
  };
}

async function seed() {
  console.log('Seeding rich rrweb session replay data...');
  const sessionId = crypto.randomUUID();
  const baseTs = Date.now() - 5 * 60 * 1000; // 5 minutes ago

  // Build a realistic sequence of rrweb events
  const events = [
    // 1. Meta event (page info)
    { type: EventType.Meta, data: { href: 'http://localhost:3000/dashboard/observability/rum/demo', width: 1440, height: 900 }, timestamp: baseTs },
    // 2. DOM load
    { type: EventType.DomContentLoaded, data: {}, timestamp: baseTs + 50 },
    // 3. Full Snapshot — the entire DOM
    buildFullSnapshot(baseTs + 100),
    // 4. Page fully loaded
    { type: EventType.Load, data: {}, timestamp: baseTs + 350 },
    // 5. Mouse moves across the page
    ...Array.from({ length: 20 }, (_, i) => ({
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.MouseMove,
        positions: [{ x: 200 + i * 40, y: 300 + Math.sin(i) * 50, id: 7, timeOffset: i * 100 }]
      },
      timestamp: baseTs + 500 + i * 150
    })),
    // 6. Scroll down in the main area
    {
      type: EventType.IncrementalSnapshot,
      data: { source: IncrementalSource.Scroll, id: 40, x: 0, y: 200 },
      timestamp: baseTs + 3500
    },
    // 7. Click on a session row (the "Play" button)
    {
      type: EventType.IncrementalSnapshot,
      data: { source: IncrementalSource.MouseInteraction, type: 1, id: 140, x: 780, y: 620 },
      timestamp: baseTs + 4000
    },
    // 8. DOM mutation: highlight the selected session row
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        adds: [],
        removes: [],
        texts: [],
        attributes: [{ id: 110, attributes: { style: 'display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid #18181b;background:#1a1a2e' } }]
      },
      timestamp: baseTs + 4050
    },
    // 9. More mouse movement
    ...Array.from({ length: 15 }, (_, i) => ({
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.MouseMove,
        positions: [{ x: 780 + i * 5, y: 620 - i * 3, id: 40, timeOffset: i * 80 }]
      },
      timestamp: baseTs + 4500 + i * 200
    })),
    // 10. Scroll back to top
    {
      type: EventType.IncrementalSnapshot,
      data: { source: IncrementalSource.Scroll, id: 40, x: 0, y: 0 },
      timestamp: baseTs + 7500
    },
    // 11. Click on Alerts nav item
    {
      type: EventType.IncrementalSnapshot,
      data: { source: IncrementalSource.MouseInteraction, type: 1, id: 22, x: 108, y: 165 },
      timestamp: baseTs + 8000
    },
    // 12. Nav item highlight mutation
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        adds: [], removes: [], texts: [],
        attributes: [
          { id: 25, attributes: { style: 'padding:8px;border-radius:6px;color:#fff;font-size:13px;cursor:pointer;background:#1a1a1a' } },
          { id: 23, attributes: { style: 'padding:8px;border-radius:6px;color:#a1a1aa;font-size:13px;cursor:pointer;background:transparent' } }
        ]
      },
      timestamp: baseTs + 8050
    },
    // 13. Viewport resize (user resized window)
    {
      type: EventType.IncrementalSnapshot,
      data: { source: IncrementalSource.ViewportResize, width: 1280, height: 800 },
      timestamp: baseTs + 10000
    },
  ];

  console.log(`Built ${events.length} rrweb events for session: ${sessionId}`);

  // Insert as a single batch (sequence_num = 0)
  try {
    const res = await db.query(`
      INSERT INTO rum_events (project_id, session_id, sequence_num, events, event_count, url, user_agent, duration_ms, error_count, created_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::timestamptz)
      RETURNING id
    `, [
      PROJECT_ID,
      sessionId,
      0,
      JSON.stringify(events),
      events.length,
      'http://localhost:3000/dashboard/observability/rum/demo',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
      10500,
      0,
      new Date(baseTs).toISOString()
    ]);
    console.log(`✅ Session inserted with id=${res.rows[0].id}`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`\nGo to the RUM page and click "Play Session" on the top session to see the replay!`);
  } catch (err) {
    console.error('Failed to insert session:', err.message);
  } finally {
    await db.end();
  }
}

seed();
