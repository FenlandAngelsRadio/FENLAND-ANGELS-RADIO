(function(){
function openPlayer(){window.open("player.html","FARPlayer","width=430,height=620,resizable=yes,scrollbars=no")}
function header(){const h=document.createElement("header");h.className="far-header";h.innerHTML=`
<a class="far-brand" href="index.html"><img src="fenland-angels-radio-logo.jpg" alt="Fenland Angels Radio"><div><div class="far-brand-name"><span>FENLAND</span><strong>ANGELS</strong><em>RADIO</em></div><div class="far-tagline">INDEPENDENT MUSIC RADIO COMMUNITY</div></div></a>
<nav class="far-nav">
<div class="far-dropdown"><button class="far-dropbtn">News &amp; Weather <span class="far-arrow">⌄</span></button><div class="far-menu"><div class="far-menu-inner"><a href="news.html">News</a><a href="weather.html">Weather</a></div></div></div>
<div class="far-dropdown"><button class="far-dropbtn">Community <span class="far-arrow">⌄</span></button><div class="far-menu"><div class="far-menu-inner"><a href="events.html">Events</a><a href="podcasts.html">Podcasts</a><span id="farCmsNavPages"></span></div></div></div>
<div class="far-dropdown"><button class="far-dropbtn">On Air <span class="far-arrow">⌄</span></button><div class="far-menu"><div class="far-menu-inner"><a href="other-ways-to-listen.html">Other Ways to Listen</a><a href="schedule.html">Schedule</a><a href="public-file.html">Public File</a></div></div></div>
<a href="vouchers.html">Vouchers</a></nav><button class="far-listen">🎧 Listen Live</button>`;h.querySelector(".far-listen").onclick=openPlayer;return h}
function footer(){const f=document.querySelector("footer");if(!f||f.querySelector(".far-footer-links"))return;const d=document.createElement("div");d.className="far-footer-links";d.innerHTML=`<strong>GET IN TOUCH</strong><a href="contact.html">Contact Us</a><a href="apply.html">Presenter / DJ / Staff Applications</a><a href="advertising.html">Advertising &amp; Sponsorship</a>`;f.appendChild(d)}
async function loadCmsPages(){try{if(!window.supabase){await new Promise((ok,bad)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";s.onload=ok;s.onerror=bad;document.head.appendChild(s)})}if(!window.FAR_EVENTS_CONFIG){await new Promise((ok,bad)=>{const s=document.createElement("script");s.src="events-config.js";s.onload=ok;s.onerror=bad;document.head.appendChild(s)})}const cfg=window.FAR_EVENTS_CONFIG||{},db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY),{data}=await db.from("far_custom_pages").select("slug,title").eq("published",true).eq("show_in_navigation",true).order("sort_order").order("title"),box=document.getElementById("farCmsNavPages");if(box)box.innerHTML=(data||[]).map(p=>'<a href="page.html?slug='+encodeURIComponent(p.slug)+'">'+String(p.title).replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]))+'</a>').join("")}catch(e){console.error("FAR CMS navigation",e)}}
function init(){const o=document.querySelector("header"),n=header();o?o.replaceWith(n):document.body.prepend(n);footer();loadCmsPages()}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init()
})();
window.addEventListener("scroll",()=>{const h=document.querySelector(".far-header");if(h)h.classList.toggle("scrolled",window.scrollY>60)});


// Load FAR first-party anonymous audience analytics on every site page.
(() => {
  if (document.querySelector('script[data-far-analytics]')) return;
  const s=document.createElement('script');
  s.src='far-analytics.js?v=2';
  s.defer=true;
  s.dataset.farAnalytics='1';
  document.head.appendChild(s);
})();
