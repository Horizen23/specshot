import http from "http";

export interface HandlerContext {
  cwd: string;
  state: {
    mockServerPort: number;
    isRunning: boolean;
  };
  options: {
    url?: string;
    file?: string;
    output?: string;
    configPath?: string;
    port?: number;
    proxy?: string;
    noOpen?: boolean;
  };
  startMockServer: (cwd: string, port: number) => Promise<http.Server>;
  stopMockServer: () => void;
  restartMockServer: (cwd: string) => void;
}
