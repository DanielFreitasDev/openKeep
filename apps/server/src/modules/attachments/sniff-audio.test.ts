import { describe, expect, it } from 'vitest';
import { sniffAudio } from './service.js';

const pad = (b: Buffer, len = 16) => Buffer.concat([b, Buffer.alloc(Math.max(0, len - b.length))]);

const EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
/** EBML header, then the codec ids the way a Tracks element carries them. */
const webm = (...codecs: string[]) =>
  pad(Buffer.concat([EBML, Buffer.from('\x42\x86\x81\x01webm'), Buffer.from(codecs.join('\0'))]));

describe('sniffAudio', () => {
  it.each([
    ['mp3 with ID3 tag', pad(Buffer.from('ID3')), 'audio/mpeg', 'mp3'],
    ['mp3 frame sync', pad(Buffer.from([0xff, 0xfb, 0x90, 0x00])), 'audio/mpeg', 'mp3'],
    ['aac ADTS', pad(Buffer.from([0xff, 0xf1, 0x50, 0x80])), 'audio/aac', 'aac'],
    ['ogg', pad(Buffer.from('OggS')), 'audio/ogg', 'ogg'],
    [
      'm4a (ftypM4A)',
      pad(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A ')])),
      'audio/mp4',
      'm4a',
    ],
    [
      '3gp (ftyp3gp4)',
      pad(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp3gp4')])),
      'audio/3gpp',
      '3gp',
    ],
    [
      'wav (RIFF/WAVE)',
      pad(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])),
      'audio/wav',
      'wav',
    ],
    ['amr', pad(Buffer.from('#!AMR\n')), 'audio/amr', 'amr'],
    // What MediaRecorder hands us in Chrome.
    ['webm/opus', webm('A_OPUS'), 'audio/webm', 'webm'],
    ['webm/vorbis', webm('A_VORBIS'), 'audio/webm', 'webm'],
  ])('detects %s', (_name, buffer, mime, ext) => {
    expect(sniffAudio(buffer)).toEqual({ mime, ext });
  });

  it.each([
    ['png image', pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
    ['jpeg image', pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))],
    ['plain text', pad(Buffer.from('hello world'))],
    ['too short', Buffer.from('ID3')],
    ['empty', Buffer.alloc(0)],
    // The container is the same one Chrome records into; a video track is
    // what keeps this out of an <audio> element.
    ['webm carrying video', webm('V_VP9', 'A_OPUS')],
    ['webm with no declared codec', webm()],
  ])('rejects %s', (_name, buffer) => {
    expect(sniffAudio(buffer)).toBeNull();
  });
});
