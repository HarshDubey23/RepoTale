// Narration. Kokoro runs locally and is free (English); ElevenLabs is optional and speaks Hindi and
// many other languages. Clips are cached by content, so re-rendering after a visual fix costs nothing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { duration } from './ffmpeg.ts';

export interface Voice { provider: 'kokoro' | 'elevenlabs' | 'none'; voice?: string; speed?: number }
export interface Clip { file?: string; seconds: number }

let kokoro: any;

export async function speak(text: string, v: Voice, cacheDir: string): Promise<Clip> {
  // Silent mode still needs a believable length so scenes are paced: ~2.6 words a second.
  if (v.provider === 'none') return { seconds: Math.max(2.5, text.split(/\s+/).length / 2.6) };
  mkdirSync(cacheDir, { recursive: true });
  const key = createHash('sha256').update(JSON.stringify([v, text])).digest('hex').slice(0, 16);
  const file = join(cacheDir, `${key}.${v.provider === 'kokoro' ? 'wav' : 'mp3'}`);
  if (!existsSync(file)) {
    if (v.provider === 'kokoro') {
      if (!kokoro) {
        const { KokoroTTS } = await import('kokoro-js');
        kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
      }
      const audio = await kokoro.generate(text, { voice: v.voice ?? 'am_michael', speed: v.speed ?? 1 });
      await audio.save(file);
    } else {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error('voice.provider is "elevenlabs" but ELEVENLABS_API_KEY is not set');
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.voice ?? 'JBFqnCBsd6RMkjVDRZzb'}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: v.speed ?? 1 } }),
      });
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
  }
  return { file, seconds: duration(file) };
}
