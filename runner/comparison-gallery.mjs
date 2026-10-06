import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function montage({ out, items, width = 640, height = 480, columns = 3, crop }) {
  if (!items.length) throw new Error('Empty montage');
  const filter = items.map((_,i) => `[${i}:v]${crop ? 'crop='+crop+',' : ''}scale=${width}:${height}[v${i}]`).join(';') + ';'
    + items.map((_,i)=>`[v${i}]`).join('') + `xstack=inputs=${items.length}:layout=`
    + items.map((_,i)=>`${i%columns*width}_${Math.floor(i/columns)*height}`).join('|') + '[out]';
  await new Promise((resolve,reject) => {
    const p = spawn(ffmpeg, ['-y','-v','error',...items.flatMap(item=>['-i',item.path]),'-filter_complex',filter,'-map','[out]','-frames:v','1',out]);
    let error = ''; p.stderr.on('data', b=>error+=b); p.on('error',reject); p.on('close', code=>code===0?resolve():reject(new Error(error)));
  });
  await writeFile(out.replace(/\.png$/,'.json'), JSON.stringify({ image: out, columns, width, height, crop: crop??null, sourceOrder: items },null,2)+'\n');
  return out;
}
export async function makeGallery({ run, id }) {
  const dir = join(run,id), suite = JSON.parse(await readFile(join(dir,'assessment/suite.json'),'utf8'));
  const sections = [];
  for (const scenario of suite.results) {
    const capture = JSON.parse(await readFile(join(dir,'assessment',scenario.capture),'utf8'));
    const base = 'assessment/'+scenario.id;
    const video = capture.video ? relative(dir,capture.video).split('\\').join('/') : null;
    sections.push(`<details><summary>${escape(scenario.id)} — ${capture.observations.length} raw frames; raw capture exceptions ${capture.evaluatorErrors.length}</summary><p><a href="${escape(base+'/capture.json')}">Timestamped input/capture record</a>${video ? ' · <a href="'+escape(video)+'">Native real-time video</a>' : ' · Controlled-time screenshots, not native real-time video'} · See criterion review for exception-origin attribution.</p>${video ? '<video controls preload="metadata" width="640" src="'+escape(video)+'"></video>' : ''}<div class="grid">${capture.observations.map((o,i)=>`<figure><a href="${escape(base+'/'+o.file)}"><img loading="lazy" src="${escape(base+'/'+o.file)}" alt="${escape(o.label)}"></a><figcaption>${i}: ${escape(o.label)} · requested ${o.before.requestedMs}ms · held ${escape(o.held.join('+')||'none')}<br>${escape(o.visible.text)}</figcaption></figure>`).join('')}</div></details>`);
  }
  await writeFile(join(dir,'review-gallery.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(id)} unchanged submission: evidence gallery</title><style>body{font:15px system-ui;background:#11202a;color:#eef6fc;padding:1rem}a{color:#8ad0ff}summary{cursor:pointer;font-size:1.2rem;margin:1rem 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:1rem}figure{margin:0;overflow-wrap:anywhere}img{width:100%;display:block}video{max-width:100%}figcaption{font-size:12px;padding:.4rem}</style><h1>${escape(id)} — unchanged submission evidence</h1><p>Raw screenshots, input timestamps and real-time videos. Controlled-time frame sequences are not represented as real-time recordings. No private game state or source-based behavioral grades.</p>${sections.join('')}</html>`);
  return join(dir,'review-gallery.html');
}
