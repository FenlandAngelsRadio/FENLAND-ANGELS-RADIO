(function () {
  const menus = {main: 'Main Navigation', news: 'News & Weather', community: 'Community', on_air: 'On Air'};
  const safeHref = value => {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  };
  function pageSlug(href) {
    try {
      const url = new URL(href, window.location.href);
      return url.origin === window.location.origin && url.pathname.endsWith('/page.html') ? url.searchParams.get('slug') : null;
    } catch (_) { return null; }
  }
  // Menu records control explicit links. Page settings control publication and
  // links created through Pages, without requiring a second staff permission.
  function resolve(items, pages) {
    const links = items.filter(item => {
      const slug = pageSlug(item.href);
      return !slug && item.enabled && menus[item.location] && safeHref(item.href);
    }).map(item => ({...item}));
    pages.forEach(page => {
      if (!page.published || !page.show_in_navigation || !menus[page.navigation_location]) return;
      // Page links have one editor: Pages. Ignore legacy duplicate menu rows.
      links.push({id: 'page-' + page.id, page_id: page.id, label: page.navigation_label || page.title,
        href: 'page.html?slug=' + encodeURIComponent(page.slug), location: page.navigation_location,
        enabled: true, sort_order: page.sort_order});
    });
    return links.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.id).localeCompare(String(b.id)));
  }
  async function read(db) {
    const [navigation, pages] = await Promise.all([
      db.from('far_navigation_items').select('*').order('sort_order').order('id'),
      db.from('far_custom_pages').select('id,slug,title,navigation_label,navigation_location,sort_order,published,show_in_navigation')
    ]);
    if (navigation.error) throw navigation.error;
    if (pages.error) throw pages.error;
    return {items: navigation.data || [], pages: pages.data || []};
  }
  window.FARNavigation = {menus, safeHref, pageSlug, resolve, read};
})();
