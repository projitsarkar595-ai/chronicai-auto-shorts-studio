const platformHosts = {
  Facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'],
  Instagram: ['instagram.com', 'www.instagram.com'],
  YouTube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']
};

export function getAuthorizedVideoSource(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const platform = Object.entries(platformHosts).find(([, hosts]) => hosts.includes(host))?.[0];
  if (!platform) return null;

  if (platform === 'YouTube') {
    const hasVideoId = /^\/(shorts|live|embed)\/[^/]+\/?$/.test(url.pathname);
    const isWatchUrl = url.pathname === '/watch' && Boolean(url.searchParams.get('v'));
    const isShortUrl = host === 'youtu.be' && /^\/[^/]+\/?$/.test(url.pathname);
    return hasVideoId || isWatchUrl || isShortUrl ? platform : null;
  }

  if (platform === 'Instagram' && !/^\/(p|reel|reels|tv)\/[^/]+\/?$/.test(url.pathname)) return null;
  if (platform === 'Facebook' && url.pathname === '/') return null;
  return platform;
}
