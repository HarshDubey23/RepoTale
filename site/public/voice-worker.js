// Speaks narration with Kokoro-82M, an open neural voice, entirely in the browser. Runs in a worker
// so the film keeps animating while sentences are being made. Served as a static file (public/), outside the
// bundle, because it imports the model runtime from a CDN at run time.
// On a graphics card it runs the full-precision model (about 330 MB, cached after the first visit),
// which sounds clearest and is fast; otherwise the 8-bit model on the CPU (about 90 MB).
import { KokoroTTS } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
// The same module instance kokoro-js loads: its runtime prints routine warnings as console errors otherwise.
import { env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm';
if (env.backends?.onnx) env.backends.onnx.logLevel = 'error';

let tts = null, mode = null;
const progress = p => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) postMessage({ type: 'loading', progress: p.progress / 100 }); };
async function load(gpu) {
  if (tts) return tts;
  if (gpu) {
    try {
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'webgpu', progress_callback: progress });
      mode = 'studio'; return tts;
    } catch { tts = null; }
  }
  tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm', progress_callback: progress });
  mode = 'standard'; return tts;
}

onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await load(data.gpu); postMessage({ type: 'ready', mode }); return; }
    if (data.type === 'say') {
      const model = await load(data.gpu);
      const out = await model.generate(data.text, { voice: data.voice, speed: data.speed ?? 1 });
      const audio = out.audio;
      postMessage({ type: 'audio', id: data.id, audio, rate: out.sampling_rate }, [audio.buffer]);
    }
  } catch (e) {
    postMessage({ type: 'error', id: data.id, message: String(e?.message ?? e) });
  }
};
