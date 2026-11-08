(() => {
  const videos = [...document.querySelectorAll('#rollouts video')];
  const status = document.getElementById('rollout-status');
  let request = 0;
  document.getElementById('replay-rollouts').addEventListener('click', async () => {
    const current = ++request;
    const results = await Promise.allSettled(videos.map(video => {
      video.pause(); video.currentTime = 0; video.muted = true;
      return video.play();
    }));
    if (current !== request) return;
    status.textContent = results.some(result => result.status === 'rejected')
      ? 'Some clips could not play. Use their individual play controls or download links.'
      : 'Playing all four clips from the start.';
  });
  document.getElementById('pause-rollouts').addEventListener('click', () => {
    request++; videos.forEach(video => video.pause()); status.textContent = 'All clips paused.';
  });
  videos.forEach(video => video.addEventListener('error', () => {
    status.textContent = 'A clip could not load. Try reloading the page.';
  }));
})();
