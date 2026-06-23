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
  mockMode?: 'auto' | 'faker' | 'manual';
  fakerArraySize?: number;
  fakerArraySizes?: Record<string, number>;
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
  mockExampleFaker?: string;
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

function JsonEditor({ value, onChange, readOnly }: { value: string, onChange: (v: string) => void, readOnly?: boolean }) {
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

  const handleScroll = (e: any) => {
    const textarea = e.target as HTMLTextAreaElement;
    const pre = textarea.previousElementSibling as HTMLElement;
    if (pre) {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }
  };

  return (
    <div class={`code-editor ${isValid ? 'valid' : 'invalid'}`}>
      <div class="code-body-wrap">
        <div class="code-body">
          <pre aria-hidden="true" style={{ userSelect: 'none' }}><code dangerouslySetInnerHTML={{ __html: highlightJson(value) }} /></pre>
          <textarea 
            value={value} 
            onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            spellcheck={false}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
}

function JsonViewerNode({ 
  name, 
  value, 
  isLast, 
  isRoot = false, 
  path = 'root',
  fakerArraySizes = {},
  onSizeChange
}: { 
  name?: string, 
  value: any, 
  isLast: boolean, 
  isRoot?: boolean,
  path?: string,
  fakerArraySizes?: Record<string, number>,
  onSizeChange?: (path: string, size: number) => void
}) {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const [expanded, setExpanded] = useState(true);

  if (isObject) {
    const keys = Object.keys(value);
    const isEmpty = keys.length === 0;
    
    return (
      <div style={{ marginLeft: isRoot ? '0' : '20px', fontFamily: "'SF Mono', monospace", fontSize: '12px', lineHeight: '1.6' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {!isEmpty && (
            <span 
              onClick={() => setExpanded(!expanded)} 
              style={{ cursor: 'pointer', color: 'var(--text-muted)', width: '16px', display: 'inline-block', userSelect: 'none', fontSize: '10px', paddingTop: '2px' }}
            >
              {expanded ? '▼' : '▶'}
            </span>
          )}
          {isEmpty && <span style={{ width: '16px', display: 'inline-block' }}></span>}
          
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            {name && <span style={{ color: '#e06c75' }}>{name}: </span>}
            <span style={{ color: 'var(--text-muted)', marginLeft: name ? '4px' : '0' }}>
              {isArray ? `Array(${keys.length}) ` : 'Object '}
              {isEmpty ? (isArray ? '[]' : '{}') : (isArray ? '[' : '{')}
            </span>
            {isArray && onSizeChange && (
              <div style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>size:</span>
                <input 
                  type="number" 
                  min="1" max="100" 
                  value={fakerArraySizes[path] ?? (path === 'root' ? (fakerArraySizes['root'] ?? 3) : 3)}
                  onChange={(e) => onSizeChange(path, parseInt((e.target as HTMLInputElement).value) || 1)}
                  style={{ width: '40px', padding: '2px 4px', fontSize: '10px', background: 'rgba(255,255,255,0.1)', color: 'var(--text)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}
                />
              </div>
            )}
          </div>
        </div>
        
        {expanded && !isEmpty && (
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', marginLeft: '4px', paddingLeft: '12px', marginTop: '2px', marginBottom: '2px' }}>
            {keys.map((k, i) => {
              const childPath = isArray ? `${path}[]` : (path === 'root' ? k : `${path}.${k}`);
              return (
                <JsonViewerNode 
                  key={k} 
                  name={isArray ? undefined : k} 
                  value={value[k as keyof typeof value]} 
                  isLast={i === keys.length - 1} 
                  path={childPath}
                  fakerArraySizes={fakerArraySizes}
                  onSizeChange={onSizeChange}
                />
              );
            })}
          </div>
        )}
        
        {!isEmpty && (
          <div style={{ color: 'var(--text-muted)', marginLeft: expanded ? '4px' : '20px', display: expanded ? 'block' : 'inline' }}>
            {isArray ? ']' : '}'}{!isLast && ','}
          </div>
        )}
      </div>
    );
  }

  // Primitives
  let displayValue = String(value);
  let valueColor = 'var(--text)';
  let typeLabel: string = typeof value;

  if (typeof value === 'string') {
    displayValue = `"${value}"`;
    valueColor = '#98c379'; // Green
    typeLabel = 'String';
  } else if (typeof value === 'number') {
    valueColor = '#d19a66'; // Orange
    typeLabel = 'Int32'; // Simplified
  } else if (typeof value === 'boolean') {
    valueColor = '#c678dd'; // Purple
    typeLabel = 'Boolean';
  } else if (value === null) {
    displayValue = 'null';
    valueColor = 'var(--text-muted)';
    typeLabel = 'Null';
  }

  return (
    <div style={{ marginLeft: '20px', fontFamily: "'SF Mono', monospace", fontSize: '12px', lineHeight: '1.6', display: 'flex' }}>
      <div style={{ flex: 1 }}>
        {name && <span style={{ color: '#e06c75' }}>{name}: </span>}
        <span style={{ color: valueColor }}>{displayValue}</span>
        {!isLast && <span style={{ color: 'var(--text-muted)' }}>,</span>}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', marginLeft: '16px', userSelect: 'none' }}>
        {typeLabel}
      </div>
    </div>
  );
}

function CompassJsonViewer({ 
  jsonString,
  fakerArraySizes,
  onSizeChange
}: { 
  jsonString: string,
  fakerArraySizes?: Record<string, number>,
  onSizeChange?: (path: string, size: number) => void 
}) {
  let parsed = null;
  let error = false;
  try {
    parsed = JSON.parse(jsonString || 'null');
  } catch(e) {
    error = true;
  }

  if (error) {
    return <div style={{ color: 'var(--red)', padding: '16px', background: 'var(--surface)', borderRadius: 'var(--radius)' }}>Invalid JSON</div>;
  }

  return (
    <div style={{ 
      background: '#1e1e1e', // Dark VSCode/Compass like bg
      padding: '16px', 
      borderRadius: 'var(--radius)', 
      border: '1px solid var(--border)',
      overflowX: 'auto',
      maxHeight: '400px',
      overflowY: 'auto'
    }}>
      <JsonViewerNode 
        value={parsed} 
        isLast={true} 
        isRoot={true} 
        fakerArraySizes={fakerArraySizes}
        onSizeChange={onSizeChange}
      />
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
              mockMode: ep.config?.mockMode || 'auto',
              fakerArraySize: ep.config?.fakerArraySize || 3,
              fakerArraySizes: ep.config?.fakerArraySizes || {},
              errorEnabled: ep.config?.errorEnabled,
              errorStatus: ep.config?.errorStatus,
              errorBody: ep.config?.errorBody
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

  const applyFakerSizes = (data: any, sizes: Record<string, number>, path: string = 'root'): any => {
    if (Array.isArray(data)) {
      if (data.length === 0) return [];
      const size = sizes[path] ?? (path === 'root' ? (sizes['root'] ?? 3) : 3);
      const template = applyFakerSizes(data[0], sizes, `${path}[]`);
      return Array.from({ length: size }, (_, i) => {
        const item = JSON.parse(JSON.stringify(template));
        if (item && typeof item === 'object' && item.id) {
          if (typeof item.id === 'number') item.id += i;
          else if (typeof item.id === 'string') item.id = item.id.replace(/-[a-z0-9]+$/, `-${i}`);
        }
        return item;
      });
    } else if (data !== null && typeof data === 'object') {
      const res: any = {};
      for (const key of Object.keys(data)) {
        const childPath = path === 'root' ? key : `${path}.${key}`;
        res[key] = applyFakerSizes(data[key], sizes, childPath);
      }
      return res;
    }
    return data;
  };

  const getPreviewValue = (ep: Endpoint) => {
    if (ep.config?.mockMode === 'faker') {
      try {
        const parsed = JSON.parse(ep.mockExampleFaker || 'null');
        if (parsed !== null) {
          const resized = applyFakerSizes(parsed, ep.config.fakerArraySizes || {});
          return JSON.stringify(resized, null, 2);
        }
      } catch (e) {}
      return ep.mockExampleFaker || '';
    }
    return ep.config?.mockData !== undefined ? ep.config.mockData : (ep.mockExample || '');
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
                                 <label style={{ marginLeft: '16px' }}>Data Mode</label>
                                 <div class="segmented-control">
                                   <button 
                                     class={ep.config?.mockMode !== 'faker' ? 'active' : ''}
                                     onClick={() => updateEndpointConfig(ep.key, { config: { ...ep.config, mockMode: 'manual', mockData: ep.config?.mockData !== undefined ? ep.config.mockData : (ep.mockExample || '') } })}
                                   >Auto / Manual</button>
                                   <button 
                                     class={ep.config?.mockMode === 'faker' ? 'active' : ''}
                                     onClick={() => {
                                       let fakerData = ep.mockExampleFaker || '';
                                       try {
                                         const parsed = JSON.parse(fakerData);
                                         if (parsed !== null) {
                                           fakerData = JSON.stringify(applyFakerSizes(parsed, ep.config?.fakerArraySizes || {}), null, 2);
                                         }
                                       } catch (e) {}
                                       updateEndpointConfig(ep.key, { config: { ...ep.config, mockMode: 'faker', mockData: fakerData } });
                                     }}
                                   >Faker.js</button>
                                 </div>
                               </div>
                               <div class="config-row" style={{ marginTop: '12px', alignItems: 'flex-start' }}>
                                 {ep.config?.mockMode === 'faker' ? (
                                   <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <div>
                                         <h4 style={{ color: 'var(--text)', marginBottom: '4px', fontSize: '13px' }}>Faker.js Data</h4>
                                         <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: 0 }}>Faker provides an initial random seed. You can edit it manually or regenerate it.</p>
                                       </div>
                                     </div>
                                     <CompassJsonViewer 
                                       jsonString={getPreviewValue(ep)} 
                                       fakerArraySizes={ep.config?.fakerArraySizes || {}}
                                       onSizeChange={(path, size) => {
                                         const newSizes = { ...(ep.config?.fakerArraySizes || {}), [path]: size };
                                         let newMockData = ep.config?.mockData || '';
                                         try {
                                           const parsedFaker = JSON.parse(ep.mockExampleFaker || 'null');
                                           if (parsedFaker !== null) {
                                             newMockData = JSON.stringify(applyFakerSizes(parsedFaker, newSizes), null, 2);
                                           }
                                         } catch (e) {}
                                         updateEndpointConfig(ep.key, { config: { ...ep.config, fakerArraySizes: newSizes, mockData: newMockData } });
                                       }}
                                     />
                                   </div>
                                 ) : (
                                   <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <label style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>Mock Data (JSON)</label>
                                       <button 
                                         class="btn" 
                                         style={{ padding: '4px 12px', fontSize: '11px' }}
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
                                       >Format JSON</button>
                                     </div>
                                     <JsonEditor 
                                       value={getPreviewValue(ep)} 
                                       onChange={(v) => updateEndpointConfig(ep.key, { config: { ...ep.config, mockData: v, mockMode: 'manual' } })} 
                                     />
                                   </div>
                                 )}
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
