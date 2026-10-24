const API_URL = "https://rycaylyhgjgovyxwhgjg.supabase.co/functions/v1/learnos-research";
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const state = {
  mode:'topic', depth:'standard', result:null, resultTab:'guide',
  history: JSON.parse(localStorage.getItem('learnos.history') || '[]'),
  theme: localStorage.getItem('learnos.theme') || 'light',
  pendingImportUrl: ''
};
document.documentElement.dataset.theme = state.theme;

const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./,'') } catch { return u === 'local://pasted-text' ? 'Local source' : 'Source' } };
const cleanHeading = h => h && !['Key information','Pasted material'].includes(h) ? h : 'What the source says';

function setNav(which){ $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.action===which)); }
function renderHome(){
  setNav('home');
  const recent = state.history.slice(0,6);
  $('#view').innerHTML = `<div class="shell">
    <section class="hero">
      <div class="eyebrow">Source-first research</div>
      <h1>Learn from the internet.<br><em>Without the noise.</em></h1>
      <p>Search anything, paste a site, or drop in a transcript. LearnOS extracts the useful parts and keeps the evidence attached to every section.</p>
      <div class="research-card">
        <div class="mode-tabs">
          <button class="mode-tab ${state.mode==='topic'?'active':''}" data-mode="topic">Search web</button>
          <button class="mode-tab ${state.mode==='url'?'active':''}" data-mode="url">Paste website</button>
          <button class="mode-tab ${state.mode==='text'?'active':''}" data-mode="text">Paste text</button>
        </div>
        <textarea id="research-input" class="research-input" placeholder="${state.mode==='topic'?'What do you want to understand?':state.mode==='url'?'Paste a public website URL…':'Paste a transcript, article, or notes…'}"></textarea>
        ${state.mode==='url'?'<input id="topic-input" class="topic-input" placeholder="Optional focus, e.g. financing, taxes, customer acquisition…" />':''}
        ${state.mode==='text'?'<input id="topic-input" class="topic-input" placeholder="Optional topic or question to focus the extraction" />':''}
        <div class="composer-footer">
          <div class="depth-toggle">
            <button class="depth-btn ${state.depth==='standard'?'active':''}" data-depth="standard">Focused</button>
            <button class="depth-btn ${state.depth==='deep'?'active':''}" data-depth="deep">Deep crawl</button>
          </div>
          <button class="go-btn" id="research-go">Research <span>→</span></button>
        </div>
      </div>
      <div class="trust-row">
        <div class="trust-card"><strong>Evidence stays attached</strong><span>Open the exact source behind any passage.</span></div>
        <div class="trust-card"><strong>No filler by default</strong><span>Missing evidence stays missing instead of being invented.</span></div>
        <div class="trust-card"><strong>Built for rabbit holes</strong><span>Related concepts become navigable, not distracting.</span></div>
      </div>
    </section>
    <section>
      <div class="section-head"><div><h2>Your research</h2><p>Everything stays searchable on this device.</p></div></div>
      <div class="history-grid">${recent.length ? recent.map(historyCard).join('') : '<div class="empty">Your first research session will appear here.</div>'}</div>
    </section>
  </div>`;
  $$('.mode-tab').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;renderHome(); setTimeout(()=>$('#research-input')?.focus(),0)});
  $$('.depth-btn').forEach(b=>b.onclick=()=>{state.depth=b.dataset.depth;renderHome();});
  $('#research-go').onclick = runResearch;
  $$('.history-card').forEach(c=>c.onclick=()=>openHistory(c.dataset.id));
}
function historyCard(x){return `<article class="history-card" data-id="${escapeHtml(x.id)}"><div class="type">${escapeHtml(x.mode==='url'?'Website research':x.mode==='text'?'Transcript':'Web research')}</div><h3>${escapeHtml(x.topic)}</h3><div class="meta">${x.source_count||0} sources · ${new Date(x.created_at*1000).toLocaleDateString()}</div></article>`}

async function runResearch(){
  const raw = $('#research-input').value.trim();
  if(!raw){ $('#research-input').focus(); return; }
  const topic = $('#topic-input')?.value.trim() || '';
  renderProgress(raw, state.mode);
  try{
    const payload = state.mode==='text' ? {mode:'text',query:topic||'Pasted material',topic:topic||'Pasted material',rawText:raw,depth:state.depth} : {mode:state.mode,query:raw,topic,depth:state.depth};
    let response = await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let data = await response.json();
    if(!response.ok && state.mode==='url'){
      const fallbackUrl='https://rycaylyhgjgovyxwhgjg.supabase.co/functions/v1/learnos-index-search';
      response=await fetch(fallbackUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:raw,topic})});
      data=await response.json();
    }
    if(!response.ok) throw new Error(data.error || data.detail || 'Research failed');
    state.result=data;
    saveHistory(data);
    renderResult();
  }catch(err){state.pendingImportUrl=state.mode==='url'?raw:'';renderError(err.message, raw, state.mode==='url')}
}

function renderProgress(raw, mode){
  setNav('');
  const label=mode==='url'?'Mapping the site':mode==='text'?'Structuring the material':'Finding real sources';
  $('#view').innerHTML=`<div class="progress-shell"><div class="progress-top"><span class="eyebrow">Research in progress</span><span class="mini">source-first pipeline</span></div><h1>${escapeHtml(label)}</h1><div class="progress-track"><div class="progress-bar" id="progress-bar"></div></div><div class="steps">
    <div class="step active" id="s1"><span>Understand the request</span><span class="step-dot"></span></div>
    <div class="step" id="s2"><span>${mode==='url'?'Inspect page and useful internal links':mode==='text'?'Clean and segment the text':'Discover relevant sources'}</span><span class="step-dot"></span></div>
    <div class="step" id="s3"><span>Extract high-signal passages</span><span class="step-dot"></span></div>
    <div class="step" id="s4"><span>Rank evidence and build the reader</span><span class="step-dot"></span></div>
  </div><p style="color:var(--muted);font-size:13px;margin-top:18px;max-width:620px">${escapeHtml(raw.slice(0,220))}</p></div>`;
  let p=9,step=1; const timer=setInterval(()=>{ if(!$('#progress-bar')) return clearInterval(timer); p=Math.min(p+Math.random()*8,91); $('#progress-bar').style.width=p+'%'; const n=p>72?4:p>45?3:p>20?2:1; if(n!==step){step=n; for(let i=1;i<=4;i++){const el=$('#s'+i);if(el){el.classList.toggle('done',i<n);el.classList.toggle('active',i===n)}}}},580);
}
function renderError(message, original, canImport=false){
  $('#view').innerHTML=`<div class="error-box">
    <div class="eyebrow">Protected source detected</div>
    <h2>${canImport?'This site needs browser import.':'That source couldn\'t be processed.'}</h2>
    <p>${escapeHtml(message)}</p>
    <div class="error-actions">
      ${canImport?'<button class="btn primary" data-action="protected-import">Open & Import</button>':''}
      <button class="btn" data-action="home">Back to research</button>
    </div>
    ${original?'<p style="margin-top:14px;font-size:12px">LearnOS did not use the CAPTCHA or bot-check page as research content.</p>':''}
  </div>`;
}

function bookmarkletCode(){
  const back='https://ojgldkee.github.io/LearnOS/?import=clipboard';
  return "javascript:(async()=>{const p='LEARNOS_PAGE\\nTITLE:'+document.title+'\\nURL:'+location.href+'\\n\\n'+document.body.innerText.slice(0,350000);try{await navigator.clipboard.writeText(p)}catch(e){const t=document.createElement('textarea');t.value=p;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.focus();t.select();document.execCommand('copy');t.remove()}location.href='"+back+"'})()";
}

function renderProtectedImport(){
  setNav('');
  const url=state.pendingImportUrl;
  $('#view').innerHTML=`<div class="library-shell import-shell">
    <div class="eyebrow">Browser import</div>
    <h1 class="page-title">Open it normally.<br>Then send it to LearnOS.</h1>
    <p class="page-sub">This keeps the CAPTCHA in your browser. LearnOS only receives the readable page after you have access to it.</p>

    <div class="import-card">
      <div class="import-step"><span>1</span><div><strong>Open the protected site</strong><p>Complete any CAPTCHA or human verification normally.</p></div></div>
      <a class="btn primary import-open" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open website ↗</a>
    </div>

    <div class="import-card">
      <div class="import-step"><span>2</span><div><strong>Send the page to LearnOS</strong><p>For the easiest iPhone flow, install the “Send to LearnOS” bookmark once, then tap it while you are on any protected page.</p></div></div>
      <button class="btn" id="copy-bookmarklet">Copy bookmark code</button>
      <div class="bookmark-help">
        <b>One-time Safari setup</b>
        <ol>
          <li>In Safari, add any page as a bookmark and name it <b>Send to LearnOS</b>.</li>
          <li>Edit that bookmark.</li>
          <li>Delete its URL and paste the code you copied here.</li>
        </ol>
        <p>After that, on a protected page: pass the CAPTCHA → open your bookmarks → tap <b>Send to LearnOS</b>.</p>
      </div>
    </div>

    <div class="import-card">
      <div class="import-step"><span>3</span><div><strong>Or paste the page manually</strong><p>If your browser does not support the bookmark method, paste copied page text here instead.</p></div></div>
      <textarea id="manual-import-text" class="research-input import-textarea" placeholder="Paste the readable page text here…"></textarea>
      <button class="btn primary" id="manual-import-go">Import pasted page</button>
    </div>
  </div>`;

  $('#copy-bookmarklet').onclick=async()=>{
    try{
      await navigator.clipboard.writeText(bookmarkletCode());
      $('#copy-bookmarklet').textContent='Copied ✓';
    }catch{
      const box=document.createElement('textarea');
      box.value=bookmarkletCode();
      document.body.appendChild(box);box.select();document.execCommand('copy');box.remove();
      $('#copy-bookmarklet').textContent='Copied ✓';
    }
  };
  $('#manual-import-go').onclick=()=>importCapturedText($('#manual-import-text').value.trim());
}

function renderClipboardImport(){
  setNav('');
  $('#view').innerHTML=`<div class="library-shell import-shell">
    <div class="eyebrow">Page captured</div>
    <h1 class="page-title">Bring the page into LearnOS.</h1>
    <p class="page-sub">Your browser copied the readable page. Tap below to import it and build the research guide.</p>
    <div class="import-card">
      <button class="btn primary import-big" id="clipboard-import-go">Import page from clipboard</button>
      <p class="import-note">Clipboard access only happens after you tap this button.</p>
    </div>
    <div class="import-card">
      <strong>Clipboard blocked?</strong>
      <p class="import-note">Paste the page manually below.</p>
      <textarea id="manual-import-text" class="research-input import-textarea" placeholder="Paste page text…"></textarea>
      <button class="btn" id="manual-import-go">Import pasted page</button>
    </div>
  </div>`;
  $('#clipboard-import-go').onclick=async()=>{
    try{
      const text=await navigator.clipboard.readText();
      importCapturedText(text);
    }catch(e){
      $('#clipboard-import-go').textContent='Clipboard blocked — paste below';
      $('#manual-import-text').focus();
    }
  };
  $('#manual-import-go').onclick=()=>importCapturedText($('#manual-import-text').value.trim());
}

async function importCapturedText(raw){
  if(!raw){$('#manual-import-text')?.focus();return}
  let title='Imported web page',url=state.pendingImportUrl||'',text=raw;
  if(raw.startsWith('LEARNOS_PAGE')){
    const mTitle=raw.match(/^TITLE:(.*)$/m);
    const mUrl=raw.match(/^URL:(.*)$/m);
    if(mTitle)title=cleanHeading(mTitle[1].trim());
    if(mUrl)url=mUrl[1].trim();
    text=raw.replace(/^LEARNOS_PAGE\s*/,'').replace(/^TITLE:.*$/m,'').replace(/^URL:.*$/m,'').trim();
  }
  renderProgress(title,'text');
  try{
    const payload={mode:'text',query:title,topic:title,rawText:text,depth:'standard'};
    const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Import failed');
    data.topic=title;
    data.mode='url';
    if(url){
      (data.pages||[]).forEach(p=>{p.url=url;p.domain=host(url);p.title=title});
      (data.guide||[]).forEach(g=>{g.sourceUrl=url;g.domain=host(url);g.sourceTitle=title});
    }
    data.notice='Imported from the readable page in your browser after you passed the site\'s verification. LearnOS did not bypass the CAPTCHA.';
    state.result=data;saveHistory(data);history.replaceState({},'',location.pathname);renderResult();
  }catch(e){renderError(e.message,raw,false)}
}
function saveHistory(data){
  const compact={...data,id:String(Date.now())};
  state.history=[compact,...state.history.filter(x=>x.topic!==compact.topic)].slice(0,30);
  localStorage.setItem('learnos.history',JSON.stringify(state.history));
}
function openHistory(id){const item=state.history.find(x=>x.id===id);if(item){state.result=item;state.resultTab='guide';renderResult();}}

function renderResult(){
  if(!state.result) return renderHome(); setNav('');
  const r=state.result; const sourceLabel=`${r.source_count} source${r.source_count===1?'':'s'}`;
  $('#view').innerHTML=`<div class="result-shell">
    <header class="result-header"><div class="result-title"><div class="kicker">Research brief</div><h1>${escapeHtml(r.topic)}</h1><div class="result-meta"><span class="pill">${sourceLabel}</span><span class="pill">Evidence-linked</span><span class="pill">${new Date((r.created_at||Date.now()/1000)*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span></div></div><div class="result-actions"><button class="btn" data-action="home">New research</button><button class="btn primary" id="save-result">Saved</button></div></header>
    <nav class="result-tabs"><button class="result-tab ${state.resultTab==='guide'?'active':''}" data-r-tab="guide">Guide</button><button class="result-tab ${state.resultTab==='evidence'?'active':''}" data-r-tab="evidence">Evidence</button><button class="result-tab ${state.resultTab==='sources'?'active':''}" data-r-tab="sources">Sources</button><button class="result-tab ${state.resultTab==='map'?'active':''}" data-r-tab="map">Map</button></nav>
    <section id="result-body">${renderResultBody()}</section>
  </div>`;
  $$('.result-tab').forEach(b=>b.onclick=()=>{state.resultTab=b.dataset.rTab;renderResult()});
  wireResultActions();
}
function renderResultBody(){const r=state.result;if(state.resultTab==='evidence')return renderEvidence(r);if(state.resultTab==='sources')return renderSources(r);if(state.resultTab==='map')return renderMap(r);return renderGuide(r)}
function renderGuide(r){
  const items=(r.guide||[]); if(!items.length)return '<div class="empty" style="margin-top:30px">No useful passages were extracted.</div>';
  return `<div class="reader-layout"><article class="reader"><div class="notice">${escapeHtml(r.notice||'Every section below is tied to an extracted source passage.')}</div>${items.map((x,i)=>`<section class="article-section" id="sec-${i}"><h2>${escapeHtml(cleanHeading(x.heading))}</h2><p>${escapeHtml(x.text)}</p><div class="source-inline"><button class="source-chip" data-source-i="${i}">${escapeHtml(x.domain||host(x.sourceUrl))} · view evidence</button></div></section>`).join('')}</article><aside class="side-index"><div class="label">In this brief</div>${items.slice(0,10).map((x,i)=>`<button class="index-link" data-jump="sec-${i}">${escapeHtml(cleanHeading(x.heading))}</button>`).join('')}</aside></div>`;
}
function renderEvidence(r){return `<div class="evidence-list">${(r.guide||[]).map((x,i)=>`<article class="evidence-card"><div class="source-line"><span>${escapeHtml(x.domain||host(x.sourceUrl))}</span><span>Evidence ${String(i+1).padStart(2,'0')}</span></div><blockquote>${escapeHtml(x.text)}</blockquote><div style="margin-top:12px"><button class="source-chip" data-source-i="${i}">Open source context</button></div></article>`).join('')}</div>`}
function renderSources(r){return `<div class="sources-list">${(r.pages||[]).map((p,i)=>`<article class="source-card"><div class="source-line"><span>${escapeHtml(p.domain)}</span><span class="score">relevance ${escapeHtml(p.relevance)}</span></div><h3>${escapeHtml(p.title)}</h3><p>${p.word_count} useful words extracted · ${(p.sections||[]).length} ranked passages</p>${p.url.startsWith('http')?`<p style="margin-top:12px"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">Open original ↗</a></p>`:''}</article>`).join('')}${r.errors?.length?`<article class="source-card"><h3>${r.errors.length} sources skipped safely</h3><p>Blocked, unsupported, timed out, or disallowed sources were not used.</p></article>`:''}</div>`}
function renderMap(r){const nodes=r.map||[];return `<div class="map-wrap"><div class="map-root"><div class="eyebrow">Concept map</div><div class="map-topic">${escapeHtml(r.topic)}</div><div class="map-nodes">${nodes.length?nodes.map(n=>`<span class="map-node">${escapeHtml(n)}</span>`).join(''):'<span class="map-node">More source structure needed</span>'}</div></div><p style="color:var(--muted);font-size:13px;margin:15px 4px">The map is built from headings found in the sources, not from invented recommendations.</p></div>`}
function wireResultActions(){
  $$('[data-source-i]').forEach(b=>b.onclick=()=>openEvidence(Number(b.dataset.sourceI)));
  $$('[data-jump]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function openEvidence(i){const x=state.result?.guide?.[i];if(!x)return;$('#drawer-content').innerHTML=`<div class="domain">${escapeHtml(x.domain||host(x.sourceUrl))}</div><h2>${escapeHtml(x.sourceTitle||'Source evidence')}</h2><p style="color:var(--muted);font-size:13px">This is the passage LearnOS used. Read the original whenever context matters.</p><blockquote>${escapeHtml(x.text)}</blockquote>${x.sourceUrl?.startsWith('http')?`<a href="${escapeHtml(x.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a>`:'<span style="color:var(--muted);font-size:13px">Local pasted material</span>'}`;const d=$('#drawer');d.classList.add('open');d.setAttribute('aria-hidden','false')}
function closeDrawer(){const d=$('#drawer');d.classList.remove('open');d.setAttribute('aria-hidden','true')}
function renderLibrary(){setNav('library');$('#view').innerHTML=`<div class="library-shell"><div class="eyebrow">Private research library</div><h1 class="page-title">Everything you've looked into.</h1><p class="page-sub">Search past research instead of starting from zero every time.</p><input id="library-search" class="search-small" placeholder="Search your research…"><div class="section-head"><div><h2>Recent</h2><p>${state.history.length} saved locally</p></div></div><div id="library-grid" class="history-grid">${state.history.length?state.history.map(historyCard).join(''):'<div class="empty">No research saved yet.</div>'}</div></div>`;wireLibrary()}
function wireLibrary(){ $$('.history-card').forEach(c=>c.onclick=()=>openHistory(c.dataset.id)); $('#library-search')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();$('#library-grid').innerHTML=state.history.filter(x=>x.topic.toLowerCase().includes(q)).map(historyCard).join('')||'<div class="empty">Nothing matched.</div>';$$('.history-card').forEach(c=>c.onclick=()=>openHistory(c.dataset.id))})}
function renderExplore(){setNav('explore');$('#view').innerHTML=`<div class="library-shell"><div class="eyebrow">Explore</div><h1 class="page-title">Follow what matters.<br>Not a feed.</h1><p class="page-sub">This section is intentionally quiet in V1. It will eventually surface only source-backed changes connected to topics already in your library—no infinite scroll and no generic AI ideas.</p><div class="empty">Research a few topics first. LearnOS will use your actual library to build relevant branches later.</div></div>`}

document.addEventListener('click',e=>{const a=e.target.closest('[data-action]');if(!a)return;const act=a.dataset.action;if(act==='home')renderHome();if(act==='library')renderLibrary();if(act==='explore')renderExplore();if(act==='protected-import')renderProtectedImport();if(act==='close-drawer')closeDrawer();if(act==='theme'){state.theme=state.theme==='light'?'dark':'light';document.documentElement.dataset.theme=state.theme;localStorage.setItem('learnos.theme',state.theme)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();renderHome();setTimeout(()=>$('#research-input')?.focus(),10)}});
const _importMode=new URLSearchParams(location.search).get('import');
if(_importMode==='clipboard') renderClipboardImport(); else renderHome();
