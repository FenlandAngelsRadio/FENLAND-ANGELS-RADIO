(function () {
  function openPlayer() {
    window.open(
      'player.html',
      'FARPlayer',
      'width=430,height=620,resizable=yes,scrollbars=no'
    );
  }

  function buildHeader() {
    const header = document.createElement('header');
    header.className = 'far-header';

    header.innerHTML = `
      <a class="far-brand" href="index.html" aria-label="Fenland Angels Radio home">
        <img src="fenland-angels-radio-logo.jpg" alt="Fenland Angels Radio logo">
        <div>
          <div class="far-brand-name">
            <span>FENLAND</span>
            <strong>ANGELS</strong>
            <em>RADIO</em>
          </div>
          <div class="far-tagline">INDEPENDENT MUSIC RADIO COMMUNITY</div>
        </div>
      </a>

      <nav class="far-nav" aria-label="Main navigation">
       <div class="far-dropdown">
  <button class="far-dropbtn" type="button">
    News &amp; Weather <span class="far-arrow">⌄</span>
  </button>

  <div class="far-menu">
    <div class="far-menu-inner">
      <a href="news.html">News</a>
      <a href="weather.html">Weather</a>
    </div>
  </div>
</div>

        <div class="far-dropdown">
          <button class="far-dropbtn" type="button">
            Community <span class="far-arrow">⌄</span>
          </button>
          <div class="far-menu">
            <div class="far-menu-inner">
              <a href="events.html">Events</a>
              <a href="podcasts.html">Podcasts</a>
            </div>
          </div>
        </div>

        <div class="far-dropdown">
          <button class="far-dropbtn" type="button">
            On Air <span class="far-arrow">⌄</span>
          </button>
          <div class="far-menu">
            <div class="far-menu-inner">
              <a href="other-ways-to-listen.html">Other Ways to Listen</a>
              <a href="schedule.html">Schedule</a>
              <a href="public-file.html">Public File</a>
            </div>
          </div>
        </div>

        <a href="advertising.html">Advertise</a>
        <a href="vouchers.html">Vouchers</a>
      </nav>

      <button class="far-listen" type="button">🎧 Listen Live</button>
    `;

    header.querySelector('.far-listen').addEventListener('click', openPlayer);
    return header;
  }

  function init() {
    const oldHeader = document.querySelector('header');
    const newHeader = buildHeader();

    if (oldHeader) {
      oldHeader.replaceWith(newHeader);
    } else {
      document.body.prepend(newHeader);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

window.addEventListener('scroll', function () {
  const header = document.querySelector('.far-header');

  if (!header) return;

  if (window.scrollY > 60) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});
