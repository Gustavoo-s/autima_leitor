
// Camera ownership and decoding are managed independently from React renders.
export function createScannerController(options, environment = globalThis) {
  const { video, loadLibrary, onState, onRead } = options;
  const media = environment.navigator.mediaDevices;
  let revision = 0, closed = false, stream = null, reader = null, detector = null;
  let thoroughReader = null, scanFrame = 0;
  let timer = null, queue = Promise.resolve(), delivered = false, library = null;
  const delay = ms => new Promise(resolve => environment.setTimeout(resolve, ms));
  const current = id => !closed && revision === id && !delivered;
  const emit = state => { if (!closed) onState(state); };
  const stopTracks = value => value && value.getTracks().forEach(track => track.stop());
  function release() {
    if (timer !== null) environment.clearTimeout(timer);
    timer = null;
    const previous = stream;
    stream = null;
    stopTracks(previous);
    // A late operation must never detach a newer camera.
    if (previous && video.srcObject === previous) {
      video.pause();
      video.srcObject = null;
    }
    if (reader && typeof reader.reset === 'function') { try { reader.reset(); } catch {} }
    reader = null;
    thoroughReader = null;
    scanFrame = 0;
    detector = null;
  }
  function pause() {
    revision++;
    release();
  }
  function deliver(code, id) {
    code = String(code || '').trim();
    if (!current(id) || !code) return;
    delivered = true;
    release();
    onRead(code);
  }
  async function configure(track) {
    // Some mobile cameras expose these methods but throw when called.
    try {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch {}
  }
  async function makeDecoders(id, loading) {
    library = await loading;
    if (!current(id)) return;
    if (library) {
      // DecodeHintType: POSSIBLE_FORMATS=2, TRY_HARDER=3 in the bundled ZXing library.
      const formats = ['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','CODE_93','ITF','CODABAR']
        .map(name => library.BarcodeFormat[name]).filter(value => value !== undefined);
      reader = new library.BrowserMultiFormatReader(new Map([[2, formats]]));
      thoroughReader = new library.BrowserMultiFormatReader(new Map([[2, formats], [3, true]]));
    }
    try {
      const Detector = environment.BarcodeDetector;
      if (Detector) {
        const supported = await Detector.getSupportedFormats();
        if (!current(id)) return;
        const formats = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','code_93','itf','codabar']
          .filter(format => supported.includes(format));
        if (formats.length) detector = new Detector({ formats });
      }
    } catch {}
    if (!reader && !detector) throw new Error('Nao foi possivel carregar o leitor. Verifique a internet e tente novamente.');
  }
  async function scan(id) {
    if (!current(id)) return;
    let code = '';
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      if (detector) {
        try {
          const results = await detector.detect(video);
          if (results.length) code = results[0].rawValue;
        } catch {}
      }
      if (!current(id)) return;
      if (!code && reader) {
        const decoder = scanFrame++ % 2 === 0 ? reader : thoroughReader;
        try { code = decoder.decode(video).getText(); } catch {}
      }
    }
    if (!current(id)) return;
    if (code) { deliver(code, id); return; }
    // A missing barcode or a transient bad video frame never terminates scanning.
    timer = environment.setTimeout(() => { scan(id); }, 60);
  }
  function message(error) {
    const messages = {
      NotAllowedError: 'Permita o acesso a camera nas configuracoes do navegador.',
      NotReadableError: 'A camera esta ocupada. Feche outros aplicativos ou escolha outra camera.',
      NotFoundError: 'Camera nao encontrada. Escolha outra camera.',
      OverconstrainedError: 'Esta camera nao esta disponivel. Escolha outra camera.',
      AbortError: 'A camera foi interrompida. Tente abrir novamente.'
    };
    return messages[error.name] || error.message || 'Nao foi possivel abrir a camera.';
  }
  function start(cameraId = '') {
    const id = ++revision;
    release();
    emit({ busy: true, running: false, error: '', status: 'Preparando a camera...' });
    // Import in parallel with camera startup, without changing lens release timing.
    const loading = Promise.resolve().then(loadLibrary).catch(() => null);
    queue = queue.catch(() => {}).then(async () => {
      if (!current(id)) return;
      // Give mobile camera drivers time to release the previous lens.
      await delay(220);
      if (!current(id)) return;
      const constraints = { audio: false, video: {
        ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1280 }, height: { ideal: 720 }
      }};
      let acquired;
      try {
        try {
          acquired = await media.getUserMedia(constraints);
        } catch (error) {
          if (!current(id)) return;
          if (cameraId && ['OverconstrainedError','NotFoundError'].includes(error.name)) {
            try { environment.localStorage.removeItem('autima.scanner.camera'); } catch {}
            acquired = await media.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
          } else if (error.name === 'NotReadableError' || error.name === 'AbortError') {
            await delay(400);
            if (!current(id)) return;
            acquired = await media.getUserMedia(constraints);
          } else { throw error; }
        }
        if (!current(id)) { stopTracks(acquired); return; }
        stream = acquired;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        let playError = null;
        video.play().catch(error => { playError = error; });
        const deadline = Date.now() + 7000;
        while (current(id) && (video.paused || !(video.readyState >= 2 && video.videoWidth && video.videoHeight))) {
          if (playError) throw playError;
          if (Date.now() > deadline) throw new Error('A camera nao enviou imagem. Escolha outra camera ou tente novamente.');
          await delay(40);
        }
        if (!current(id)) return;
        const track = stream.getVideoTracks()[0];
        await configure(track);
        if (!current(id)) return;
        const actual = track.getSettings ? track.getSettings().deviceId || cameraId : cameraId;
        let cameras = [];
        try { cameras = (await media.enumerateDevices()).filter(device => device.kind === 'videoinput'); } catch {}
        if (!current(id)) return;
        try { if (actual) environment.localStorage.setItem('autima.scanner.camera', actual); } catch {}
        emit({ cameras, cameraId: actual });
        await makeDecoders(id, loading);
        if (!current(id)) return;
        emit({ busy: false, running: true, status: 'Aponte para o codigo inteiro, com boa luz. Afaste um pouco se estiver desfocado.' });
        scan(id);
      } catch (error) {
        if (!current(id)) return;
        release();
        emit({ busy: false, running: false, error: message(error), status: 'A camera nao iniciou.' });
      }
    });
    return queue;
  }
  async function photo(file) {
    pause();
    const id = revision;
    emit({ busy: true, running: false, error: '', status: 'Lendo codigo na foto...' });
    let url, imageReader;
    try {
      const lib = await loadLibrary();
      if (!current(id)) return;
      imageReader = new lib.BrowserMultiFormatReader(new Map([[3, true]]));
      url = environment.URL.createObjectURL(file);
      const result = await imageReader.decodeFromImageUrl(url);
      deliver(result.getText(), id);
    } catch {
      if (current(id)) emit({ error: 'Nao foi possivel ler a foto. Mostre todas as barras com boa luz.', status: 'Tente outra foto ou reinicie a camera.' });
    } finally {
      if (url) environment.URL.revokeObjectURL(url);
      if (imageReader && typeof imageReader.reset === 'function') { try { imageReader.reset(); } catch {} }
      if (current(id)) emit({ busy: false });
    }
  }
  return {
    start, photo, pause,
    close() { closed = true; pause(); }
  };
}
