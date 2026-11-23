rnnoise (WebAssembly build)

Source:   npm package @timephy/rnnoise-wasm, version 1.0.0 (https://github.com/timephy/rnnoise-wasm), fetched with `npm pack @timephy/rnnoise-wasm@1.0.0`
License:  the package is Apache-2.0 (see LICENSE). It wraps rnnoise (https://gitlab.xiph.org/xiph/rnnoise), which is BSD-3-Clause licensed; the compiled rnnoise code is embedded in dist/generated/rnnoise-sync.js.
Contents: dist/ is the package's dist directory, unmodified. SHA256SUMS lists every file.

The WebAssembly binary is inlined as base64 in dist/generated/rnnoise-sync.js, so loading needs no network and no separate .wasm fetch.
dist/generated/rnnoise-sync.js is a self-contained ES module (default export: async factory returning the module with _malloc, _free, _rnnoise_create, _rnnoise_destroy, _rnnoise_process_frame and HEAPF32). It loads in Node, a Worker or an AudioWorkletGlobalScope via addModule.
The other dist files use extensionless relative imports and expect a bundler; wireweave's src/vad/rnnoise-loader.js imports only the generated module.

rnnoise needs 48 kHz mono float PCM in 480-sample frames, scaled by 32768 before the call; process_frame returns a 0 to 1 voice probability.
Do not edit files here. To upgrade, re-run the fetch and regenerate SHA256SUMS.
