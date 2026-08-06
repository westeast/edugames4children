// tts.js — 中文语音播报（大风地图记者），复用 gomoku/weiqi 的优选女声策略
let ttsVoices = [];

function loadTTSVoices() {
  if ('speechSynthesis' in window) {
    ttsVoices = speechSynthesis.getVoices();
  }
}
if ('speechSynthesis' in window) {
  loadTTSVoices();
  speechSynthesis.onvoiceschanged = loadTTSVoices;
}

// 优选中文女声：在线自然(神经) > 苹果婷婷/欣怡/美嘉 > Google > 优选女声
function pickChineseVoice() {
  const voices = (ttsVoices && ttsVoices.length) ? ttsVoices : (window.speechSynthesis ? speechSynthesis.getVoices() : []);
  const matches = voices.filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith('zh'));
  if (!matches.length) return null;

  const score = (v) => {
    const n = v.name || '';
    let s = 0;
    if (/natural|online|neural|premium|enhanced/i.test(n)) s += 100;
    if (/tingting|sinji|meijia|mei-jia/i.test(n)) s += 90;   // 苹果中文女声
    if (/google/i.test(n)) s += 60;
    if (/xiaoxiao|huihui|yaoyao|kangkang|aria|jenny|zira|anna/i.test(n)) s += 50;
    if (/female/i.test(n)) s += 20;
    return s;
  };
  return matches.slice().sort((a, b) => score(b) - score(a))[0];
}

// 朗读中文文本，可选开始/结束回调（字幕气泡显示/隐藏）
export function speakChinese(text, onstart, onend) {
  if (!('speechSynthesis' in window)) {
    if (onend) onend();
    return;
  }
  try { speechSynthesis.cancel(); } catch (e) {}

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.volume = 1.0;
  utterance.rate = 0.9;      // 稍慢、清晰
  utterance.pitch = 1.15;    // 略偏高，活泼（记者语气）
  const voice = pickChineseVoice();
  if (voice) utterance.voice = voice;
  if (onstart) utterance.onstart = onstart;
  if (onend) utterance.onend = onend;
  speechSynthesis.speak(utterance);
}

// 大风地图记者播报台词
export const WIND_CRASH_LINE = '哇哇哇哇哇，看看这几级风，牛二又被吹跑了，朋友们，牛二站在山里面呢，哎呦，完了完了完了完了，牛二炸机了';

// 字幕气泡显示/隐藏
function showSubtitle(text) {
  const bubble = document.getElementById('subtitleBubble');
  if (!bubble) return;
  const txt = document.getElementById('subtitleText');
  if (txt) txt.textContent = text;
  bubble.style.display = 'block';
}
function hideSubtitle() {
  const bubble = document.getElementById('subtitleBubble');
  if (bubble) bubble.style.display = 'none';
}

// 记者播报风坠事件（Neo 2 被吹飞摔毁时由 game.js watcher 调用）
export function speakWindCrash() {
  speakChinese(WIND_CRASH_LINE, () => showSubtitle(WIND_CRASH_LINE), hideSubtitle);
}
