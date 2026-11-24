// Models tab: search the phone for AI models, pick which one makes pictures and runs the AI Helper,
// download a small offline model, or add a model file already on the phone.
import { DOWNLOADS, options, loadChoice, saveChoice, mergeFound, cleanBase, sizeText } from './lib/models.js';
import { scanAll, downloadModel, addFile, askText } from './engines.js';

export function initModels({ $ }) {
  let choice = loadChoice();
  let busy = false;
  const msg = (t, err = false) => { $('mStatus').textContent = t; $('mStatus').classList.toggle('error', err); };

  function render() {
    choice = loadChoice();
    const o = options(choice);
    $('mPicture').replaceChildren(...o.picture.map(x => new Option(x.name, x.id)));
    $('mText').replaceChildren(...o.text.map(x => new Option(x.name, x.id)));
    $('mPicture').value = choice.picture; $('mText').value = choice.text;
    $('mCustomList').textContent = choice.custom.length ? 'Extra addresses: ' + choice.custom.join(', ') : '';
    const mem = navigator.deviceMemory;
    $('mPhone').textContent = (mem ? `This phone reports about ${mem} GB of memory. ` : '') +
      'Small text models (under 1 GB) can run on a 4 GB phone. Picture models need a picture app running on the phone or a computer.';
  }

  async function run(btn, fn) {
    if (busy) return;
    busy = true; btn.disabled = true;
    try { await fn(); } catch (e) { msg(e && e.message || String(e), true); }
    finally { busy = false; btn.disabled = false; }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : sizeText(a));

  async function search() {
    msg('Searching this phone for AI models…');
    const { found, notes } = await scanAll(choice.custom);
    choice = mergeFound(loadChoice(), found);
    saveChoice(choice);
    render();
    msg(notes.join(' '));
  }

  $('mPicture').onchange = e => { choice = loadChoice(); choice.picture = e.target.value; saveChoice(choice); msg('Picture maker saved.'); };
  $('mText').onchange = e => { choice = loadChoice(); choice.text = e.target.value; saveChoice(choice); msg('AI Helper model saved.'); };
  $('mSearch').onclick = () => run($('mSearch'), search);

  $('mAddAddress').onclick = () => run($('mAddAddress'), async () => {
    const base = cleanBase($('mAddress').value);
    if (!base) throw new Error('Type an address like 192.168.1.20:11434');
    choice = loadChoice();
    if (!choice.custom.includes(base)) choice.custom.push(base);
    saveChoice(choice); $('mAddress').value = '';
    await search();
  });

  $('mFile').onchange = e => run($('mFileBtn'), async () => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    msg(`Adding ${f.name} (${sizeText(f.size)})…`);
    await addFile(f, (a, b) => msg(`Adding ${f.name}: ${pct(a, b)}`));
    await search();
    const id = 'file|' + f.name;
    choice = loadChoice(); choice.text = id; saveChoice(choice); render();
    msg(`${f.name} added and picked for the AI Helper. It works offline.`);
  });
  $('mFileBtn').onclick = () => $('mFile').click();

  const list = $('mDownloads');
  list.replaceChildren(...DOWNLOADS.map(d => {
    const b = document.createElement('button');
    b.className = 'big full';
    b.textContent = `Download ${d.name} — ${d.mb} MB`;
    b.onclick = () => run(b, async () => {
      if (!confirm(`Download ${d.mb} MB? Use Wi-Fi if your phone plan has a data limit.`)) return;
      msg(`Downloading ${d.name}…`);
      await downloadModel(d.url, (a, t) => msg(`Downloading ${d.name}: ${pct(a, t)}`));
      await search();
      choice = loadChoice(); choice.text = 'download|' + d.url; saveChoice(choice); render();
      msg(`${d.name} downloaded and picked for the AI Helper. It works offline.`);
    });
    return b;
  }));

  $('mTest').onclick = () => run($('mTest'), async () => {
    msg('Testing the AI Helper model… (the first run of an offline model can take a minute)');
    const t = Date.now();
    const { reply } = await askText([{ role: 'user', content: 'Say hello in five words.' }]);
    msg(`Works (${Math.round((Date.now() - t) / 1000)} s): ${reply.slice(0, 120)}`);
  });

  render();
  return { render };
}
