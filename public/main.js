let sessionId = '';
let latest;
let timer;

const els = {
  join: document.querySelector('#join'),
  game: document.querySelector('#game'),
  room: document.querySelector('#room'),
  name: document.querySelector('#name'),
  joinBtn: document.querySelector('#joinBtn'),
  notice: document.querySelector('#notice'),
  meta: document.querySelector('#meta'),
  hand: document.querySelector('#hand'),
  players: document.querySelector('#players'),
  placeFlower: document.querySelector('#placeFlower'),
  placeSkull: document.querySelector('#placeSkull'),
  bidAmount: document.querySelector('#bidAmount'),
  bidBtn: document.querySelector('#bidBtn'),
  passBtn: document.querySelector('#passBtn'),
  flipOwnBtn: document.querySelector('#flipOwnBtn'),
};

els.joinBtn.onclick = async () => {
  const res = await fetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: els.room.value.trim(), name: els.name.value.trim() }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || '加入失败');
  sessionId = data.sessionId;
  if (timer) clearInterval(timer);
  await refresh();
  timer = setInterval(refresh, 1000);
};

async function refresh() {
  const res = await fetch(`/api/state?sessionId=${encodeURIComponent(sessionId)}`);
  const data = await res.json();
  if (!res.ok) return;
  latest = data.payload;
  render(data.notice || '', false);
}

async function send(type, payload = {}) {
  if (!sessionId) return alert('尚未连接服务器。');
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, type, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || '操作失败');
  await refresh();
}

els.placeFlower.onclick = () => send('place', { card: 'flower' });
els.placeSkull.onclick = () => send('place', { card: 'skull' });
els.bidBtn.onclick = () => send('bid', { amount: Number(els.bidAmount.value) });
els.passBtn.onclick = () => send('pass');
els.flipOwnBtn.onclick = () => send('flipOwn');

function render(notice = '', isError = false) {
  if (!latest) return;

  els.join.classList.add('hidden');
  els.game.classList.remove('hidden');
  els.notice.textContent = notice || '';
  els.notice.style.color = isError ? '#ff7878' : '#9cdcfe';

  const current = latest.players.find((p) => p.id === latest.currentPlayerId);
  const currentName = current ? current.name : latest.currentPlayerId;

  els.meta.innerHTML = `阶段：<strong>${latest.phase}</strong> | 当前行动：<strong>${currentName || '-'}</strong> | 当前叫牌：<strong>${latest.currentBid ?? '-'}</strong>`;

  els.hand.innerHTML = latest.yourHand
    .map((c, i) => `<span>${i + 1}. ${c === 'skull' ? '💀骷髅' : '🌸花牌'}</span>`)
    .join('<br/>');

  els.players.innerHTML = latest.players
    .map((p) => {
      const cards = p.stackTopVisible
        .map((c, idx) => (c === 'unknown' ? `🂠#${idx + 1}` : c === 'skull' ? `💀#${idx + 1}` : `🌸#${idx + 1}`))
        .join(' ');
      return `<div class="player">
        <div><strong>${p.name}</strong> ${p.eliminated ? '（出局）' : ''}</div>
        <div class="small">得分: ${p.score} | 手里剩余: ${p.handCount} | 桌上牌堆: ${p.stackCount} ${p.passed ? '| 已弃权' : ''}</div>
        <div>${cards || '（无）'}</div>
        <button onclick="flipTarget('${p.id}')">挑战时翻此玩家牌</button>
        <input id="flip-idx-${p.id}" type="number" min="1" max="${Math.max(p.stackCount, 1)}" placeholder="翻第几张" />
      </div>`;
    })
    .join('');
}

window.flipTarget = (targetPlayerId) => {
  const input = document.querySelector(`#flip-idx-${targetPlayerId}`);
  const index = Number(input?.value || 1) - 1;
  send('flip', { targetPlayerId, cardIndex: index });
};
