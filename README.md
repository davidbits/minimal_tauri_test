# minimal_tauri_test

Minimal Tauri + React + Three.js app for checking whether macOS Intel WebGL
context loss is a broader WKWebView/Tauri issue rather than FERS-specific scene
logic.

## What it does

- Probes `webgl2`, `webgl`, and `experimental-webgl` on a temporary canvas
- Attaches `webglcontextlost`, `webglcontextrestored`, and
  `webglcontextcreationerror` listeners to the visible canvas
- Constructs a bare `THREE.WebGLRenderer`
- Renders a single rotating cube with no React Three Fiber and no scene assets
- Offers a second "conservative" renderer mode to check whether the issue is
  sensitive to renderer attributes

## Run

```bash
bun tauri dev
```

## Expected interpretation

- If this project also logs immediate context loss or fails during bare
  `THREE.WebGLRenderer` construction on Intel macOS, the problem is not
  specific to FERS scene code.
- If this project works while FERS fails, the next focus should shift back to
  renderer options, scene setup, or React Three Fiber integration inside FERS.
