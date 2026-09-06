/* 사진 저장소 — 형식 판별과 경로 안전 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PhotoStore, sniff } from './photo-store.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chorong-photo-'));
const photos = new PhotoStore(dir);
let fail = 0;
const t = (n, ok, note = '') => { if (!ok) { fail++; console.log(`  FAIL ${n} ${note}`); } else console.log(`  ok   ${n}`); };

const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(64)]);
const JPEG = pad([0xFF, 0xD8, 0xFF, 0xE0]);
const PNG  = pad([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const GIF  = pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64)]);

console.log('[형식 판별]');
t('jpeg', sniff(JPEG)?.ext === 'jpg');
t('png', sniff(PNG)?.ext === 'png');
t('gif', sniff(GIF)?.ext === 'gif');
t('webp', sniff(WEBP)?.ext === 'webp');

console.log('\n[사진이 아닌 것은 막는다]');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');
const PDF = Buffer.from('%PDF-1.7\n' + 'x'.repeat(64));
t('스크립트가 든 SVG 거부', sniff(SVG) === null);
t('HTML 거부', sniff(HTML) === null);
t('PDF 거부', sniff(PDF) === null);
t('짧은 쓰레기 거부', sniff(Buffer.from([1, 2, 3])) === null);

console.log('\n[mimetype 위조를 못 믿는다]');
// 브라우저가 image/jpeg 라고 말해도 내용이 SVG 면 거부해야 한다
let refused = false;
try { await photos.save(SVG); } catch { refused = true; }
t('내용이 사진이 아니면 저장 거부', refused);

console.log('\n[저장과 읽기]');
const saved = await photos.save(JPEG);
t('새 이름을 지어 준다', /^photo_[A-Za-z0-9]+\.jpg$/.test(saved.file), saved.file);
t('형식과 크기를 돌려준다', saved.type === 'image/jpeg' && saved.bytes === JPEG.length);
const opened = await photos.open(saved.file);
t('열 수 있다', opened && opened.type === 'image/jpeg');
t('없는 사진은 null', (await photos.open('photo_nope.jpg')) === null);

console.log('\n[폴더 밖으로 못 나간다]');
let blocked = false;
try { await photos.open('../../.env'); } catch { blocked = true; }
const escaped = blocked ? null : await photos.open('../../.env');
t('상위 경로 차단', blocked || escaped === null);

console.log('\n[지우기]');
t('지워진다', (await photos.remove(saved.file)) === true);
t('두 번 지워도 조용히', (await photos.remove(saved.file)) === false);

await fs.rm(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
