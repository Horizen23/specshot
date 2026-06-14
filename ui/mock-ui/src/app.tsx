import { useState, useEffect, useMemo } from 'preact/hooks';
import './index.css';

interface EndpointConfig {
  enabled: boolean;
  tag: string;
  operationId: string;
  method: string;
  path: string;
  statusCode: number;
  delay: number;
  mockData: string;
  errorEnabled?: boolean;
  errorStatus?: number;
  errorBody?: string;
}

interface Endpoint {
  key: string;
  method: string;
  path: string;
  summary?: string;
  tag: string;
  operationId: string;
  enabled: boolean;
  config: Partial<EndpointConfig> | null;
  mockExample?: string;
}

interface TagGroup {
  tag: string;
  count: number;
  endpoints: Endpoint[];
}

function highlightJson(json: string): string {
  if (!json) return '';
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'hl-n';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) { cls = 'hl-k'; }
      else { cls = 'hl-s'; }
    } else if (/true|false/.test(match)) { cls = 'hl-b'; }
    else if (/null/.test(match)) { cls = 'hl-p'; }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

function JsonEditor({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [isValid, setIsValid] = useState(true);
  
  useEffect(() => {
    try {
      JSON.parse(value || '{}');
      setIsValid(true);
    } catch {
      setIsValid(false);
    }
  }, [value]);

  const handleKeyDown = (e: any) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div class={`code-editor ${isValid ? 'valid' : 'invalid'}`}>
      <div class="code-body-wrap">
        <div class="code-body">
          <pre><code dangerouslySetInnerHTML={{ __html: highlightJson(value) }} /></pre>
          <textarea 
            value={value} 
            onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            spellcheck={false}
          />
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<'config' | 'test'>('config');

  const [specSource, setSpecSource] = useState('');
  const [outputDir, setOutputDir] = useState('');
  // removed proxyTarget since we proxy everything in vite
  
  const [tags, setTags] = useState<TagGroup[]>([]);
  const [totalEndpoints, setTotalEndpoints] = useState(0);
  
  const [mockServerRunning, setMockServerRunning] = useState(false);
  const [mockServerPort, setMockServerPort] = useState(3457);
  
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{msg: string, type: string} | null>(null);

  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [mockOnly, setMockOnly] = useState(false);

  // Test API State
  const [testMethod, setTestMethod] = useState('GET');
  const [testPath, setTestPath] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testResponse, setTestResponse] = useState<{status: number, statusText: string, ms: number, body: string, error?: string} | null>(null);

  useEffect(() => {
    // Initial fetch
    fetch('/api/config').then(res => res.json()).then(data => {
      if (data.specSource) setSpecSource(data.specSource);
      if (data.outputDir) setOutputDir(data.outputDir);
      if (data.specSource) {
        loadSpec(data.specSource);
      }
    }).catch(console.error);

    fetch('/api/mock-server').then(res => res.json()).then(data => {
      setMockServerRunning(data.running);
      if (data.port) setMockServerPort(data.port);
    }).catch(console.error);
    
    // Auto switch view if opened on port 3457
    if (window.location.port === '3457') {
      setView('test');
    }
  }, []);

  useEffect(() => {
    if (tags.length === 0) return;
    const timeout = setTimeout(() => {
      const endpoints: Record<string, EndpointConfig> = {};
      tags.forEach(tg => {
        tg.endpoints.forEach(ep => {
          if (ep.enabled || ep.config) {
            endpoints[ep.key] = {
              enabled: ep.enabled,
              tag: ep.tag,
              operationId: ep.operationId,
              method: ep.method,
              path: ep.path,
              statusCode: ep.config?.statusCode || 200,
              delay: ep.config?.delay || 0,
              mockData: ep.config?.mockData !== undefined ? ep.config.mockData : (ep.mockExample || ''),
            };
          }
        });
      });
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints })
      }).catch(console.error);
    }, 500);
    return () => clearTimeout(timeout);
  }, [tags]);

  const toast = (msg: string, type = 'success') => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadSpec = async (source: string) => {
    if (!source) return;
    setLoading(true);
    try {
      const res = await fetch('/api/spec?source=' + encodeURIComponent(source));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load spec');
      const formattedTags = data.tags.map((tg: TagGroup) => ({
        ...tg,
        endpoints: tg.endpoints.map((ep: Endpoint) => {
          if (ep.config?.mockData) {
            try { ep.config.mockData = JSON.stringify(JSON.parse(ep.config.mockData), null, 2); } catch(e) {}
          }
          if (ep.mockExample) {
            try { ep.mockExample = JSON.stringify(JSON.parse(ep.mockExample), null, 2); } catch(e) {}
          }
          return ep;
        })
      }));
      setTags(formattedTags);
      setTotalEndpoints(data.totalEndpoints);
      setExpandedTags(new Set([data.tags[0]?.tag]));
      toast(`Loaded ${data.totalEndpoints} endpoints`);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleMockServer = async () => {
    const action = mockServerRunning ? 'stop' : 'start';
    try {
      const res = await fetch('/api/mock-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, port: mockServerPort })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMockServerRunning(data.running);
      if (data.port) setMockServerPort(data.port);
      toast(`Mock server ${data.running ? 'started' : 'stopped'}`);
    } catch(e: any) {
      toast(e.message, 'error');
    }
  };

  const toggleTag = (tag: string) => {
    const next = new Set(expandedTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setExpandedTags(next);
  };

  const toggleEndpointExpansion = (key: string) => {
    const next = new Set(expandedEndpoints);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedEndpoints(next);
  };

  const updateEndpointConfig = (key: string, updates: Partial<Endpoint>) => {
    setTags(prev => prev.map(t => ({
      ...t,
      endpoints: t.endpoints.map(ep => ep.key === key ? { ...ep, ...updates } : ep)
    })));
  };

  const saveAndGenerate = async () => {
    const endpointConfigs: Record<string, any> = {};
    tags.forEach(t => {
      t.endpoints.forEach(ep => {
        if (ep.enabled || ep.config) {
          endpointConfigs[ep.key] = {
            enabled: ep.enabled,
            tag: ep.tag,
            operationId: ep.operationId,
            method: ep.method,
            path: ep.path,
            ...(ep.config || {})
          };
        }
      });
    });

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specSource,
          outputDir,
          endpoints: endpointConfigs
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Generated ${data.handlersGenerated} handlers`);
    } catch(e: any) {
      toast(e.message, 'error');
    }
  };

  const filteredTags = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return tags.map(t => ({
      ...t,
      endpoints: t.endpoints.filter(ep => {
        if (mockOnly && !ep.enabled) return false;
        if (!query) return true;
        return ep.path.toLowerCase().includes(query) || 
               ep.method.toLowerCase().includes(query) || 
               (ep.summary || '').toLowerCase().includes(query);
      })
    })).filter(t => t.endpoints.length > 0);
  }, [tags, searchQuery, mockOnly]);

  const enabledEndpoints = useMemo(() => {
    const list: Endpoint[] = [];
    tags.forEach(t => {
      t.endpoints.forEach(ep => {
        if (ep.enabled) list.push(ep);
      });
    });
    return list;
  }, [tags]);

  const enabledCount = enabledEndpoints.length;

  const handleTestRequest = async () => {
    setTestResponse(null);
    const start = performance.now();
    try {
      const opts: RequestInit = { method: testMethod, headers: {} };
      if (testBody && testMethod !== 'GET') {
        (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
        opts.body = testBody;
      }
      
      const baseUrl = `http://localhost:${mockServerPort}`;
      const res = await fetch(`${baseUrl}${testPath}`, opts);
      const data = await res.text();
      let parsedBody = data;
      try { parsedBody = JSON.stringify(JSON.parse(data), null, 2); } catch(e) {}
      
      setTestResponse({
        status: res.status,
        statusText: res.statusText,
        ms: Math.round(performance.now() - start),
        body: parsedBody
      });
    } catch (e: any) {
      setTestResponse({
        status: 0,
        statusText: 'Error',
        ms: Math.round(performance.now() - start),
        body: '',
        error: e.message
      });
    }
  };

  return (
    <>
      <div id="topbar" class="topbar">
        <div class="logo">⚡ SpecShot <span>Mock</span></div>

        <div class="nav-tabs" style={{ marginLeft: '24px' }}>
          <button class={`nav-tab ${view === 'config' ? 'active' : ''}`} onClick={() => setView('config')}>Configuration</button>
          <button class={`nav-tab ${view === 'test' ? 'active' : ''}`} onClick={() => setView('test')}>Test API</button>
        </div>
        
        <div class="spacer"></div>

        {view === 'config' ? (
          <>
            <input 
              type="text" 
              value={specSource}
              onChange={(e) => setSpecSource((e.target as HTMLInputElement).value)}
              placeholder="OpenAPI URL or file path" 
            />
            <button class="btn" onClick={() => loadSpec(specSource)} disabled={loading}>
              {loading ? 'Loading...' : 'Load Spec'}
            </button>
            <div style={{ width: '16px' }}></div>
            <button class={`btn mock-server-btn ${mockServerRunning ? 'running' : ''}`} onClick={toggleMockServer}>
              {mockServerRunning ? 'Stop Server' : 'Start Server'}
            </button>
            <button class="btn btn-primary" onClick={saveAndGenerate} disabled={tags.length === 0}>
              Save & Generate
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Server Port: <span style={{ color: 'var(--text)' }}>{mockServerPort}</span>
            </div>
            <div style={{ width: '16px' }}></div>
            <button class={`btn mock-server-btn ${mockServerRunning ? 'running' : ''}`} onClick={toggleMockServer}>
              {mockServerRunning ? 'Stop Server' : 'Start Server'}
            </button>
          </>
        )}
      </div>

      {view === 'config' && (
        <>
          <div class="search-bar">
            <input 
              type="text" 
              placeholder="Filter endpoints..." 
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            />
            <label class="mock-only-toggle">
              <input type="checkbox" checked={mockOnly} onChange={(e) => setMockOnly((e.target as HTMLInputElement).checked)} />
              <span>Mocked only</span>
            </label>
          </div>

          <div class="main">
            {tags.length > 0 && (
              <div class="summary-bar" style={{ display: 'flex' }}>
                <div class="summary-stat">
                  <span class="stat-value green">{enabledCount}</span>
                  <span class="stat-label">Active Mocks</span>
                </div>
                <div class="summary-stat">
                  <span class="stat-value">{totalEndpoints - enabledCount}</span>
                  <span class="stat-label">Passthrough</span>
                </div>
              </div>
            )}

            <div id="endpointList">
              {tags.length === 0 ? (
                <div class="empty-state">
                  <div class="icon">📡</div>
                  <p>Enter an OpenAPI spec source above and click <strong>Load Spec</strong></p>
                </div>
              ) : (
                filteredTags.map(t => (
                  <div class={`tag-section ${expandedTags.has(t.tag) ? 'expanded' : ''}`} key={t.tag}>
                    <div class="tag-section-header" onClick={() => toggleTag(t.tag)}>
                      <div class="chevron">▶</div>
                      <div class="tag-name">{t.tag}</div>
                      <div class="tag-count">{t.endpoints.length}</div>
                    </div>
                    <div class="tag-section-body">
                      {t.endpoints.map(ep => (
                        <div class={`ep-card ${ep.enabled ? 'mocked' : ''} ${expandedEndpoints.has(ep.key) ? 'expanded' : ''}`} key={ep.key}>
                          <div class="ep-card-header" onClick={() => toggleEndpointExpansion(ep.key)}>
                            <span class={`method-badge ${ep.method.toLowerCase()}`}>{ep.method}</span>
                            <span class="ep-path">{ep.path}</span>
                            <span class="ep-summary">{ep.summary}</span>
                            <div style={{ flex: 1 }}></div>
                            <div class="toggle" onClick={(e) => { e.stopPropagation(); updateEndpointConfig(ep.key, { enabled: !ep.enabled }); }}>
                              <input type="checkbox" checked={ep.enabled} readOnly />
                              <div class="slider"></div>
                            </div>
                            <button class="expand-btn">▼</button>
                          </div>
                          
                          {expandedEndpoints.has(ep.key) && (
                            <div class="ep-config" style={{ maxHeight: '600px', borderTopColor: 'var(--border)', padding: '16px' }}>
                               <div class="config-row">
                                 <label>Status Code</label>
                                 <input type="number" value={ep.config?.statusCode || 200} onChange={(e) => updateEndpointConfig(ep.key, { config: { ...ep.config, statusCode: parseInt((e.target as HTMLInputElement).value) } })} />
                                 <label style={{ marginLeft: '16px' }}>Delay (ms)</label>
                                 <input type="number" value={ep.config?.delay || 0} onChange={(e) => updateEndpointConfig(ep.key, { config: { ...ep.config, delay: parseInt((e.target as HTMLInputElement).value) } })} />
                               </div>
                               <div class="config-row" style={{ marginTop: '12px', alignItems: 'flex-start' }}>
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
                                   <label>Mock Data (JSON)</label>
                                   <button 
                                     class="btn" 
                                     style={{ padding: '4px 8px', fontSize: '10px' }}
                                     onClick={() => {
                                       try {
                                         const current = ep.config?.mockData !== undefined ? ep.config.mockData : ep.mockExample || '';
                                         const formatted = JSON.stringify(JSON.parse(current), null, 2);
                                         updateEndpointConfig(ep.key, { config: { ...ep.config, mockData: formatted } });
                                         toast('JSON Formatted!', 'success');
                                       } catch (e) {
                                         toast('Invalid JSON, cannot format', 'error');
                                       }
                                     }}
                                   >Format</button>
                                 </div>
                                 <JsonEditor 
                                   value={ep.config?.mockData !== undefined ? ep.config.mockData : ep.mockExample || ''} 
                                   onChange={(val) => updateEndpointConfig(ep.key, { config: { ...ep.config, mockData: val } })}
                                 />
                               </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {view === 'test' && (
        <div class="main" style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px' }}>Active Endpoints</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {enabledEndpoints.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No mocked endpoints.</div>
              ) : (
                enabledEndpoints.map(ep => (
                  <div 
                    class="ep-card" 
                    style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                    onClick={() => {
                      setTestMethod(ep.method.toUpperCase());
                      setTestPath(ep.path);
                      if (ep.method.toUpperCase() !== 'GET' && ep.method.toUpperCase() !== 'HEAD') {
                        setTestBody(ep.mockExample || '{}');
                      } else {
                        setTestBody('');
                      }
                    }}
                  >
                    <span class={`method-badge ${ep.method.toLowerCase()}`}>{ep.method}</span>
                    <span class="ep-path">{ep.path}</span>
                    <span style={{ fontSize: '11px', color: 'var(--green)' }}>✓ {ep.config?.statusCode || 200}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px' }}>Test API</div>
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <select value={testMethod} onChange={(e) => setTestMethod((e.target as HTMLSelectElement).value)} style={{ padding: '8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option>
                </select>
                <select onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  if (val) {
                    const [m, p] = val.split('|');
                    setTestMethod(m);
                    setTestPath(p);
                  }
                }} style={{ flex: 1, padding: '8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <option value="">— pick endpoint —</option>
                  {enabledEndpoints.map(ep => (
                    <option value={`${ep.method}|${ep.path}`}>{ep.method} {ep.path}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '44px' }}>Path</label>
                <input type="text" value={testPath} onChange={(e) => setTestPath((e.target as HTMLInputElement).value)} placeholder="/api/users" style={{ flex: 1, padding: '8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '44px' }}>Body</label>
                <JsonEditor value={testBody} onChange={setTestBody} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button class="btn btn-primary" onClick={handleTestRequest}>Send</button>
                <button class="btn" onClick={() => setTestResponse(null)}>Clear</button>
              </div>

              {testResponse && (
                <div style={{ marginTop: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px' }}>
                  {testResponse.error ? (
                    <div style={{ color: 'var(--red)' }}>Error: {testResponse.error}</div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: testResponse.status >= 400 ? 'var(--red)' : 'var(--green)' }}>
                        {testResponse.status} {testResponse.statusText} · {testResponse.ms}ms
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', color: 'var(--text)', maxHeight: '300px', overflow: 'auto' }}>
                        {testResponse.body || '(empty)'}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {toastMsg && (
        <div class={`toast ${toastMsg.type}`}>
          {toastMsg.msg}
        </div>
      )}
    </>
  );
}
