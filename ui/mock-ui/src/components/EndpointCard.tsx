import type { Endpoint } from "../types";
import { getPreviewValue, applyFakerSizes } from "../utils";
import { CompassJsonViewer } from "./CompassJsonViewer";
import { JsonEditor } from "./JsonEditor";

interface EndpointCardProps {
  endpoint: Endpoint;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateConfig: (key: string, updates: Partial<Endpoint>) => void;
  onRegenerateFaker: (key: string) => Promise<void>;
  toast: (msg: string, type?: string) => void;
}

export function EndpointCard({
  endpoint,
  isExpanded,
  onToggleExpand,
  onUpdateConfig,
  onRegenerateFaker,
  toast,
}: EndpointCardProps) {
  const ep = endpoint;

  const handleFormatJson = () => {
    try {
      const current =
        ep.config?.mockData !== undefined
          ? ep.config.mockData
          : ep.mockExample || "";
      const formatted = JSON.stringify(JSON.parse(current), null, 2);
      onUpdateConfig(ep.key, { config: { ...ep.config, mockData: formatted } });
      toast("JSON Formatted!", "success");
    } catch (e) {
      toast("Invalid JSON, cannot format", "error");
    }
  };

  const handleSwitchToManual = () => {
    onUpdateConfig(ep.key, {
      config: {
        ...ep.config,
        mockMode: "manual",
        mockData:
          ep.config?.mockData !== undefined
            ? ep.config.mockData
            : ep.mockExample || "",
      },
    });
  };

  const handleSwitchToFaker = () => {
    let fakerData = ep.mockExampleFaker || "";
    try {
      const parsed = JSON.parse(fakerData);
      if (parsed !== null) {
        fakerData = JSON.stringify(
          applyFakerSizes(parsed, ep.config?.fakerArraySizes || {}),
          null,
          2,
        );
      }
    } catch (e) {}
    onUpdateConfig(ep.key, {
      config: {
        ...ep.config,
        mockMode: "faker",
        mockData: fakerData,
      },
    });
  };

  return (
    <div
      class={`ep-card ${ep.enabled ? "mocked" : ""} ${isExpanded ? "expanded" : ""}`}
    >
      <div class="ep-card-header" onClick={onToggleExpand}>
        <span class={`method-badge ${ep.method.toLowerCase()}`}>
          {ep.method}
        </span>
        <span class="ep-path">{ep.path}</span>
        <span class="ep-summary">{ep.summary}</span>
        <div class="spacer"></div>
        <div
          class="toggle"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateConfig(ep.key, { enabled: !ep.enabled });
          }}
        >
          <input type="checkbox" checked={ep.enabled} readOnly />
          <div class="slider"></div>
        </div>
        <button class="expand-btn">▼</button>
      </div>

      {isExpanded && (
        <div class="ep-config">
          <div class="config-row">
            <label>Status Code</label>
            <input
              type="number"
              value={ep.config?.statusCode || 200}
              onChange={(e) =>
                onUpdateConfig(ep.key, {
                  config: {
                    ...ep.config,
                    statusCode: parseInt((e.target as HTMLInputElement).value),
                  },
                })
              }
            />
            <label class="margin-left-16">Delay (ms)</label>
            <input
              type="number"
              value={ep.config?.delay || 0}
              onChange={(e) =>
                onUpdateConfig(ep.key, {
                  config: {
                    ...ep.config,
                    delay: parseInt((e.target as HTMLInputElement).value),
                  },
                })
              }
            />
            <label class="margin-left-16">Data Mode</label>
            <div class="segmented-control">
              <button
                class={ep.config?.mockMode !== "faker" ? "active" : ""}
                onClick={handleSwitchToManual}
              >
                Auto / Manual
              </button>
              <button
                class={ep.config?.mockMode === "faker" ? "active" : ""}
                onClick={handleSwitchToFaker}
              >
                Faker.js
              </button>
            </div>
          </div>
          <div class="config-row detail-row">
            {ep.config?.mockMode === "faker" ? (
              <div class="faker-editor-section">
                <div class="section-title-bar">
                  <div>
                    <h4 class="section-title">Faker.js Data</h4>
                    <p class="section-description">
                      Faker provides an initial random seed. You can edit it
                      manually or regenerate it.
                    </p>
                  </div>
                  <button
                    class="btn outline regenerate-btn"
                    onClick={() => onRegenerateFaker(ep.key)}
                  >
                    Regenerate
                  </button>
                </div>
                <CompassJsonViewer
                  jsonString={getPreviewValue(ep)}
                  fakerArraySizes={ep.config?.fakerArraySizes || {}}
                  fakerFormats={ep.config?.fakerFormats || {}}
                  schemaTypes={ep.schemaTypes || {}}
                  onSizeChange={(path, size) => {
                    const newSizes = {
                      ...(ep.config?.fakerArraySizes || {}),
                      [path]: size,
                    };
                    let newMockData = ep.config?.mockData || "";
                    try {
                      const parsedFaker = JSON.parse(
                        ep.mockExampleFaker || "null",
                      );
                      if (parsedFaker !== null) {
                        newMockData = JSON.stringify(
                          applyFakerSizes(parsedFaker, newSizes),
                          null,
                          2,
                        );
                      }
                    } catch (e) {}
                    onUpdateConfig(ep.key, {
                      config: {
                        ...ep.config,
                        fakerArraySizes: newSizes,
                        mockData: newMockData,
                      },
                    });
                  }}
                  onFormatChange={(path, format) => {
                    onUpdateConfig(ep.key, {
                      config: {
                        ...ep.config,
                        fakerFormats: {
                          ...(ep.config?.fakerFormats || {}),
                          [path]: format,
                        },
                      },
                    });
                  }}
                />
              </div>
            ) : (
              <div class="manual-editor-section">
                <div class="section-title-bar">
                  <label class="section-title">Mock Data (JSON)</label>
                  <button
                    class="btn format-json-btn"
                    onClick={handleFormatJson}
                  >
                    Format JSON
                  </button>
                </div>
                <JsonEditor
                  value={getPreviewValue(ep)}
                  schemaTypes={ep.schemaTypes || {}}
                  onChange={(v) =>
                    onUpdateConfig(ep.key, {
                      config: { ...ep.config, mockData: v, mockMode: "manual" },
                    })
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
