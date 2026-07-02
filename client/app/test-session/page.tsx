'use client';

import { useEffect, useRef, useState } from 'react';

const PROJECT_ID = "6a2c3b57d3a51ae19d6450da";
const WRITE_KEY = "trc_rum_681f7258c62ef56fa9154a263a4811fe";
const INGESTOR_URL = "http://localhost:4317/v1/rum";

export default function TestSessionPage() {
  const [status, setStatus] = useState("⏳ Loading rrweb...");
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const eventsRef = useRef<any[]>([]);
  const sessionId = useRef("sess_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36));

  useEffect(() => {
    let stopRecording: (() => void) | undefined;

    // Dynamic import ensures rrweb only loads in browser (no SSR)
    import('rrweb').then(({ record }) => {
      setStatus("🔴 Recording — move your mouse around!");

      stopRecording = record({
        emit(event: any) {
          eventsRef.current.push(event);
          setEventCount(c => c + 1);
        },
        sampling: {
          mousemove: 50,
          scroll: 150,
        }
      });
    }).catch(err => {
      setError("Failed to load rrweb: " + err.message);
    });

    const interval = setInterval(async () => {
      if (eventsRef.current.length === 0) return;

      const batch = [...eventsRef.current];
      eventsRef.current = [];

      try {
        const res = await fetch(INGESTOR_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rum-key": WRITE_KEY,
          },
          body: JSON.stringify({
            projectId: PROJECT_ID,
            sessionId: sessionId.current,
            events: batch,
          }),
        });

        if (res.ok) {
          setBatches(b => b + 1);
          setStatus(`✅ Batch sent at ${new Date().toLocaleTimeString()}`);
          setError(null);
        } else {
          const body = await res.json().catch(() => ({}));
          setError(`❌ Ingestor HTTP ${res.status}: ${JSON.stringify(body)}`);
        }
      } catch (err: any) {
        setError(`❌ Network error: ${err.message}`);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      stopRecording?.();
    };
  }, []);

  return (
    <div style={{ 
      fontFamily: 'system-ui', textAlign: 'center', padding: '60px 20px', 
      background: '#000', color: '#fff', minHeight: '100vh' 
    }}>
      <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Session Replay Test Area</h1>
      <p style={{ color: '#9ca3af', marginBottom: '32px' }}>
        Move your mouse, click the buttons, and interact with the page.
      </p>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '32px' }}>
        <button 
          onClick={() => document.body.style.background = '#1a1a2e'}
          style={{ padding: '10px 24px', fontSize: '15px', cursor: 'pointer', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '8px' }}
        >
          Darken Background
        </button>
        <button 
          onClick={() => document.body.style.background = '#000'}
          style={{ padding: '10px 24px', fontSize: '15px', cursor: 'pointer', background: '#6b7280', border: 'none', color: '#fff', borderRadius: '8px' }}
        >
          Reset Background
        </button>
      </div>

      <div style={{
        width: '100px', height: '100px', background: '#eab308',
        margin: '0 auto 32px', transform: 'rotate(45deg)',
        transition: 'all 0.3s', cursor: 'pointer',
      }}
        onMouseEnter={e => { (e.target as HTMLDivElement).style.transform = 'rotate(45deg) scale(1.3)'; (e.target as HTMLDivElement).style.background = '#f59e0b'; }}
        onMouseLeave={e => { (e.target as HTMLDivElement).style.transform = 'rotate(45deg)'; (e.target as HTMLDivElement).style.background = '#eab308'; }}
      />

      <div style={{ marginTop: '24px', padding: '20px', background: '#111', borderRadius: '12px', maxWidth: '500px', margin: '0 auto' }}>
        <p style={{ fontWeight: 'bold', color: '#10b981', fontSize: '16px', margin: '0 0 8px' }}>{status}</p>
        {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '8px 0' }}>{error}</p>}
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0' }}>Session: <code style={{ color: '#a78bfa' }}>{sessionId.current}</code></p>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0' }}>Events captured: <strong style={{ color: '#fff' }}>{eventCount}</strong></p>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0' }}>Batches sent: <strong style={{ color: '#fff' }}>{batches}</strong></p>
      </div>

      <div style={{ marginTop: '24px' }}>
        <p style={{ color: '#6b7280', fontSize: '13px' }}>
          After batches sent &gt; 0, refresh the{' '}
          <a href="/dashboard/observability/sessions/6a2c3b57d3a51ae19d6450da" style={{ color: '#6366f1' }}>
            Sessions Dashboard →
          </a>
        </p>
      </div>
    </div>
  );
}
