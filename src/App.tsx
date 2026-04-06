import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./App.css";

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  id: number;
  level: LogLevel;
  message: string;
};

type ProbeResult = {
  name: string;
  success: boolean;
  details: string;
};

type RendererMode = "default" | "conservative";

const RENDERER_OPTIONS: Record<
  RendererMode,
  THREE.WebGLRendererParameters & { powerPreference?: WebGLPowerPreference }
> = {
  default: {
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  },
  conservative: {
    antialias: false,
    alpha: true,
    depth: true,
    stencil: false,
    powerPreference: "default",
    precision: "mediump",
  },
};

function formatProbeDetails(context: WebGLRenderingContext | WebGL2RenderingContext) {
  const safeGetParameter = (parameter: number) => {
    try {
      return context.getParameter(parameter);
    } catch (error) {
      return `threw:${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const safeIsContextLost = () => {
    try {
      return String(context.isContextLost());
    } catch (error) {
      return `threw:${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const parts = [
    `version=${String(safeGetParameter(context.VERSION))}`,
    `renderer=${String(safeGetParameter(context.RENDERER))}`,
    `vendor=${String(safeGetParameter(context.VENDOR))}`,
  ];

  if ("isContextLost" in context) {
    parts.push(`lost=${safeIsContextLost()}`);
  }

  return parts.join(" | ");
}

function exerciseContext(context: WebGLRenderingContext | WebGL2RenderingContext) {
  const parts: string[] = [];

  try {
    context.viewport(0, 0, 1, 1);
    context.clearColor(0.25, 0.5, 0.75, 1);
    context.clear(context.COLOR_BUFFER_BIT);
    parts.push(`clearError=${String(context.getError())}`);
  } catch (error) {
    parts.push(
      `clearThrew=${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    parts.push(`postClearLost=${String(context.isContextLost())}`);
  } catch (error) {
    parts.push(
      `postClearLost=threw:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const vertexShader = context.createShader(context.VERTEX_SHADER);
    parts.push(`createShader=${vertexShader ? "ok" : "null"}`);
    if (vertexShader) {
      context.deleteShader(vertexShader);
    }
  } catch (error) {
    parts.push(
      `createShaderThrew=${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return parts.join(" | ");
}

function getWebGLContext(
  canvas: HTMLCanvasElement,
  contextName: "webgl2" | "webgl" | "experimental-webgl",
) {
  return canvas.getContext(contextName) as
    | WebGLRenderingContext
    | WebGL2RenderingContext
    | null;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const logIdRef = useRef(0);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [probeResults, setProbeResults] = useState<ProbeResult[]>([]);
  const [freshProbeResults, setFreshProbeResults] = useState<ProbeResult[]>([]);
  const [activeMode, setActiveMode] = useState<RendererMode>("default");

  const pushLog = (level: LogLevel, message: string) => {
    const nextEntry: LogEntry = {
      id: logIdRef.current,
      level,
      message,
    };

    logIdRef.current += 1;
    setLogs((current) => [...current, nextEntry]);
  };

  const disposeRenderer = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;

    rendererRef.current?.dispose();
    rendererRef.current = null;
  };

  const runProbe = (mode: RendererMode) => {
    disposeRenderer();
    setActiveMode(mode);
    setLogs([]);
    setProbeResults([]);
    setFreshProbeResults([]);
    logIdRef.current = 0;

    pushLog("info", `starting diagnostics with ${mode} renderer settings`);
    pushLog("info", `userAgent=${navigator.userAgent}`);
    pushLog("info", `platform=${navigator.platform}`);

    const rawProbeCanvas = document.createElement("canvas");
    const rawProbeNames = [
      "webgl2",
      "webgl",
      "experimental-webgl",
    ] as const;

    const nextProbeResults: ProbeResult[] = [];

    for (const contextName of rawProbeNames) {
      try {
        const context = getWebGLContext(rawProbeCanvas, contextName);

        if (context) {
          nextProbeResults.push({
            name: contextName,
            success: true,
            details: formatProbeDetails(context),
          });
          pushLog("info", `${contextName} probe succeeded`);
        } else {
          nextProbeResults.push({
            name: contextName,
            success: false,
            details: "getContext returned null",
          });
          pushLog("warn", `${contextName} probe returned null`);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        nextProbeResults.push({
          name: contextName,
          success: false,
          details: message,
        });
        pushLog("error", `${contextName} probe threw: ${message}`);
      }
    }

    setProbeResults(nextProbeResults);

    const nextFreshProbeResults: ProbeResult[] = [];

    for (const contextName of rawProbeNames) {
      try {
        const freshCanvas = document.createElement("canvas");
        const context = getWebGLContext(freshCanvas, contextName);

        if (context) {
          nextFreshProbeResults.push({
            name: contextName,
            success: true,
            details: `${formatProbeDetails(context)} | ${exerciseContext(context)}`,
          });
          pushLog("info", `${contextName} fresh-canvas probe succeeded`);
        } else {
          nextFreshProbeResults.push({
            name: contextName,
            success: false,
            details: "getContext returned null on a fresh canvas",
          });
          pushLog("warn", `${contextName} fresh-canvas probe returned null`);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        nextFreshProbeResults.push({
          name: contextName,
          success: false,
          details: message,
        });
        pushLog("error", `${contextName} fresh-canvas probe threw: ${message}`);
      }
    }

    setFreshProbeResults(nextFreshProbeResults);

    const canvas = canvasRef.current;
    if (!canvas) {
      pushLog("error", "visible canvas is not mounted");
      return;
    }

    const rendererOptions = {
      canvas,
      ...RENDERER_OPTIONS[mode],
    };

    try {
      const renderer = new THREE.WebGLRenderer(rendererOptions);
      rendererRef.current = renderer;

      const syncRendererSize = () => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(width, height, false);
      };

      syncRendererSize();
      window.addEventListener("resize", syncRendererSize);
      resizeCleanupRef.current = () => {
        window.removeEventListener("resize", syncRendererSize);
      };

      pushLog("info", "THREE.WebGLRenderer constructed successfully");
      pushLog(
        "info",
        `renderer capabilities: isWebGL2=${String(renderer.capabilities.isWebGL2)} precision=${renderer.capabilities.precision} maxTextures=${renderer.capabilities.maxTextures} maxSamples=${renderer.capabilities.maxSamples}`,
      );

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#10141f");

      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 0, 3);

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshNormalMaterial();
      const cube = new THREE.Mesh(geometry, material);
      scene.add(cube);

      const renderFrame = () => {
        const activeRenderer = rendererRef.current;
        if (!activeRenderer) {
          return;
        }

        cube.rotation.x += 0.01;
        cube.rotation.y += 0.02;

        activeRenderer.render(scene, camera);
        animationFrameRef.current = requestAnimationFrame(renderFrame);
      };

      renderFrame();
      pushLog("info", "render loop started");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushLog("error", `renderer construction failed: ${message}`);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      pushLog("error", "webglcontextlost fired on visible canvas");
    };

    const handleContextRestored = () => {
      pushLog("info", "webglcontextrestored fired on visible canvas");
    };

    const handleContextCreationError = (event: Event) => {
      const statusMessage =
        event instanceof WebGLContextEvent ? event.statusMessage : "";
      pushLog(
        "error",
        `webglcontextcreationerror fired${statusMessage ? `: ${statusMessage}` : ""}`,
      );
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    canvas.addEventListener(
      "webglcontextcreationerror",
      handleContextCreationError,
    );

    runProbe("default");

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      canvas.removeEventListener(
        "webglcontextcreationerror",
        handleContextCreationError,
      );
      disposeRenderer();
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="summary-card">
        <div>
          <p className="eyebrow">Minimal Tauri WebGL Test</p>
          <h1>WKWebView / WebGL sanity check</h1>
          <p className="lede">
            This app probes raw WebGL availability, then starts a bare
            Three.js renderer and a single rotating cube. If this loses the
            context on Intel macOS inside Tauri, the issue is broader than
            FERS-specific scene code.
          </p>
        </div>

        <div className="button-row">
          <button type="button" onClick={() => runProbe("default")}>
            Run default renderer test
          </button>
          <button type="button" onClick={() => runProbe("conservative")}>
            Run conservative renderer test
          </button>
        </div>
      </section>

      <section className="content-grid">
        <div className="canvas-card">
          <div className="canvas-header">
            <span>Visible canvas</span>
            <span className="mode-badge">{activeMode}</span>
          </div>
          <canvas ref={canvasRef} className="scene-canvas" />
        </div>

        <div className="panel-stack">
          <section className="panel">
            <h2>Raw context probe (same canvas)</h2>
            <div className="probe-list">
              {probeResults.map((result) => (
                <article key={result.name} className="probe-row">
                  <div className="probe-header">
                    <strong>{result.name}</strong>
                    <span data-success={result.success}>
                      {result.success ? "ok" : "failed"}
                    </span>
                  </div>
                  <p>{result.details}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Raw context probe (fresh canvas per mode)</h2>
            <div className="probe-list">
              {freshProbeResults.map((result) => (
                <article key={`fresh-${result.name}`} className="probe-row">
                  <div className="probe-header">
                    <strong>{result.name}</strong>
                    <span data-success={result.success}>
                      {result.success ? "ok" : "failed"}
                    </span>
                  </div>
                  <p>{result.details}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Event log</h2>
            <div className="log-list">
              {logs.map((entry) => (
                <div key={entry.id} className="log-entry" data-level={entry.level}>
                  <span className="log-level">{entry.level}</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
