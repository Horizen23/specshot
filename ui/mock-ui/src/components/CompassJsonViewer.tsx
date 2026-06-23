import { JsonViewerNode } from "./JsonViewerNode";

interface CompassJsonViewerProps {
  jsonString: string;
  fakerArraySizes?: Record<string, number>;
  fakerFormats?: Record<string, string>;
  schemaTypes?: Record<string, string>;
  onSizeChange?: (path: string, size: number) => void;
  onFormatChange?: (path: string, format: string) => void;
}

export function CompassJsonViewer({
  jsonString,
  fakerArraySizes,
  fakerFormats,
  schemaTypes,
  onSizeChange,
  onFormatChange,
}: CompassJsonViewerProps) {
  let parsed = null;
  let error = false;
  try {
    parsed = JSON.parse(jsonString || "null");
  } catch (e) {
    error = true;
  }

  if (error) {
    return <div class="compass-json-viewer-error">Invalid JSON</div>;
  }

  return (
    <div class="compass-json-viewer">
      <JsonViewerNode
        value={parsed}
        isLast={true}
        isRoot={true}
        fakerArraySizes={fakerArraySizes}
        fakerFormats={fakerFormats}
        schemaTypes={schemaTypes}
        onSizeChange={onSizeChange}
        onFormatChange={onFormatChange}
      />
    </div>
  );
}
