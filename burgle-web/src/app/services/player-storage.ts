
const LS_KEY = 'burgle_player_name';

export function savePlayerName(name: string) {
  const clean = (name ?? '').trim();
  if (!clean) return;

  // localStorage
  localStorage.setItem(LS_KEY, clean);

  // cookie (1 év)
  const maxAge = 60 * 60 * 24 * 365 * 100;
  document.cookie = `burgle_player_name=${encodeURIComponent(clean)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

export function loadPlayerName(): string {
  // localStorage első
  const ls = localStorage.getItem(LS_KEY);
  if (ls && ls.trim()) return ls.trim();

  // cookie fallback
  const cookie = getCookie('burgle_player_name');
  return (cookie ?? '').trim();
}

function getCookie(name: string): string | null {
  const parts = document.cookie.split(';').map(c => c.trim());
  const found = parts.find(p => p.startsWith(name + '='));
  if (!found) return null;
  return decodeURIComponent(found.substring(name.length + 1));
}
