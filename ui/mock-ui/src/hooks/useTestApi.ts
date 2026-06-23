import { useState } from "preact/hooks";
import type { TestResponse } from "../types";
import * as api from "../api";

export function useTestApi(mockServerPort: number) {
  const [testMethod, setTestMethod] = useState("GET");
  const [testPath, setTestPath] = useState("");
  const [testBody, setTestBody] = useState("");
  const [testResponse, setTestResponse] = useState<TestResponse | null>(null);

  const handleTestRequest = async () => {
    setTestResponse(null);
    const start = performance.now();
    const baseUrl = `http://localhost:${mockServerPort}`;
    try {
      const data = await api.sendTestRequest(
        testMethod,
        `${baseUrl}${testPath}`,
        testBody,
      );
      let parsedBody = data.body;
      try {
        parsedBody = JSON.stringify(JSON.parse(data.body), null, 2);
      } catch (e) {}

      setTestResponse({
        status: data.status,
        statusText: data.statusText,
        ms: Math.round(performance.now() - start),
        body: parsedBody,
      });
    } catch (e: any) {
      setTestResponse({
        status: 0,
        statusText: "Error",
        ms: Math.round(performance.now() - start),
        body: "",
        error: e.message,
      });
    }
  };

  return {
    testMethod,
    setTestMethod,
    testPath,
    setTestPath,
    testBody,
    setTestBody,
    testResponse,
    setTestResponse,
    handleTestRequest,
  };
}
