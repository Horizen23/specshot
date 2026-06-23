import type { Endpoint } from "./types";

// Constants for Faker formats
export const FAKER_FORMATS = [
  { value: "", label: "Auto" },
  { value: "internet.email", label: "internet.email" },
  { value: "internet.url", label: "internet.url" },
  { value: "person.firstName", label: "person.firstName" },
  { value: "person.lastName", label: "person.lastName" },
  { value: "person.fullName", label: "person.fullName" },
  { value: "person.jobTitle", label: "person.jobTitle" },
  { value: "string.uuid", label: "string.uuid" },
  { value: "date.recent", label: "date.recent" },
  { value: "date.past", label: "date.past" },
  { value: "lorem.word", label: "lorem.word" },
  { value: "lorem.sentence", label: "lorem.sentence" },
  { value: "lorem.paragraph", label: "lorem.paragraph" },
  { value: "location.city", label: "location.city" },
  { value: "location.country", label: "location.country" },
  { value: "location.streetAddress", label: "location.streetAddress" },
  { value: "phone.number", label: "phone.number" },
  { value: "commerce.productName", label: "commerce.productName" },
  { value: "commerce.price", label: "commerce.price" },
  { value: "image.url", label: "image.url" },
  { value: "number.int", label: "number.int" },
];

// Highlight JSON syntax via regex replacing to CSS classes
export function highlightJson(json: string): string {
  if (!json) return "";
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "hl-n";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "hl-k";
        } else {
          cls = "hl-s";
        }
      } else if (/true|false/.test(match)) {
        cls = "hl-b";
      } else if (/null/.test(match)) {
        cls = "hl-p";
      }
      return '<span class="' + cls + '">' + match + "</span>";
    },
  );
}

// Process structural size expansion/truncation of Faker arrays
export function applyFakerSizes(
  data: any,
  sizes: Record<string, number>,
  path: string = "root",
): any {
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    const size = sizes[path] ?? (path === "root" ? (sizes["root"] ?? 3) : 3);

    const result = [];
    for (let i = 0; i < size; i++) {
      const sourceItem = i < data.length ? data[i] : data[0];
      const processedItem = applyFakerSizes(sourceItem, sizes, `${path}[]`);
      const item = JSON.parse(JSON.stringify(processedItem));

      if (i >= data.length && item && typeof item === "object" && item.id) {
        if (typeof item.id === "number") item.id += i;
        else if (typeof item.id === "string")
          item.id = item.id.replace(/-[a-z0-9]+$/, `-${i}`);
      }
      result.push(item);
    }
    return result;
  } else if (data !== null && typeof data === "object") {
    const res: any = {};
    for (const key of Object.keys(data)) {
      const childPath = path === "root" ? key : `${path}.${key}`;
      res[key] = applyFakerSizes(data[key], sizes, childPath);
    }
    return res;
  }
  return data;
}

// Compute string representations based on endpoint mock states
export function getPreviewValue(ep: Endpoint): string {
  if (ep.config?.mockMode === "faker") {
    try {
      const parsed = JSON.parse(ep.mockExampleFaker || "null");
      if (parsed !== null) {
        const resized = applyFakerSizes(
          parsed,
          ep.config.fakerArraySizes || {},
        );
        return JSON.stringify(resized, null, 2);
      }
    } catch (e) {}
    return ep.mockExampleFaker || "";
  }
  return ep.config?.mockData !== undefined
    ? ep.config.mockData
    : ep.mockExample || "";
}
