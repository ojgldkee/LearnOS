
(function(){
  const SYNTH_URL='https://rycaylyhgjgovyxwhgjg.supabase.co/functions/v1/learnos-synthesize-import';

  const originalRenderClipboardImport=renderClipboardImport;
  renderClipboardImport=function(){
    originalRenderClipboardImport();

    const eyebrow=$('.eyebrow');
    const title=$('.page-title');
    const sub=$('.page-sub');
    const go=$('#clipboard-import-go');
    const note=$('.import-note');

    if(eyebrow) eyebrow.textContent='Page sent';
    if(title) title.textContent='Finish the import.';
    if(sub) sub.textContent='You already sent this page to LearnOS. Tap once so your browser can hand LearnOS the temporary page copy.';
    if(go) go.textContent='Finish import';
    if(note) note.textContent='LearnOS will remove menus, reply counts, navigation and other page clutter before organizing the useful information.';

    const fallback=$('.import-card strong');
    if(fallback) fallback.textContent='Import not working?';
  };

  function cleanImportedPage(text){
    const lines=String(text||'')
      .split(/\r?\n/)
      .map(x=>x.replace(/\s+/g,' ').trim())
      .filter(Boolean);

    const noise=[
      /^(home|forums?|what'?s new|members?|log in|register|search|advertise|contact us|privacy policy|terms.*|help)$/i,
      /^started by\b/i,
      /^replies?:?\s*\d*/i,
      /^views?:?\s*\d*/i,
      /^(today|yesterday) at \d/i,
      /^updated every\b/i,
      /^top monthly contributors\b/i,
      /^scored by:/i,
      /trophies achieved/i,
      /reactions (given|received)/i,
      /^enable javascript/i
    ];

    const out=[];
    const seen=new Set();
    let total=0;

    for(let line of lines){
      if(noise.some(r=>r.test(line))) continue;

      line=line
        .replace(/\bStarted by\b.*$/i,'')
        .replace(/\bReplies?:\s*\d+.*$/i,'')
        .replace(/\bViews?:\s*\d+.*$/i,'')
        .trim();

      if(line.length<18) continue;

      const key=line.toLowerCase().replace(/\W+/g,'').slice(0,180);
      if(!key||seen.has(key)) continue;

      seen.add(key);
      out.push(line);
      total+=line.length+1;
      if(total>110000) break;
    }

    return out.join('\n');
  }

  importCapturedText=async function(raw){
    if(!raw){
      $('#manual-import-text')?.focus();
      return;
    }

    let title='Imported web page';
    let url=state.pendingImportUrl||'';
    let text=String(raw);

    if(text.startsWith('LEARNOS_PAGE')){
      const mTitle=text.match(/^TITLE:(.*)$/m);
      const mUrl=text.match(/^URL:(.*)$/m);

      if(mTitle&&mTitle[1].trim()) title=mTitle[1].trim();
      if(mUrl) url=mUrl[1].trim();

      text=text
        .replace(/^LEARNOS_PAGE\s*/,'')
        .replace(/^TITLE:.*$/m,'')
        .replace(/^URL:.*$/m,'')
        .trim();
    }

    text=cleanImportedPage(text);

    if(text.length<80){
      renderError('The captured page did not contain enough readable content.',raw,false);
      return;
    }

    renderProgress(title,'text');

    try{
      const response=await fetch(SYNTH_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title,url,content:text})
      });

      const synth=await response.json();
      if(!response.ok) throw new Error(synth.error||'Could not organize the captured page.');

      const domain=url?host(url):'Imported page';
      const guide=[];

      if(synth.overview){
        guide.push({
          heading:synth.source_type==='forum_index'?'What this page actually is':'What this page contains',
          text:synth.overview,
          sourceTitle:title,
          sourceUrl:url,
          domain,
          score:10,
          sourceEvidence:synth.overview
        });
      }

      for(const section of (synth.sections||[]).slice(0,12)){
        if(!section?.text) continue;

        guide.push({
          heading:section.heading||'Key point',
          text:section.text,
          sourceTitle:title,
          sourceUrl:url,
          domain,
          score:8,
          sourceEvidence:section.evidence||section.text
        });
      }

      const data={
        topic:synth.title||title,
        mode:'url',
        created_at:Math.floor(Date.now()/1000),
        source_count:1,
        sourceType:synth.source_type||'other',
        pages:[{
          title:synth.title||title,
          url:url||'local://browser-import',
          domain,
          sections:guide.map(g=>({
            heading:g.heading,
            text:g.sourceEvidence||g.text,
            score:g.score
          })),
          word_count:text.split(/\s+/).length,
          relevance:10,
          retrieval:'browser import'
        }],
        guide,
        items:Array.isArray(synth.items)?synth.items.slice(0,12):[],
        limitations:Array.isArray(synth.limitations)?synth.limitations.slice(0,8):[],
        map:guide.map(g=>g.heading).slice(0,10),
        errors:[],
        notice:synth.source_type==='forum_index'
          ? 'This is a forum index, not the full discussions. LearnOS separated the useful topics, but thread titles are not treated as facts. Open a thread and use Send to LearnOS again to analyze the actual discussion.'
          : 'Imported from the readable page in your browser. The guide is grounded only in the captured source.'
      };

      state.result=data;
      saveHistory(data);
      history.replaceState({},'',location.pathname);
      renderResult();
    }catch(e){
      renderError(e.message,raw,false);
    }
  };

  const originalRenderGuide=renderGuide;
  renderGuide=function(r){
    if(!r?.items?.length && !r?.limitations?.length) return originalRenderGuide(r);

    const guide=r.guide||[];
    if(!guide.length) return '<div class="empty" style="margin-top:30px">No useful passages were extracted.</div>';

    const related=(r.items||[]).length
      ? '<section class="article-section next-source-section"><h2>'+
        (r.sourceType==='forum_index'?'Useful threads and topics on this page':'Related items in the source')+
        '</h2><div class="source-item-grid">'+
        r.items.map(x=>'<div class="source-item-card"><strong>'+escapeHtml(x.title||'Untitled')+
        '</strong>'+(x.why_it_matters?'<p>'+escapeHtml(x.why_it_matters)+'</p>':'')+
        (x.url?'<a href="'+escapeHtml(x.url)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>':'')+
        '</div>').join('')+
        '</div></section>'
      : '';

    const limitations=(r.limitations||[]).length
      ? '<section class="article-section limitations-section"><h2>What this page does not establish</h2><ul>'+
        r.limitations.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+
        '</ul></section>'
      : '';

    return '<div class="reader-layout"><article class="reader"><div class="notice">'+
      escapeHtml(r.notice||'Every section below is tied to the imported source.')+
      '</div>'+
      guide.map((x,i)=>'<section class="article-section" id="sec-'+i+'"><h2>'+
        escapeHtml(cleanHeading(x.heading))+
        '</h2><p>'+escapeHtml(x.text)+'</p><div class="source-inline"><button class="source-chip" data-source-i="'+i+'">'+
        escapeHtml(x.domain||host(x.sourceUrl))+
        ' · view evidence</button></div></section>').join('')+
      related+limitations+
      '</article><aside class="side-index"><div class="label">In this brief</div>'+
      guide.slice(0,10).map((x,i)=>'<button class="index-link" data-jump="sec-'+i+'">'+
        escapeHtml(cleanHeading(x.heading))+'</button>').join('')+
      '</aside></div>';
  };

  if(new URLSearchParams(location.search).get('import')==='clipboard'){
    setTimeout(()=>renderClipboardImport(),0);
  }
})();
