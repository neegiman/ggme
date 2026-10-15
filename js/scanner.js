import jsQR from './vendor/jsqr.mjs';

export function scannerMarkup() {
  return `<div id="qr-reader"><p>참가자가 표시한 응답 QR을 한 명씩 읽어 주세요. 가져온 내용은 생성자의 입력칸에 반영되며 최종 확정은 직접 합니다.</p><video id="scan-video" class="scan-video" autoplay muted playsinline aria-label="응답 QR 카메라 미리보기" hidden></video><div class="response-actions"><button type="button" class="button primary" id="scan-start">카메라 켜기</button><button type="button" class="button secondary" id="scan-stop" disabled>카메라 끄기</button></div><p id="scan-status" class="scan-status" role="status" aria-live="polite">카메라를 켜거나 아래 이미지·응답 코드를 이용하세요.</p><label class="select-label" for="scan-file">QR 이미지에서 읽기<input id="scan-file" type="file" accept="image/*"></label><p class="field-help">응답 QR의 사진이나 화면 캡처를 선택하세요. 최대 20MB.</p><label class="select-label" for="scan-text">참가자의 응답 코드<textarea id="scan-text" class="manual-link" rows="3" placeholder="GGME-REPLY:1:…"></textarea></label><button type="button" class="button secondary full" id="scan-import">응답 코드 가져오기</button><p class="field-help">생성자 본인의 투표·추측은 기존 입력칸에 직접 입력해도 돼요.</p></div>`;
}

export class QRReader {
  constructor(root, onCode) {
    this.root = root; this.onCode = onCode; this.closed = false;
    this.video = root.querySelector('#scan-video');
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ticket = 0; this.readTicket = 0; this.stream = null; this.timer = null;
    this.starting = false; this.lastCode = '';
    this.visibility = () => { if (document.hidden) { this.stopCamera(); this.status('카메라를 껐어요. 다시 켜서 이어서 읽을 수 있어요.'); } };
    this.pagehide = () => this.stopCamera();
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.pagehide);
    root.querySelector('#scan-start').addEventListener('click', () => this.startCamera());
    root.querySelector('#scan-stop').addEventListener('click', () => { this.stopCamera(); this.status('카메라를 껐어요. 이미지·코드 가져오기는 계속 사용할 수 있어요.'); });
    root.querySelector('#scan-file').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) this.readFile(file); event.target.value = ''; });
    root.querySelector('#scan-import').addEventListener('click', () => this.accept(root.querySelector('#scan-text').value));
  }
  status(message, error = false) {
    if (this.closed) return;
    const node = this.root.querySelector('#scan-status');
    node.textContent = message; node.classList.toggle('scan-error', error);
  }
  buttons() {
    if (this.closed) return;
    this.root.querySelector('#scan-start').disabled = this.starting || !!this.stream;
    this.root.querySelector('#scan-stop').disabled = !this.starting && !this.stream;
  }
  async startCamera() {
    if (this.closed || this.starting || this.stream) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return this.status('카메라는 HTTPS 주소에서 사용할 수 있어요. QR 이미지나 응답 코드를 이용해 주세요.', true);
    const ticket = ++this.ticket;
    this.starting = true; this.lastCode = ''; this.buttons(); this.status('카메라 권한을 확인하고 있어요.');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (this.closed || ticket !== this.ticket) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream; this.video.srcObject = stream; this.video.muted = true; this.video.playsInline = true; this.video.hidden = false;
      await this.video.play();
      if (this.closed || ticket !== this.ticket) return;
      this.status('참가자의 응답 QR이 화면에 크게 보이도록 맞춰 주세요.'); this.scan();
    } catch (error) {
      if (stream && stream !== this.stream) stream.getTracks().forEach(track => track.stop());
      if (ticket !== this.ticket || this.closed) return;
      this.stopCamera();
      const message = error.name === 'NotAllowedError' ? '카메라 권한이 허용되지 않았어요.' : error.name === 'NotFoundError' ? '사용할 수 있는 카메라가 없어요.' : '카메라를 열지 못했어요.';
      this.status(`${message} QR 이미지나 응답 코드를 이용해 주세요.`, true);
    } finally { if (ticket === this.ticket) { this.starting = false; this.buttons(); } }
  }
  stopCamera() {
    this.ticket++; this.starting = false;
    clearTimeout(this.timer); this.timer = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null; this.video.hidden = true;
    this.buttons();
  }
  decode(source, width, height, maxEdge) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    this.canvas.width = Math.max(1, Math.round(width * scale));
    this.canvas.height = Math.max(1, Math.round(height * scale));
    this.context.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
    const pixels = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })?.data;
  }
  scan() {
    if (this.closed || !this.stream) return;
    try {
      if (this.video.readyState >= 2 && this.video.videoWidth && this.video.videoHeight) {
        const code = this.decode(this.video, this.video.videoWidth, this.video.videoHeight, 960);
        if (code && code !== this.lastCode) { this.lastCode = code; this.accept(code); }
      }
    } catch { this.stopCamera(); this.status('카메라 영상을 읽지 못했어요. 이미지·응답 코드를 이용해 주세요.', true); return; }
    this.timer = setTimeout(() => this.scan(), 200);
  }
  accept(code) {
    if (this.closed) return;
    try { this.status(this.onCode(code)); }
    catch (error) { this.status(error.message || '응답을 읽지 못했어요. 다시 확인해 주세요.', true); }
  }
  async readFile(file) {
    if (this.closed) return;
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) return this.status('20MB 이하의 QR 이미지를 선택해 주세요.', true);
    this.stopCamera(); const ticket = ++this.readTicket;
    this.status('이미지에서 QR을 읽고 있어요.');
    const url = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      if (this.closed || ticket !== this.readTicket) return;
      const code = this.decode(image, image.naturalWidth, image.naturalHeight, 2000);
      if (!code) throw new Error('QR을 찾지 못했어요. QR이 크게 보이는 사진이나 응답 코드를 이용해 주세요.');
      this.accept(code);
    } catch (error) { if (!this.closed && ticket === this.readTicket) this.status(error.message || '이미지를 열 수 없어요. 다른 QR 사진을 선택해 주세요.', true); }
    finally { URL.revokeObjectURL(url); }
  }
  dispose() {
    this.closed = true; this.readTicket++; this.stopCamera();
    this.canvas.width = this.canvas.height = 1;
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.pagehide);
  }
}
