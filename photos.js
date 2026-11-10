// =============================================================
//  photos.js — the photo archive.
//  data/photos.json lists every photo in the museum with its
//  caption, photographer and licence (all from Wikimedia Commons,
//  free licences). Photos live in images/p/ so the site works
//  offline. You can override any stadium hero by dropping
//  images/stadium-<city>.jpg into the folder.
// =============================================================
import { slug } from './data.js';

let archive = null;
export async function loadPhotos() {
  if (archive) return archive;
  try { archive = await (await fetch('data/photos.json', { cache: 'no-cache' })).json(); }
  catch { archive = { stadiums: {}, matches: {}, reel: [] }; }
  return archive;
}
export const stadiumSet = ground => archive?.stadiums[slug(ground)] || null;
export const matchSet = num => archive?.matches[String(num)] || [];
export const reel = () => archive?.reel || [];

const exists = src => new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = src; });

// Hero photo for a stadium: your own file first, then the archive
const heroCache = new Map();
export function stadiumPhoto(ground) {
  if (!heroCache.has(ground)) heroCache.set(ground, (async () => {
    const own = `images/stadium-${slug(ground)}.jpg`;
    if (await exists(own)) return { src: own, caption: '', author: 'the exhibit team', license: '', page: null };
    return stadiumSet(ground)?.hero || null;
  })());
  return heroCache.get(ground);
}

export const credit = p => [p.author && `Photo: ${p.author}`, p.license].filter(Boolean).join(', ');
