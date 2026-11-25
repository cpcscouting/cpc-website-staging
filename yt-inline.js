/* Click-to-play YouTube: cards marked data-yt (video) or data-yt-list (playlist) turn into the player in place.
   Nothing loads from YouTube until someone clicks; uses youtube-nocookie (privacy-enhanced mode). */
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('[data-yt],[data-yt-list]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  var id = a.getAttribute('data-yt'), list = a.getAttribute('data-yt-list');
  var src = 'https://www.youtube-nocookie.com/embed/' + (id ? id + '?' : 'videoseries?list=' + list + '&') + 'autoplay=1&rel=0&modestbranding=1&playsinline=1';
  var cs = getComputedStyle(a), w = document.createElement('div');
  w.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 10px 24px rgba(0,20,51,.25)';
  if (cs.maxWidth && cs.maxWidth !== 'none') w.style.maxWidth = cs.maxWidth;
  var f = document.createElement('iframe');
  f.src = src; f.title = a.getAttribute('data-yt-title') || 'YouTube video';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
  f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
  w.appendChild(f); a.replaceWith(w);
});
