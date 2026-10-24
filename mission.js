
(function(){
  const MISSION_URL='https://rycaylyhgjgovyxwhgjg.supabase.co/functions/v1/learnos-mission-synthesize';
  const baseRenderHome=renderHome;
  const baseRunResearch=runResearch;
  const baseRenderGuide=renderGuide;

  state.currentMission=localStorage.getItem('learnos.mission')||'';

  function sameDomain(a,b){
    try{
      return new URL(a).hostname.replace(/^www\./,'').toLowerCase()===
             new URL(b).hostname.replace(/^www\./,'').toLowerCase();
    }catch{return false}
  }

  function pageLookup(pages,url,fallback){
    const exact=(pages||[]).find(p=>p.url===url);
    if(exact)return exact;
    const same=(pages||[]).find(p=>url&&sameDomain(p.url,url));
    return same||fallback||(pages||[])[0]||null;
  }

  function sourceCorpus(pages){
    let total=0;
    const blocks=[];
    for(const p of pages||[]){
      const lines=[
        'SOURCE_URL: '+(p.url||''),
        'SOURCE_TITLE: '+(p.title||'')
      ];
      for(const s of p.sections||[]){
        const h=String(s.heading||'').trim();
        const t=String(s.text||'').replace(/\s+/g,' ').trim();
        if(!t||t.length<35)continue;
        if(h)lines.push('HEADING: '+h);
        lines.push('TEXT: '+t);
      }
      const block=lines.join('\n');
      if(total+block.length>145000)break;
      blocks.push(block);
      total+=block.length;
    }
    return blocks.join('\n\n--- SOURCE ---\n\n');
  }

  function cleanedImportedText(raw){
    const noise=[
      /^(home|forums?|what'?s new|members?|log in|register|search|advertise|contact us|privacy policy|terms.*|help)$/i,
      /^started by\b/i,/^replies?:?\s*\d*/i,/^views?:?\s*\d*/i,
      /^(today|yesterday) at \d/i,/^updated every\b/i,/^top monthly contributors\b/i,
      /^scored by:/i,/trophies achieved/i,/reactions (given|received)/i,
      /^enable javascript/i,/checking your browser/i,/verify you are human/i
    ];
    const seen=new Set();
    const out=[];
    let total=0;
    for(let line of String(raw||'').split(/\r?\n/)){
      line=line.replace(/\s+/g,' ').trim();
      if(!line||noise.some(r=>r.test(line)))continue;
      line=line
        .replace(/\bStarted by\b.*$/i,'')
        .replace(/\bReplies?:\s*\d+.*$/i,'')
        .replace(/\bViews?:\s*\d+.*$/i,'')
        .trim();
      if(line.length<18)continue;
      const key=line.toLowerCase().replace(/\W+/g,'').slice(0,180);
      if(!key||seen.has(key))continue;
      seen.add(key);
      out.push(line);
      total+=line.length+1;
      if(total>140000)break;
    }
    return out.join('\n');
  }

  async function missionSynthesis(instruction,title,url,content){
    const response=await fetch(MISSION_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({instruction,title,url,content})
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'AI research synthesis failed.');
    return result;
  }

  function buildMissionResult(synth,pages,instruction,originalUrl){
    const validUrls=new Set((pages||[]).map(p=>p.url).filter(Boolean));
    const fallbackPage=(pages||[])[0]||null;
    const guide=[];

    if(synth.overview){
      guide.push({
        heading:'What LearnOS found',
        text:synth.overview,
        whyItMatters:'This is the strongest source-grounded overview for your research mission.',
        importance:5,
        sourceTitle:fallbackPage?.title||synth.title||'Source',
        sourceUrl:fallbackPage?.url||originalUrl||'',
        domain:fallbackPage?.domain||(originalUrl?host(originalUrl):'Source'),
        sourceEvidence:synth.overview
      });
    }

    for(const finding of (synth.findings||[])){
      if(!finding?.text)continue;
      let u=String(finding.source_url||'');
      if(u&&!validUrls.has(u)){
        const candidate=(pages||[]).find(p=>sameDomain(p.url,u));
        u=candidate?.url||'';
      }
      const page=pageLookup(pages,u,fallbackPage);
      guide.push({
        heading:finding.heading||'Finding',
        text:finding.text,
        whyItMatters:finding.why_it_matters||'',
        importance:Number(finding.importance)||3,
        sourceTitle:page?.title||synth.title||'Source',
        sourceUrl:page?.url||originalUrl||'',
        domain:page?.domain||(originalUrl?host(originalUrl):'Source'),
        sourceEvidence:finding.evidence||finding.text
      });
    }

    guide.sort((a,b)=>(b.importance||0)-(a.importance||0));

    return {
      topic:synth.title||instruction,
      mission:instruction,
      mode:'url',
      created_at:Math.floor(Date.now()/1000),
      source_count:(pages||[]).length||1,
      sourceType:synth.source_type||'other',
      pages:pages||[],
      guide:guide.slice(0,12),
      items:Array.isArray(synth.leads)
        ? synth.leads.slice(0,12).sort((a,b)=>(Number(b.relevance)||0)-(Number(a.relevance)||0))
        : [],
      limitations:Array.isArray(synth.limitations)?synth.limitations.slice(0,8):[],
      map:guide.slice(0,10).map(x=>x.heading),
      errors:[],
      notice:'Research mission: '+instruction
    };
  }

  renderHome=function(){
    baseRenderHome();
    if(state.mode!=='url')return;

    const topic=$('#topic-input');
    if(!topic)return;

    topic.classList.add('mission-input');
    topic.placeholder='Tell LearnOS exactly what to find on this website…';
    topic.value=state.currentMission||'';
    topic.setAttribute('autocomplete','off');

    const label=document.createElement('div');
    label.className='mission-label';
    label.innerHTML='<strong>What do you want to find?</strong><span>Be specific. LearnOS will ignore unrelated material.</span>';
    topic.parentNode.insertBefore(label,topic);

    const examples=document.createElement('div');
    examples.className='mission-examples';
    examples.innerHTML=
      '<button type="button">Find advanced strategies and unusual real-world examples</button>'+
      '<button type="button">Find problems people keep running into and how they solved them</button>'+
      '<button type="button">Find the most valuable non-obvious information on this site</button>';
    topic.insertAdjacentElement('afterend',examples);

    examples.querySelectorAll('button').forEach(b=>{
      b.onclick=()=>{
        topic.value=b.textContent;
        topic.focus();
      };
    });

    const go=$('#research-go');
    if(go)go.innerHTML='Research this site <span>→</span>';

    const hero=$('.hero > p');
    if(hero)hero.textContent='Give LearnOS a website and a research mission. It searches the source for exactly what you asked for and ignores unrelated noise.';
  };

  runResearch=async function(){
    if(state.mode!=='url')return baseRunResearch();

    const raw=$('#research-input').value.trim();
    const mission=$('#topic-input')?.value.trim()||'';

    if(!raw){
      $('#research-input').focus();
      return;
    }

    if(!mission){
      const input=$('#topic-input');
      input?.classList.add('input-error');
      input?.focus();
      return;
    }

    state.currentMission=mission;
    state.pendingImportUrl=raw;
    localStorage.setItem('learnos.mission',mission);
    renderProgress(mission,'url');

    try{
      const response=await fetch(API_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({mode:'url',query:raw,topic:mission,depth:state.depth})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'This website could not be read directly.');

      const pages=(data.pages||[]).filter(p=>p.url&&sameDomain(p.url,raw));
      if(!pages.length)throw new Error('This website blocked direct research. Use Open & Import.');

      const corpus=sourceCorpus(pages);
      if(corpus.length<100)throw new Error('The site did not return enough useful source material. Use Open & Import.');

      const synth=await missionSynthesis(mission,new URL(raw).hostname,raw,corpus);
      const result=buildMissionResult(synth,pages,mission,raw);

      state.result=result;
      saveHistory(result);
      renderResult();
    }catch(err){
      renderError(err.message,raw,true);
    }
  };

  bookmarkletCode=function(){
    const back='https://ojgldkee.github.io/LearnOS/?import=clipboard';
    return "javascript:(async()=>{const r=document.querySelector('article,main,[role=main],.p-body-main')||document.body;const c=r.cloneNode(true);c.querySelectorAll('script,style,noscript,nav,header,footer,form,button,input,select,textarea,svg,canvas,iframe,.p-nav,.p-footer,.message-cell--user,.cookie,.advertisement').forEach(e=>e.remove());const a=[];c.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,a[href]').forEach(e=>{let t=(e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim();if(!t)return;if(e.tagName==='A'){if(t.length<12)return;try{const u=new URL(e.href,location.href);if(u.origin===location.origin)a.push('LINK: '+t+' | '+u.href)}catch(_){}}else if(/^H[1-4]$/.test(e.tagName))a.push('HEADING: '+t);else if(t.length>30)a.push('TEXT: '+t)});const b=a.length?a.join('\\n'):document.body.innerText;const p='LEARNOS_PAGE\\nTITLE:'+document.title+'\\nURL:'+location.href+'\\n\\n'+b.slice(0,220000);try{await navigator.clipboard.writeText(p)}catch(e){const t=document.createElement('textarea');t.value=p;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}location.href='"+back+"'})()";
  };

  importCapturedText=async function(raw){
    if(!raw){
      $('#manual-import-text')?.focus();
      return;
    }

    const mission=state.currentMission||localStorage.getItem('learnos.mission')||'Find the most useful information on this page.';
    let title='Imported web page';
    let url=state.pendingImportUrl||'';
    let text=String(raw);

    if(text.startsWith('LEARNOS_PAGE')){
      const mt=text.match(/^TITLE:(.*)$/m);
      const mu=text.match(/^URL:(.*)$/m);
      if(mt&&mt[1].trim())title=mt[1].trim();
      if(mu)url=mu[1].trim();
      text=text
        .replace(/^LEARNOS_PAGE\s*/,'')
        .replace(/^TITLE:.*$/m,'')
        .replace(/^URL:.*$/m,'')
        .trim();
    }

    text=cleanedImportedText(text);
    if(text.length<80){
      renderError('The captured page did not contain enough useful readable content.',raw,false);
      return;
    }

    renderProgress(mission,'text');

    try{
      const synth=await missionSynthesis(mission,title,url,text);
      const domain=url?host(url):'Imported page';
      const page={
        title,
        url:url||'local://browser-import',
        domain,
        sections:[{heading:'Captured page',text:text.slice(0,12000),score:10}],
        word_count:text.split(/\s+/).length,
        relevance:10,
        retrieval:'browser import'
      };
      const result=buildMissionResult(synth,[page],mission,url);

      if(result.sourceType==='forum_index'){
        result.notice='Research mission: '+mission+' — this page is only a forum index, so thread titles are treated as leads. Open the most relevant thread and use Send to LearnOS again for the actual discussion.';
      }

      state.result=result;
      saveHistory(result);
      history.replaceState({},'',location.pathname);
      renderResult();
    }catch(err){
      renderError(err.message,raw,false);
    }
  };

  renderGuide=function(r){
    if(!r?.mission)return baseRenderGuide(r);

    const findings=r.guide||[];
    const mission='<div class="mission-banner"><span>Research mission</span><strong>'+escapeHtml(r.mission)+'</strong></div>';

    const body=findings.map((x,i)=>{
      const level=(x.importance||3)>=5?'Top match':(x.importance||3)>=4?'Strong match':'Relevant';
      return '<section class="article-section mission-finding" id="sec-'+i+'">'+
        '<div class="finding-meta"><span>'+level+'</span></div>'+
        '<h2>'+escapeHtml(cleanHeading(x.heading))+'</h2>'+
        '<p>'+escapeHtml(x.text)+'</p>'+
        (x.whyItMatters?'<div class="why-box"><b>Why it matters</b><span>'+escapeHtml(x.whyItMatters)+'</span></div>':'')+
        '<div class="source-inline"><button class="source-chip" data-source-i="'+i+'">'+
        escapeHtml(x.domain||host(x.sourceUrl))+' · evidence</button></div>'+
        '</section>';
    }).join('');

    const leads=(r.items||[]).length
      ? '<section class="article-section"><h2>Best leads to investigate next</h2><div class="source-item-grid">'+
        r.items.map(x=>'<div class="source-item-card"><strong>'+escapeHtml(x.title||'Untitled')+'</strong>'+
          (x.why_it_matters?'<p>'+escapeHtml(x.why_it_matters)+'</p>':'')+
          (x.url?'<a href="'+escapeHtml(x.url)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>':'')+
          '</div>').join('')+
        '</div></section>'
      : '';

    const limits=(r.limitations||[]).length
      ? '<section class="article-section limitations-section"><h2>What the source did not answer</h2><ul>'+
        r.limitations.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul></section>'
      : '';

    return '<div class="reader-layout"><article class="reader">'+mission+
      '<div class="notice">'+escapeHtml(r.notice||'')+'</div>'+
      body+leads+limits+
      '</article><aside class="side-index"><div class="label">Findings</div>'+
      findings.slice(0,10).map((x,i)=>'<button class="index-link" data-jump="sec-'+i+'">'+escapeHtml(cleanHeading(x.heading))+'</button>').join('')+
      '</aside></div>';
  };

  renderHome();
})();
