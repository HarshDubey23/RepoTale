// Speaks narration with Kokoro-82M, an open neural voice, entirely in the browser. Runs in a worker
// so the film keeps animating while sentences are being made.
// shortcut: always the 8-bit model on WebAssembly (about 90 MB, cached after the first visit).
// WebGPU with fp32 is faster but a 330 MB download; offer it when downloads are cheap.
import { KokoroTTS } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';

let tts = null;
const load = () => tts ??= KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8', device: 'wasm',
  progress_callback: p => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) postMessage({ type: 'loading', progress: p.progress / 100 }); },
});

onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await load(); postMessage({ type: 'ready' }); return; }
    if (data.type === 'say') {
      const model = await load();
      const out = await model.generate(data.text, { voice: data.voice, speed: data.speed ?? 1 });
      const audio = out.audio;
      postMessage({ type: 'audio', id: data.id, audio, rate: out.sampling_rate }, [audio.buffer]);
    }
  } catch (e) {
    postMessage({ type: 'error', id: data.id, message: String(e?.message ?? e) });
  }
};
