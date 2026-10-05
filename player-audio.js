/* Local playback only: a modest 10% gain, with peak compression. */
(function () {
  const players = new WeakMap();
  window.FARPlayerAudio = {
    async prepare(audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      let graph = players.get(audio);
      if (!graph) {
        let context, source;
        try {
          audio.crossOrigin = 'anonymous';
          context = new AudioContext();
          const gain = context.createGain();
          const peaks = context.createDynamicsCompressor();
          gain.gain.value = 1.1;
          peaks.threshold.value = -1;
          peaks.knee.value = 0;
          peaks.ratio.value = 20;
          peaks.attack.value = 0.003;
          peaks.release.value = 0.1;
          gain.connect(peaks);
          peaks.connect(context.destination);
          source = context.createMediaElementSource(audio);
          source.connect(gain);
          graph = { context };
          players.set(audio, graph);
        } catch (_) {
          // Once captured, media must retain an output even if setup fails.
          if (source) {
            source.disconnect();
            source.connect(context.destination);
            graph = { context };
            players.set(audio, graph);
          } else if (context) {
            context.close().catch(() => {});
          }
          if (!graph) return;
        }
      }
      try { await graph.context.resume(); } catch (_) {}
    }
  };
})();
