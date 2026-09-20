// Elevvisning — kortets standard.
//
// Den almindelige bruger er en elev, der skal slå ét tal op. Derfor viser kortet
// som udgangspunkt kun opskriften, albedokortet og opslaget. Alt andet — de øvrige
// værktøjer, dato, øvrige lag, scene-log og baggrundsmærkat — ligger bag
// «Flere værktøjer» nederst i panelet. Valget huskes i browseren.
//
// Selve skjulningen sker i style.css via klassen `elevvisning` på <html>.

import { lagerNoegle } from './profiles.js';

const NOEGLE = lagerNoegle('sermilik_flere_vaerktoejer');
const rod = document.documentElement;

export function erElevvisning() {
  return rod.classList.contains('elevvisning');
}

function saet(flere) {
  rod.classList.toggle('elevvisning', !flere);
  const knap = document.getElementById('vis-flere');
  if (knap) knap.textContent = flere ? 'Færre værktøjer' : 'Flere værktøjer';
  try { localStorage.setItem(NOEGLE, flere ? '1' : '0'); } catch { /* fuldt lager */ }
  // Kortet skal kende sin nye størrelse, hvis kontroller dukker op eller forsvinder
  window.dispatchEvent(new Event('resize'));
}

export function initElevvisning() {
  let flere = false;
  try { flere = localStorage.getItem(NOEGLE) === '1'; } catch { /* privat vindue */ }
  saet(flere);
  const knap = document.getElementById('vis-flere');
  if (knap) knap.addEventListener('click', () => saet(erElevvisning()));
}
