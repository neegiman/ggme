# Local QR encoder and decoder

`qrcode-generator.mjs` is an unmodified copy of
[qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator),
`js/dist/qrcode.mjs`, at commit
`83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8`.

Copyright Kazuhiko Arase. See `qrcode-generator.LICENSE` (MIT).
It is served from this repository; browsers make no external QR requests.

`jsqr.mjs` contains [jsQR](https://github.com/cozmo/jsQR), `dist/jsQR.js`,
at commit `8e6a036beafa7053dd44b1b76ac578d22b1b3311`.
The upstream UMD source is unchanged; a local CommonJS object and ESM default
export wrap it so Vanilla JavaScript modules can use it without a bundler.
See `jsqr.LICENSE` (Apache-2.0). The same upstream decoder is also retained
under `tests/vendor/` for encoder verification. The runtime decoder processes
camera frames and user-selected images locally; no QR or video is uploaded.
