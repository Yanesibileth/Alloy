/**
 * ParentDashboard — reusable React component.
 *
 * Connects to the Scout backend at the same origin by default.
 * Receives real-time updates via WebSocket.
 *
 * Props: none
 * Dependencies: react, react-dom
 */

import React, { useState, useEffect, useRef } from 'react';

const STATE_COLOR = {
  following:  '#38bdf8',
  mining:     '#f59e0b',
  protecting: '#ef4444',
  idle:       '#64748b',
};

const LOG_COLOR = {
  action:    '#f59e0b',
  companion: '#38bdf8',
  chat:      '#a78bfa',
  system:    '#64748b',
  error:     '#ef4444',
};

function Bar({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ background: '#0f172a', borderRadius: 4, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  );
}

export default function ParentDashboard() {
  const [status, setStatus] = useState(null);
  const [logs, setLogs]     = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tab, setTab]       = useState('live');
  const logRef              = useRef(null);
  const ws                  = useRef(null);

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
    fetch('/api/logs').then(r => r.json()).then(d => {
      setLogs(d.logs ?? []);
      setAlerts(d.safetyAlerts ?? []);
    }).catch(() => {});

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws.current = new WebSocket(`${proto}//${location.host}`);
    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'status')       setStatus(msg.status);
      else if (msg.type === 'log')     setLogs(prev => [...prev.slice(-499), msg.entry]);
      else if (msg.type === 'safety_alert') setAlerts(prev => [msg.alert, ...prev.slice(0, 19)]);
    };
    return () => ws.current?.close();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const chatLogs   = logs.filter(l => l.type === 'chat' || l.type === 'companion');
  const actionLogs = logs.filter(l => l.type === 'action');
  const task  = status?.task ?? 'connecting...';
  const state = task.startsWith('following') || task.startsWith('with') ? 'following'
              : task.startsWith('mining')     ? 'mining'
              : task.startsWith('protecting') ? 'protecting'
              : 'idle';

  const sx = { fontFamily: 'system-ui, sans-serif', background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' };

  return (
    <div style={sx}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#38bdf8' }}>Scout — Parent Dashboard</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>Alex is actively playing Minecraft with your child</p>
        </div>

        {/* Status card */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${STATE_COLOR[state]}33` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: status?.connected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>{status?.connected ? 'Alex is online' : 'Connecting...'}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{status?.aiEnabled ? '· Claude AI' : '· Fallback mode'}</span>
              </div>
              <div style={{ fontSize: 14, color: STATE_COLOR[state], fontWeight: 600 }}>{task}</div>
              {status?.position && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  x {status.position.x} / y {status.position.y} / z {status.position.z}
                </div>
              )}
            </div>
            {status?.connected && (
              <div style={{ minWidth: 180 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                    <span>Health</span><span>{Math.round(status.health ?? 0)} / 20</span>
                  </div>
                  <Bar value={status.health ?? 0} max={20} color="#ef4444" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                    <span>Food</span><span>{Math.round(status.food ?? 0)} / 20</span>
                  </div>
                  <Bar value={status.food ?? 0} max={20} color="#f59e0b" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Mined',     value: actionLogs.filter(l => l.message.startsWith('Mined')).length,       color: '#f59e0b' },
            { label: 'Chats',     value: chatLogs.filter(l => l.type === 'companion').length,                  color: '#38bdf8' },
            { label: 'Protected', value: logs.filter(l => l.type === 'action' && l.message.startsWith('Protecting')).length, color: '#ef4444' },
            { label: 'Alerts',    value: alerts.length, color: alerts.length > 0 ? '#f59e0b' : '#475569' },
          ].map(s => (
            <div key={s.label} style={{ background: '#1e293b', borderRadius: 10, padding: '14px 16px', border: `1px solid ${s.color}22` }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'live',   label: 'Live Feed' },
            { id: 'chat',   label: 'Chat Log' },
            { id: 'safety', label: `Safety${alerts.length ? ` (${alerts.length})` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 14, cursor: 'pointer',
              background: tab === t.id ? '#38bdf8' : '#1e293b',
              color:      tab === t.id ? '#0f172a'  : '#94a3b8',
              fontWeight: tab === t.id ? 700 : 400,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'live' && (
          <div ref={logRef} style={{ background: '#1e293b', borderRadius: 12, padding: 16, height: 420, overflowY: 'auto' }}>
            {logs.length === 0 && <p style={{ color: '#475569', fontSize: 14 }}>Waiting for activity...</p>}
            {logs.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid #0f172a', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: '#334155', minWidth: 68, flexShrink: 0 }}>{new Date(entry.time).toLocaleTimeString()}</span>
                <span style={{ fontSize: 11, fontWeight: 700, minWidth: 72, flexShrink: 0, color: LOG_COLOR[entry.type] ?? '#94a3b8', textTransform: 'uppercase' }}>{entry.type}</span>
                <span style={{ fontSize: 13, color: entry.type === 'companion' ? '#38bdf8' : '#cbd5e1' }}>
                  {entry.username && entry.type !== 'companion' ? `<${entry.username}> ` : ''}{entry.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'chat' && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 16, height: 420, overflowY: 'auto' }}>
            {chatLogs.length === 0 && <p style={{ color: '#475569', fontSize: 14 }}>No chat yet.</p>}
            {[...chatLogs].reverse().map((entry, i) => (
              <div key={i} style={{ marginBottom: 12, padding: '10px 12px', background: '#0f172a', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#334155', marginBottom: 4 }}>{entry.username} · {new Date(entry.time).toLocaleTimeString()}</div>
                <div style={{ fontSize: 14, color: entry.type === 'companion' ? '#38bdf8' : '#e2e8f0' }}>
                  {entry.type === 'companion' ? 'Alex: ' : ''}{entry.message}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'safety' && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 16, height: 420, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 80, color: '#22c55e' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>All clear</div>
                <div>No concerns detected.</div>
              </div>
            ) : alerts.map((a, i) => (
              <div key={i} style={{ background: '#1c1107', border: '1px solid #f59e0b44', borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: '#f59e0b' }}>{a.username}</span>
                  <span style={{ fontSize: 11, color: '#475569' }}>{new Date(a.time).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 14, color: '#e2e8f0', marginBottom: 8 }}>"{a.message}"</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {a.concerns.map(c => (
                    <span key={c} style={{ background: '#f59e0b22', color: '#f59e0b', borderRadius: 4, padding: '2px 10px', fontSize: 12 }}>{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
