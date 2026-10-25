// Knowledge card system (real data, unlocked by missions)
import { KNOWLEDGE_CARDS, state } from './config.js';
import { showKnowledgeCard, showKnowledgeLibrary as showLibrary } from './ui.js';

// === Show a knowledge card (after mission complete) ===
export function unlockKnowledgeCard(cardId) {
  const card = KNOWLEDGE_CARDS[cardId];
  if (!card) return;
  showKnowledgeCard(card);
}

// === Show all unlocked knowledge cards (library) ===
export function showKnowledgeLibrary() {
  const unlocked = state.knowledgeUnlocked.map(id => KNOWLEDGE_CARDS[id]).filter(Boolean);
  showLibrary(unlocked);
}

// === Check if a card is unlocked ===
export function isCardUnlocked(cardId) {
  return state.knowledgeUnlocked.includes(cardId);
}
