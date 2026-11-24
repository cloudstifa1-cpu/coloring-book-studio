// AI Helper tab: chat with a small free AI for themes, book plans and better scene prompts.
import { QUICK, cleanHistory, parseIdeas, stripIdeas, bulletIdeas, stripBullets } from './lib/assistant.js';
import { askText } from './engines.js';

const STORE = 'cbs-helper-chat';

export function initHelper({ $, getContext, onUse, onBatch }) {
  let history = [];
  let sending = false;
  try { history = cleanHistory(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch { history = []; }

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(history.slice(-40))); } catch {} };
  const status = (msg, err = false) => { $('hStatus').textContent = msg; $('hStatus').classList.toggle('error', err); };

  function bubble(m) {
    const div = document.createElement('div');
    div.className = 'msg ' + m.role;
    const who = document.createElement('b');
    who.textContent = m.role === 'user' ? 'You' : 'Helper';
    const p = document.createElement('p');
    let ideas = m.role === 'assistant' ? parseIdeas(m.content) : [];
    const bullets = m.role === 'assistant' && !ideas.length ? bulletIdeas(m.content) : [];
    if (bullets.length > 1) ideas = bullets;   // offline models: bullet list → idea buttons
    p.textContent = m.role === 'assistant' ? ((bullets.length > 1 ? stripBullets(m.content) : stripIdeas(m.content)) || 'Here are some ideas:') : m.content;
    div.append(who, p);
    if (m.role === 'assistant') {
      for (const idea of ideas) {
        const b = document.createElement('button');
        b.className = 'idea';
        b.textContent = '✏️ ' + idea;
        b.onclick = () => onUse(idea);
        div.appendChild(b);
      }
      if (ideas.length > 1) {
        const all = document.createElement('button');
        all.className = 'big primary full';
        all.textContent = `Batch all ${ideas.length} ideas`;
        all.onclick = () => onBatch(ideas);
        div.appendChild(all);
      }
    }
    return div;
  }

  function render() {
    const log = $('hLog');
    log.replaceChildren(...history.map(bubble));
    $('hEmpty').hidden = history.length > 0;
    log.scrollTop = log.scrollHeight;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || sending) return;
    sending = true;
    $('hSend').disabled = true;
    history.push({ role: 'user', content: text });
    $('hInput').value = '';
    render();
    status('Helper is thinking…');
    try {
      const data = await askText(history, getContext());
      history.push({ role: 'assistant', content: data.reply });
      status(data.source === 'pollinations' ? 'Answered by the free backup AI.' : data.source === 'offline' ? 'Answered by your offline model.' : '');
    } catch (e) {
      history.pop();              // let them resend the same message
      $('hInput').value = text;
      status(e.message || 'No connection. Try again.', true);
    } finally {
      sending = false;
      $('hSend').disabled = false;
      save();
      render();
    }
  }

  $('hSend').onclick = () => send($('hInput').value);
  $('hThemes').onclick = () => send(QUICK.themes);
  $('hBook').onclick = () => send(QUICK.book);
  $('hImprove').onclick = () => {
    const scene = getContext().subject;
    if (!scene) { status('Type a scene on the Make a Page tab first, then tap this.', true); return; }
    send(QUICK.improve + scene);
  };
  $('hClear').onclick = () => {
    if (!confirm('Clear the helper chat?')) return;
    history = []; save(); render(); status('');
  };
  render();
  return { send, render, get history() { return history; } };
}
