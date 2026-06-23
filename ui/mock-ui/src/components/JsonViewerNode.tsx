import { useState } from "preact/hooks";

interface JsonViewerNodeProps {
  name?: string;
  value: any;
  isLast: boolean;
  isRoot?: boolean;
  path?: string;
  fakerArraySizes?: Record<string, number>;
  fakerFormats?: Record<string, string>;
  schemaTypes?: Record<string, string>;
  onSizeChange?: (path: string, size: number) => void;
  onFormatChange?: (path: string, format: string) => void;
}

export function JsonViewerNode({
  name,
  value,
  isLast,
  isRoot = false,
  path = "root",
  fakerArraySizes = {},
  fakerFormats = {},
  schemaTypes = {},
  onSizeChange,
  onFormatChange,
}: JsonViewerNodeProps) {
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const [expanded, setExpanded] = useState(true);

  if (isObject) {
    const keys = Object.keys(value);
    const isEmpty = keys.length === 0;

    return (
      <div
        class="json-viewer-node"
        style={{ marginLeft: isRoot ? "0" : "20px" }}
      >
        <div class="json-viewer-node-row">
          {!isEmpty && (
            <span
              onClick={() => setExpanded(!expanded)}
              class="json-viewer-node-arrow"
            >
              {expanded ? "▼" : "▶"}
            </span>
          )}
          {isEmpty && <span class="json-viewer-node-arrow-placeholder"></span>}

          <div class="json-viewer-node-content">
            {name && <span class="json-viewer-node-key">{name}: </span>}
            <span
              class="json-viewer-node-type-indicator"
              style={{ marginLeft: name ? "4px" : "0" }}
            >
              {isArray ? `Array(${keys.length}) ` : "Object "}
              {isEmpty ? (isArray ? "[]" : "{}") : isArray ? "[" : "{"}
            </span>
            {isArray && onSizeChange && (
              <div class="json-viewer-node-size-controls">
                <span class="size-label">size:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={
                    fakerArraySizes[path] ??
                    (path === "root" ? (fakerArraySizes["root"] ?? 3) : 3)
                  }
                  onChange={(e) =>
                    onSizeChange(
                      path,
                      parseInt((e.target as HTMLInputElement).value) || 1,
                    )
                  }
                  class="size-input"
                />
              </div>
            )}
          </div>
        </div>

        {expanded && !isEmpty && (
          <div class="json-viewer-node-children">
            {keys.map((k, i) => {
              const childPath = isArray
                ? `${path}[]`
                : path === "root"
                  ? k
                  : `${path}.${k}`;
              return (
                <JsonViewerNode
                  key={k}
                  name={isArray ? undefined : k}
                  value={value[k as keyof typeof value]}
                  isLast={i === keys.length - 1}
                  path={childPath}
                  fakerArraySizes={fakerArraySizes}
                  fakerFormats={fakerFormats}
                  schemaTypes={schemaTypes}
                  onSizeChange={onSizeChange}
                  onFormatChange={onFormatChange}
                />
              );
            })}
          </div>
        )}

        {!isEmpty && (
          <div
            class={`json-viewer-node-bracket ${expanded ? "block" : "inline"}`}
            style={{ marginLeft: expanded ? "4px" : "20px" }}
          >
            {isArray ? "]" : "}"}
            {!isLast && ","}
          </div>
        )}
      </div>
    );
  }

  // Primitives rendering
  let displayValue = String(value);
  let valClass = "val-default";
  let typeLabel: string = typeof value;

  if (typeof value === "string") {
    displayValue = `"${value}"`;
    valClass = "val-string";
    typeLabel = "String";
  } else if (typeof value === "number") {
    valClass = "val-number";
    typeLabel = "Int32";
  } else if (typeof value === "boolean") {
    valClass = "val-boolean";
    typeLabel = "Boolean";
  } else if (value === null) {
    displayValue = "null";
    valClass = "val-null";
    typeLabel = "Null";
  }

  const expectedType = schemaTypes[path];
  let isMismatch = false;
  if (expectedType && value !== null) {
    const actualType = typeof value;
    if (expectedType === "string" && actualType !== "string") isMismatch = true;
    if (
      (expectedType === "number" || expectedType === "integer") &&
      actualType !== "number"
    )
      isMismatch = true;
    if (expectedType === "boolean" && actualType !== "boolean")
      isMismatch = true;
  }

  return (
    <div
      class="json-viewer-node primitive"
      style={{ marginLeft: isRoot ? "0" : "20px" }}
    >
      <div class="json-viewer-node-left-col">
        <span class="json-viewer-node-arrow-placeholder"></span>
        {name && <span class="json-viewer-node-key">{name}: </span>}
        <span class={`json-viewer-node-val ${valClass}`}>{displayValue}</span>
        {!isLast && <span class="json-viewer-node-comma">,</span>}
      </div>

      <div class="json-viewer-node-right-col">
        {onFormatChange && (
          <input
            type="text"
            list="faker-formats-list"
            value={fakerFormats[path] || ""}
            onInput={(e) =>
              onFormatChange(path, (e.target as HTMLInputElement).value)
            }
            class="faker-format-select"
            title="Search or select Faker format"
            placeholder="Auto"
          />
        )}
        <div
          class={`json-viewer-node-type-label ${isMismatch ? "mismatch" : ""}`}
          title={isMismatch ? `Warning: Schema expected ${expectedType}` : ""}
        >
          {isMismatch && <span class="warning-icon">⚠️</span>}
          {typeLabel}
        </div>
      </div>
    </div>
  );
}
