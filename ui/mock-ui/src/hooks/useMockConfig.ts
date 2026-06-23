import { useState, useEffect, useMemo } from "preact/hooks";
import type {
  TagGroup,
  Endpoint,
  EndpointConfig,
  ToastMessage,
} from "../types";
import * as api from "../api";
import { applyFakerSizes } from "../utils";

import { registerPlugins } from "../utils";

export function useMockConfig() {
  const [specSource, setSpecSource] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [tags, setTags] = useState<TagGroup[]>([]);
  const [totalEndpoints, setTotalEndpoints] = useState(0);
  const [mockServerRunning, setMockServerRunning] = useState(false);
  const [mockServerPort, setMockServerPort] = useState(3457);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<ToastMessage | null>(null);

  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [mockOnly, setMockOnly] = useState(false);

  const toast = (msg: string, type = "success") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Initial config load
  useEffect(() => {
    api
      .fetchConfig()
      .then((data) => {
        if (data.specSource) setSpecSource(data.specSource);
        if (data.outputDir) setOutputDir(data.outputDir);
        if (data.specSource) {
          loadSpec(data.specSource);
        }
      })
      .catch(console.error);

    api
      .fetchMockServerStatus()
      .then((data) => {
        setMockServerRunning(data.running);
        if (data.port) setMockServerPort(data.port);
      })
      .catch(console.error);
  }, []);

  // Debounced auto-save configurations on changes
  useEffect(() => {
    if (tags.length === 0) return;
    const timeout = setTimeout(() => {
      const endpoints: Record<string, EndpointConfig> = {};
      tags.forEach((tg) => {
        tg.endpoints.forEach((ep) => {
          if (ep.enabled || ep.config) {
            endpoints[ep.key] = {
              enabled: ep.enabled,
              tag: ep.tag,
              operationId: ep.operationId,
              method: ep.method,
              path: ep.path,
              statusCode: ep.config?.statusCode || 200,
              delay: ep.config?.delay || 0,
              mockData:
                ep.config?.mockData !== undefined
                  ? ep.config.mockData
                  : ep.mockExample || "",
              mockMode: ep.config?.mockMode || "auto",
              fakerArraySize: ep.config?.fakerArraySize || 3,
              fakerArraySizes: ep.config?.fakerArraySizes || {},
              fakerFormats: ep.config?.fakerFormats || {},
              errorEnabled: ep.config?.errorEnabled,
              errorStatus: ep.config?.errorStatus,
              errorBody: ep.config?.errorBody,
            };
          }
        });
      });
      api.saveConfig(endpoints).catch(console.error);
    }, 500);
    return () => clearTimeout(timeout);
  }, [tags]);

  const loadSpec = async (source: string) => {
    if (!source) return;
    setLoading(true);
    try {
      const data = await api.loadSpec(source);
      if (data.availablePlugins) {
        registerPlugins(data.availablePlugins);
      }
      const formattedTags = data.tags.map((tg: TagGroup) => ({
        ...tg,
        endpoints: tg.endpoints.map((ep: Endpoint) => {
          if (ep.config?.mockData) {
            try {
              ep.config.mockData = JSON.stringify(
                JSON.parse(ep.config.mockData),
                null,
                2,
              );
            } catch (e) {}
          }
          if (ep.mockExample) {
            try {
              ep.mockExample = JSON.stringify(
                JSON.parse(ep.mockExample),
                null,
                2,
              );
            } catch (e) {}
          }
          return ep;
        }),
      }));
      setTags(formattedTags);
      setTotalEndpoints(data.totalEndpoints);
      setExpandedTags(new Set([data.tags[0]?.tag]));
      toast(`Loaded ${data.totalEndpoints} endpoints`);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleMockServer = async () => {
    const action = mockServerRunning ? "stop" : "start";
    try {
      const data = await api.toggleMockServer(action, mockServerPort);
      setMockServerRunning(data.running);
      if (data.port) setMockServerPort(data.port);
      toast(`Mock server ${data.running ? "started" : "stopped"}`);
    } catch (e: any) {
      toast(e.message, "error");
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
    setTags((prev) =>
      prev.map((t) => ({
        ...t,
        endpoints: t.endpoints.map((ep) =>
          ep.key === key ? { ...ep, ...updates } : ep,
        ),
      })),
    );
  };

  const regenerateFakerForEndpoint = async (key: string) => {
    const ep = tags.flatMap((t) => t.endpoints).find((e) => e.key === key);
    if (!ep) return;
    try {
      toast("Regenerating...", "info");
      const data = await api.regenerateFaker({
        specSource,
        key: ep.key,
        fakerArraySizes: ep.config?.fakerArraySizes || {},
        fakerFormats: ep.config?.fakerFormats || {},
      });
      if (data.mockExampleFaker) {
        // Update mockExampleFaker string
        const updatedTags = tags.map((t) => ({
          ...t,
          endpoints: t.endpoints.map((e) =>
            e.key === ep.key
              ? { ...e, mockExampleFaker: data.mockExampleFaker }
              : e,
          ),
        }));
        setTags(updatedTags);

        // Update parsed state data
        let newMockData = ep.config?.mockData || "";
        try {
          const parsedFaker = JSON.parse(data.mockExampleFaker || "null");
          if (parsedFaker !== null) {
            newMockData = JSON.stringify(
              applyFakerSizes(parsedFaker, ep.config?.fakerArraySizes || {}),
              null,
              2,
            );
          }
        } catch (e) {}
        updateEndpointConfig(ep.key, {
          config: { ...ep.config, mockData: newMockData },
        });
        toast("Regenerated successfully!", "success");
      }
    } catch (err: any) {
      toast(err.message || "Failed to regenerate", "error");
    }
  };

  const saveAndGenerate = async () => {
    const endpointConfigs: Record<string, any> = {};
    tags.forEach((t) => {
      t.endpoints.forEach((ep) => {
        if (ep.enabled || ep.config) {
          endpointConfigs[ep.key] = {
            enabled: ep.enabled,
            tag: ep.tag,
            operationId: ep.operationId,
            method: ep.method,
            path: ep.path,
            ...(ep.config || {}),
          };
        }
      });
    });

    try {
      const data = await api.generateHandlers({
        specSource,
        outputDir,
        endpoints: endpointConfigs,
      });
      toast(`Generated ${data.handlersGenerated} handlers`);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const filteredTags = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return tags
      .map((t) => ({
        ...t,
        endpoints: t.endpoints.filter((ep) => {
          if (mockOnly && !ep.enabled) return false;
          if (!query) return true;
          return (
            ep.path.toLowerCase().includes(query) ||
            ep.method.toLowerCase().includes(query) ||
            (ep.summary || "").toLowerCase().includes(query) ||
            t.tag.toLowerCase().includes(query)
          );
        }),
      }))
      .filter((t) => t.endpoints.length > 0);
  }, [tags, searchQuery, mockOnly]);

  const enabledEndpoints = useMemo(() => {
    const list: Endpoint[] = [];
    tags.forEach((t) => {
      t.endpoints.forEach((ep) => {
        if (ep.enabled) list.push(ep);
      });
    });
    return list;
  }, [tags]);

  const enabledCount = enabledEndpoints.length;

  return {
    specSource,
    setSpecSource,
    outputDir,
    tags,
    setTags,
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
  };
}
