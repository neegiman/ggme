# Independent QR decoder for tests

`jsQR.cjs` is an unmodified copy of
[jsQR](https://github.com/cozmo/jsQR), `dist/jsQR.js`, at commit
`8e6a036beafa7053dd44b1b76ac578d22b1b3311`.
The `.cjs` extension enables its upstream CommonJS export in our ESM project.

See `jsQR.LICENSE` (Apache-2.0). Used only by tests; excluded from `dist/`
and never imported by the application. No npm installation is required.
