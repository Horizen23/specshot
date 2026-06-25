import { useState, useEffect } from "preact/hooks";
import { useMockConfig } from "./hooks/useMockConfig";
import { useTestApi } from "./hooks/useTestApi";
import { EndpointCard } from "./components/EndpointCard";
import { JsonEditor } from "./components/JsonEditor";
import { FAKER_FORMATS } from "./utils";
import "./index.css";
import "./app.css";

export function App() {
  const [view, setView] = useState<"config" | "test" | "ws">("config");

  const {
    specSource,
    setSpecSource,
    tags,
    totalEndpoints,
    mockServerRunning,
    mockServerPort,
    loading,
    toastMsg,
    toast,
    expandedTags,
    toggleTag,
    expandedEndpoints,
    toggleEndpointExpansion,
    searchQuery,
    setSearchQuery,
    mockOnly,
    setMockOnly,
    filteredTags,
    enabledEndpoints,
    enabledCount,
    loadSpec,
    toggleMockServer,
    updateEndpointConfig,
    regenerateFakerForEndpoint,
    saveAndGenerate,
    wsEndpoints,
    addWsEndpoint,
    removeWsEndpoint,
    triggerWsEvent,
    fetchWsEndpoints,
  } = useMockConfig();

  const {
    testMethod,
    setTestMethod,
    testPath,
    setTestPath,
    testBody,
    setTestBody,
    testResponse,
    setTestResponse,
    handleTestRequest,
  } = useTestApi(mockServerPort);

  const [newWsPath, setNewWsPath] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [triggerPath, setTriggerPath] = useState("");
  const [triggerMessage, setTriggerMessage] = useState("");

  const handleAddWsEndpoint = () => {
    if (!newWsPath.trim()) return;
    addWsEndpoint(newWsPath.trim(), newWsDesc.trim() || undefined);
    setNewWsPath("");
    setNewWsDesc("");
  };

  // Auto switch view if opened on port 3457
  useEffect(() => {
    if (window.location.port === "3457") {
      setView("test");
    }
  }, []);

  // Live-refresh WebSocket connection counts while on the WS tab
  useEffect(() => {
    if (view !== "ws") return;
    const id = setInterval(() => fetchWsEndpoints(), 3000);
    return () => clearInterval(id);
  }, [view, fetchWsEndpoints]);

  return (
    <>
      <div id="topbar" class="topbar">
        <div class="logo">
          <img src="/favicon.svg" alt="SpecShot Logo" class="logo-img" />
          SpecShot <span>Mock</span>
        </div>

        <div class="nav-tabs tabs-margin-left">
          <button
            class={`nav-tab ${view === "config" ? "active" : ""}`}
            onClick={() => setView("config")}
          >
            Configuration
          </button>
          <button
            class={`nav-tab ${view === "test" ? "active" : ""}`}
            onClick={() => setView("test")}
          >
            Test API
          </button>
          <button
            class={`nav-tab ${view === "ws" ? "active" : ""}`}
            onClick={() => setView("ws")}
          >
            WebSocket
          </button>
        </div>

        <div class="spacer"></div>

        {view === "config" ? (
          <>
            <input
              type="text"
              value={specSource}
              onChange={(e) =>
                setSpecSource((e.target as HTMLInputElement).value)
              }
              placeholder="OpenAPI URL or file path"
            />
            <button
              class="btn"
              onClick={() => loadSpec(specSource)}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load Spec"}
            </button>
            <div class="spacer-16"></div>
            <button
              class={`btn mock-server-btn ${mockServerRunning ? "running" : ""}`}
              onClick={toggleMockServer}
            >
              <span class={`server-dot ${mockServerRunning ? "on" : "off"}`} />
              {mockServerRunning ? "Stop Server" : "Start Server"}
            </button>
            <button
              class="btn btn-primary"
              onClick={saveAndGenerate}
              disabled={tags.length === 0}
            >
              Save & Generate
            </button>
          </>
        ) : (
          <>
            <div class="server-port-display">
              <span class={`server-dot ${mockServerRunning ? "on" : "off"}`} />
              Server Port: <span class="port-number">{mockServerPort}</span>
            </div>
            <div class="spacer-16"></div>
            <button
              class={`btn mock-server-btn ${mockServerRunning ? "running" : ""}`}
              onClick={toggleMockServer}
            >
              {mockServerRunning ? "Stop Server" : "Start Server"}
            </button>
          </>
        )}
      </div>

      {view === "config" && (
        <>
          <div class="search-bar">
            <input
              type="text"
              placeholder="Filter endpoints..."
              value={searchQuery}
              onInput={(e) =>
                setSearchQuery((e.target as HTMLInputElement).value)
              }
            />
            <label class="mock-only-toggle">
              <input
                type="checkbox"
                checked={mockOnly}
                onChange={(e) =>
                  setMockOnly((e.target as HTMLInputElement).checked)
                }
              />
              <span>Mocked only</span>
            </label>
          </div>

          <div class="main">
            {tags.length > 0 && (
              <div class="summary-bar summary-flex">
                <div class="summary-stat">
                  <span class="stat-value green">{enabledCount}</span>
                  <span class="stat-label">Active Mocks</span>
                </div>
                <div class="summary-stat">
                  <span class="stat-value">
                    {totalEndpoints - enabledCount}
                  </span>
                  <span class="stat-label">Passthrough</span>
                </div>
              </div>
            )}

            <div id="endpointList">
              {tags.length === 0 ? (
                <div class="empty-state">
                  <p>
                    Enter an OpenAPI spec source above and click{" "}
                    <strong>Load Spec</strong>
                  </p>
                </div>
              ) : (
                filteredTags.map((t) => (
                  <div
                    class={`tag-section ${expandedTags.has(t.tag) ? "expanded" : ""}`}
                    key={t.tag}
                  >
                    <div
                      class="tag-section-header"
                      onClick={() => toggleTag(t.tag)}
                    >
                      <div class="chevron">▶</div>
                      <div class="tag-name">{t.tag}</div>
                      <div class="tag-count">{t.endpoints.length}</div>
                    </div>
                    <div class="tag-section-body">
                      {t.endpoints.map((ep) => (
                        <EndpointCard
                          key={ep.key}
                          endpoint={ep}
                          isExpanded={expandedEndpoints.has(ep.key)}
                          onToggleExpand={() => toggleEndpointExpansion(ep.key)}
                          onUpdateConfig={updateEndpointConfig}
                          onRegenerateFaker={regenerateFakerForEndpoint}
                          toast={toast}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {view === "test" && (
        <div class="main test-view-container">
          <div class="test-left-col">
            <div class="section-header">Active Endpoints</div>
            <div class="active-endpoints-list">
              {enabledEndpoints.length === 0 ? (
                <div class="empty-list-message">No mocked endpoints.</div>
              ) : (
                enabledEndpoints.map((ep) => {
                  const httpUrl = `http://localhost:${mockServerPort}${ep.path}`;
                  return (
                    <div
                      class={`ep-card active-endpoint-item ${testPath === ep.path && testMethod === ep.method.toUpperCase() ? "selected" : ""}`}
                      onClick={() => {
                        setTestMethod(ep.method.toUpperCase());
                        setTestPath(ep.path);
                        if (
                          ep.method.toUpperCase() !== "GET" &&
                          ep.method.toUpperCase() !== "HEAD"
                        ) {
                          setTestBody(ep.mockExample || "{}");
                        } else {
                          setTestBody("");
                        }
                      }}
                      key={ep.key}
                    >
                      <span class={`method-badge ${ep.method.toLowerCase()}`}>
                        {ep.method}
                      </span>
                      <span class="ep-path">{ep.path}</span>
                      <span class="active-endpoint-status-check">
                        ✓ {ep.config?.statusCode || 200}
                      </span>
                      <button
                        class="btn ws-copy-btn"
                        title="Copy URL"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(httpUrl);
                          toast("Copied " + httpUrl);
                        }}
                      >
                        ⧉
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div class="test-right-col">
            <div class="section-header">Test API</div>
            <div class="test-api-panel">
              <div class="ws-trigger-url">
                <span class="form-label">Target</span>
                <code>
                  {testPath
                    ? `${testMethod} http://localhost:${mockServerPort}${testPath}`
                    : "— pick an endpoint —"}
                </code>
              </div>
              <div class="form-row select-row">
                <select
                  value={testMethod}
                  onChange={(e) =>
                    setTestMethod((e.target as HTMLSelectElement).value)
                  }
                  class="method-select"
                >
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                  <option>PATCH</option>
                </select>
                <select
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val) {
                      const [m, p] = val.split("|");
                      setTestMethod(m);
                      setTestPath(p);
                    }
                  }}
                  class="endpoint-picker"
                >
                  <option value="">— pick endpoint —</option>
                  {enabledEndpoints.map((ep) => (
                    <option value={`${ep.method}|${ep.path}`} key={ep.key}>
                      {ep.method} {ep.path}
                    </option>
                  ))}
                </select>
              </div>
              <div class="form-row input-row">
                <label class="form-label">Path</label>
                <input
                  type="text"
                  value={testPath}
                  onChange={(e) =>
                    setTestPath((e.target as HTMLInputElement).value)
                  }
                  placeholder="/api/users"
                  class="path-input"
                />
              </div>
              <div class="form-row body-row">
                <label class="form-label">Body</label>
                <JsonEditor value={testBody} onChange={setTestBody} />
              </div>
              <div class="form-buttons-row">
                <button
                  class="btn btn-primary"
                  onClick={handleTestRequest}
                  disabled={!testPath.trim() || !mockServerRunning}
                >
                  Send
                </button>
                <button class="btn" onClick={() => setTestResponse(null)}>
                  Clear
                </button>
              </div>
              {!mockServerRunning && testPath && (
                <div class="ws-server-hint">
                  Start the mock server to send requests.
                </div>
              )}

              {testResponse && (
                <div class="test-response-container">
                  {testResponse.error ? (
                    <div class="response-error-message">
                      Error: {testResponse.error}
                    </div>
                  ) : (
                    <>
                      <div
                        class={`response-status-title ${testResponse.status >= 400 ? "status-error" : "status-success"}`}
                      >
                        {testResponse.status} {testResponse.statusText} ·{" "}
                        {testResponse.ms}ms
                      </div>
                      <div class="response-body-pre">
                        {testResponse.body || "(empty)"}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === "ws" && (
        <div class="main test-view-container">
          <div class="test-left-col">
            <div class="section-header">Add Endpoint</div>
            <div class="test-api-panel">
              <div class="form-row input-row">
                <label class="form-label">Path</label>
                <input
                  type="text"
                  value={newWsPath}
                  onInput={(e) =>
                    setNewWsPath((e.target as HTMLInputElement).value)
                  }
                  placeholder="/ws/events"
                  class="path-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddWsEndpoint();
                  }}
                />
              </div>
              <div class="form-row input-row">
                <label class="form-label">Desc</label>
                <input
                  type="text"
                  value={newWsDesc}
                  onInput={(e) =>
                    setNewWsDesc((e.target as HTMLInputElement).value)
                  }
                  placeholder="Optional description"
                  class="path-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddWsEndpoint();
                  }}
                />
              </div>
              <div class="form-buttons-row">
                <button
                  class="btn btn-primary"
                  onClick={handleAddWsEndpoint}
                  disabled={!newWsPath.trim()}
                >
                  Add Endpoint
                </button>
              </div>
            </div>

            <div class="section-header" style="margin-top:24px">
              Endpoints
            </div>
            <div class="active-endpoints-list">
              {wsEndpoints.length === 0 ? (
                <div class="empty-list-message">
                  No WebSocket endpoints configured.
                  <br />
                  <small>Add a path above to get started.</small>
                </div>
              ) : (
                wsEndpoints.map((ep) => {
                  const wsUrl = `ws://localhost:${mockServerPort}${ep.path}`;
                  return (
                    <div
                      class={`ep-card active-endpoint-item ws-ep-card ${triggerPath === ep.path ? "selected" : ""}`}
                      onClick={() => {
                        setTriggerPath(ep.path);
                        setTriggerMessage("");
                      }}
                      key={ep.id}
                    >
                      <div class="ws-ep-info">
                        <span class="ep-path">{ep.path}</span>
                        <button
                          class="btn ws-copy-btn"
                          title="Copy WebSocket URL"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(wsUrl);
                            toast("Copied " + wsUrl);
                          }}
                        >
                          ⧉
                        </button>
                      </div>
                      <span class="ws-connection-count">
                        {ep.connections} connected
                      </span>
                      <button
                        class="btn ws-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWsEndpoint(ep.id);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div class="test-right-col">
            <div class="section-header">Trigger Event</div>
            <div class="test-api-panel">
              {!triggerPath ? (
                <div class="empty-list-message">
                  Select an endpoint to trigger an event.
                </div>
              ) : (
                <>
                  <div class="ws-trigger-url">
                    <span class="form-label">Target</span>
                    <code>ws://localhost:{mockServerPort}{triggerPath}</code>
                  </div>
                  <div class="form-row body-row">
                    <label class="form-label">Message</label>
                    <JsonEditor
                      value={triggerMessage}
                      onChange={setTriggerMessage}
                    />
                  </div>
                  <div class="form-buttons-row">
                    <button
                      class="btn btn-primary"
                      onClick={() =>
                        triggerWsEvent(triggerPath, triggerMessage || "{}")
                      }
                      disabled={!mockServerRunning}
                    >
                      Send Event
                    </button>
                  </div>
                  {!mockServerRunning && (
                    <div class="ws-server-hint">
                      Start the mock server to send events.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <datalist id="faker-formats-list">
        {FAKER_FORMATS.filter((f) => f.value && !f.value.startsWith("---")).map(
          (f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ),
        )}
      </datalist>

      {toastMsg && <div class={`toast ${toastMsg.type}`}>{toastMsg.msg}</div>}
    </>
  );
}
