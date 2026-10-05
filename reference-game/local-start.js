/* Reference startup adapter. All character, collision and mechanism code stays upstream. */
(() => {
  const status = document.getElementById('status');
  const diagnostics = document.getElementById('diagnostics');
  const fail = (error) => {
    const text = String(error && (error.stack || error.message) || error);
    diagnostics.textContent += text + '\n';
    diagnostics.dataset.error = 'true';
    status.textContent = 'Level 2 could not load';
  };
  window.addEventListener('error', (event) => {
    if (event.message) fail(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => fail(event.reason));
  document.getElementById('restart').addEventListener('click', () => location.reload());
  window.open = () => null;

  require(['h5branding', 'h5ads', 'States/Load', 'States/Level/Level'], (branding, ads, Load, Level) => {
    // devSkipAds skips provider setup, but level menus still query the ad wrapper.
    // Attach an offline provider so those queries return false instead of throwing.
    ads.adWrapper.setAdProvider({
      adsEnabled: false,
      setManager(manager) { this.manager = manager; },
      adAvailable: () => false,
      preloadAd: () => {},
      destroyAd: () => {},
      hideAd: () => {},
      showAd(type) { this.manager.emit(ads.AdEvents.CONTENT_RESUMED, type); },
    });

    // The upstream splash fetches hosted sponsor resources. Replace only that shell.
    const splash = {
      create: () => Promise.resolve(),
      destroy: () => {},
      setButtonCallback: () => {},
      setLoadProgress: () => {},
    };
    branding.SplashLoader.getInstance = () => splash;

    Load.prototype.startGame = function () {
      this.game.load.onFileComplete.remove(this.onFileComplete);
      this.game.load.onLoadComplete.remove(this.onLoadComplete);
      const temple = this.game.progress.get('temples').find((item) => item.id === 'forest');
      const level = temple && temple.levels.find((item) => item.id === 2);
      if (!level || level.filename !== 'forest/levels/forest_02.json') {
        throw new Error('Expected Forest Temple Level 2 data was not found.');
      }
      this.game.currentTemple = temple;
      this.game.progress.setPlayed(level);
      this.game.state.add('level', Level);
      this.game.state.start('level', true, false, level);
      document.documentElement.dataset.level = '2';
    };
    Load.prototype.onLoadComplete = function () {
      // Phaser's loader dispatches this callback without the Load state's context.
      const game = window.referenceGame;
      setTimeout(() => {
        try {
          const state = game.state.getCurrentState();
          if (game.state.current === 'load') state.startGame();
        } catch (error) {
          fail(error);
        }
      }, 0);
    };

    const announce = () => {
      const game = window.referenceGame;
      if (game && game.level && game.level.loadCompleted && game.level.levelStarted &&
          game.physics.box2d && !game.physics.box2d.paused) {
        status.textContent = 'Level 2 · Ready';
        document.documentElement.dataset.ready = 'true';
      } else {
        requestAnimationFrame(announce);
      }
    };
    require(['main'], () => requestAnimationFrame(announce), fail);
  }, fail);
})();
