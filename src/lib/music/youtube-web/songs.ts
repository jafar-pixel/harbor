/** Reading artist and song out of YouTube video titles. Plain module, no I/O. */

/** "- Topic" and VEVO channels are the artist; channel names are the fallback artist. */
export function channelArtist(channel: string): string {
  return channel
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();
}

/** "Artist - Song (Official Video)" → { artist, title }; else the channel is the artist. */
export function songFromVideo(title: string, channel: string): { artist: string; title: string } {
  const clean = title
    .replace(
      /\s*[([](official|music|lyric|lyrics|audio|visuali[sz]er|video|hd|4k)[^)\]]*[)\]]/gi,
      "",
    )
    .trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  if (parts.length >= 2 && parts[0] && parts[1])
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: channelArtist(channel), title: clean };
}
