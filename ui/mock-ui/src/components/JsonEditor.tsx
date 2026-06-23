import { useState, useEffect } from "preact/hooks";
import { highlightJson } from "../utils";

interface JsonEditorProps {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  schemaTypes?: Record<string, string>;
}

export function JsonEditor({
  value,
  onChange,
  readOnly,
  schemaTypes,
}: JsonEditorProps) {
  const [isValid, setIsValid] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(value || "{}");
      setIsValid(true);

      if (schemaTypes) {
        const newWarnings: string[] = [];
        const checkTypes = (data: any, path: string) => {
          if (Array.isArray(data)) {
            data.forEach((item) => checkTypes(item, `${path}[]`));
          } else if (data !== null && typeof data === "object") {
            for (const key of Object.keys(data)) {
              checkTypes(data[key], path === "root" ? key : `${path}.${key}`);
            }
          } else {
            const expectedType = schemaTypes[path];
            if (expectedType && data !== null) {
              const actualType = typeof data;
              let mismatch = false;
              if (expectedType === "string" && actualType !== "string")
                mismatch = true;
              if (
                (expectedType === "number" || expectedType === "integer") &&
                actualType !== "number"
              )
                mismatch = true;
              if (expectedType === "boolean" && actualType !== "boolean")
                mismatch = true;
              if (mismatch) {
                newWarnings.push(
                  `Type mismatch at "${path}": expected ${expectedType}, got ${actualType}`,
                );
              }
            }
          }
        };
        checkTypes(parsed, "root");
        setWarnings(newWarnings.slice(0, 5));
      }
    } catch {
      setIsValid(false);
      setWarnings([]);
    }
  }, [value, schemaTypes]);

  const handleKeyDown = (e: any) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = value.substring(0, start) + "  " + value.substring(end);
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
    <div class={`code-editor ${isValid ? "valid" : "invalid"}`}>
      <div class="code-body-wrap">
        <div class="code-body">
          <pre aria-hidden="true" style={{ userSelect: "none" }}>
            <code dangerouslySetInnerHTML={{ __html: highlightJson(value) }} />
          </pre>
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
      {warnings.length > 0 && (
        <div class="json-warnings">
          <div class="json-warnings-header">⚠️ Schema Type Mismatch:</div>
          {warnings.map((w) => (
            <div class="json-warnings-item">• {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
