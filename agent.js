
(function(){
  const AGENT='https://rycaylyhgjgovyxwhgjg.supabase.co/functions/v1/learnos-agent-research';
  const oldHome=renderHome, oldRun=runResearch, oldBody=renderResultBody;

  renderHome=function(){
    oldHome();
    if(state.mode!=='topic')return;

    const input=$('#research-input');
    if(input){
      input.placeholder='What do you want to learn or investigate?';
      input.style.minHeight='150px';
    }

    const hero=$('.hero > p');
    if(hero)hero.textContent='Ask anything. LearnOS searches the internet, filters weak sources, cross-checks claims, and builds a source-backed learning brief.';

    const card=$('.research-card');
    if(card&&!card.querySelector('.agent-options')){
      const box=document.createElement('div');
      box.className='agent-options';
      box.innerHTML=
        '<div class="agent-options-head"><strong>Research depth</strong><span>How hard should LearnOS dig?</span></div>'+
        '<div class="agent-depth-row">'+
          '<button type="button" data-agent-depth="quick">Quick<small>Fast scan</small></button>'+
          '<button type="button" data-agent-depth="deep">Deep<small>Best default</small></button>'+
          '<button type="button" data-agent-depth="obsessive">Obsessive<small>Maximum digging</small></button>'+
        '</div>'+
        '<details class="agent-advanced"><summary>Advanced controls</summary>'+
          '<textarea id="known-input" placeholder="What do you already know? LearnOS will skip the basics."></textarea>'+
          '<input id="prefer-domains" placeholder="Prefer domains: meta.com, reddit.com…" />'+
          '<input id="block-domains" placeholder="Block domains: example.com…" />'+
        '</details>';
      card.insertBefore(box,card.querySelector('.composer-footer'));
    }

    state.agentDepth=state.agentDepth||'deep';
    $$('[data-agent-depth]').forEach(b=>{
      b.classList.toggle('active',b.dataset.agentDepth===state.agentDepth);
      b.onclick=()=>{
        state.agentDepth=b.dataset.agentDepth;
        $$('[data-agent-depth]').forEach(x=>x.classList.toggle('active',x===b));
      };
    });

    const depth=card?.querySelector('.depth-toggle');
    if(depth)depth.style.display='none';

    const go=$('#research-go');
    if(go)go.innerHTML='Research the web <span>→</span>';
  };

  runResearch=async function(){
    if(state.mode!=='topic')return oldRun();

    const mission=$('#research-input')?.value.trim()||'';
    if(!mission){$('#research-input')?.focus();return}

    const known=$('#known-input')?.value.trim()||'';
    const preferred=($('#prefer-domains')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
    const blocked=($('#block-domains')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);

    renderProgress(mission,'topic');

    try{
      const response=await fetch(AGENT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          mission,
          depth:state.agentDepth||'deep',
          known,
          preferred_domains:preferred,
          blocked_domains:blocked
        })
      });

      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Research agent failed.');

      const accepted=Array.isArray(data.accepted_sources)?data.accepted_sources:[];
      const rejected=Array.isArray(data.rejected_sources)?data.rejected_sources:[];
      const byId=new Map();
      accepted.forEach((s,i)=>byId.set(String(s.id||i+1),s));

      const guide=(data.findings||[]).map(f=>{
        const ids=(f.source_ids||[]).map(String);
        const source=ids.map(id=>byId.get(id)).find(Boolean)||accepted[0]||{};
        return{
          heading:f.heading||'Finding',
          text:f.explanation||'',
          whyItMatters:f.why_it_matters||'',
          importance:Number(f.novelty)||3,
          confidence:Number(f.confidence)||3,
          evidenceType:f.evidence_type||'mixed',
          sourceIds:ids,
          sourceTitle:source.title||'Sources',
          sourceUrl:source.url||'',
          domain:source.url?host(source.url):'Sources',
          sourceEvidence:f.explanation||''
        };
      });

      const result={
        id:String(Date.now()),
        topic:data.title||mission,
        mission,
        mode:'topic',
        created_at:Math.floor(Date.now()/1000),
        source_count:accepted.length,
        pages:accepted.map(s=>({title:s.title||'Source',url:s.url||'',domain:s.url?host(s.url):'Source',sections:[],word_count:0,relevance:s.score||0,retrieval:'agent'})),
        guide,
        acceptedSources:accepted,
        rejectedSources:rejected,
        conflicts:Array.isArray(data.conflicts)?data.conflicts:[],
        nextQuestions:Array.isArray(data.next_questions)?data.next_questions:[],
        coverage:data.coverage||{},
        executiveSummary:data.executive_summary||'',
        map:guide.slice(0,10).map(x=>x.heading),
        notice:'LearnOS searched the web for this mission and filtered low-value sources before building this brief.'
      };

      state.result=result;
      saveHistory(result);
      renderResult();
    }catch(e){
      renderError(e.message,mission,false);
    }
  };

  renderResultBody=function(){
    if(!state.result?.acceptedSources)return oldBody();
    if(state.resultTab==='sources')return renderAgentSources(state.result);
    if(state.resultTab==='evidence')return renderAgentEvidence(state.result);
    if(state.resultTab==='map')return renderAgentCoverage(state.result);
    return renderAgentGuide(state.result);
  };

  function renderAgentGuide(r){
    const findings=r.guide||[];
    return '<div class="reader-layout"><article class="reader">'+
      '<div class="mission-banner"><span>Research mission</span><strong>'+escapeHtml(r.mission)+'</strong></div>'+
      (r.executiveSummary?'<section class="agent-summary"><div class="agent-label">Executive summary</div><p>'+escapeHtml(r.executiveSummary)+'</p></section>':'')+
      '<div class="notice">'+escapeHtml(r.notice||'')+'</div>'+
      findings.map((x,i)=>'<section class="article-section agent-finding" id="sec-'+i+'">'+
        '<div class="agent-finding-tags"><span>Novelty '+(x.importance||3)+'/5</span><span>Confidence '+(x.confidence||3)+'/5</span><span>'+escapeHtml(x.evidenceType||'mixed')+'</span></div>'+
        '<h2>'+escapeHtml(x.heading)+'</h2><p>'+escapeHtml(x.text)+'</p>'+
        (x.whyItMatters?'<div class="why-box"><b>Why it matters</b><span>'+escapeHtml(x.whyItMatters)+'</span></div>':'')+
        '<button class="source-chip" data-agent-source="'+i+'">'+((x.sourceIds||[]).length||1)+' source'+(((x.sourceIds||[]).length||1)===1?'':'s')+'</button>'+
      '</section>').join('')+
      renderConflicts(r)+renderNext(r)+
      '</article><aside class="side-index"><div class="label">Findings</div>'+
      findings.slice(0,10).map((x,i)=>'<button class="index-link" data-jump="sec-'+i+'">'+escapeHtml(x.heading)+'</button>').join('')+
      '</aside></div>';
  }

  function renderConflicts(r){
    if(!(r.conflicts||[]).length)return'';
    return '<section class="article-section"><h2>Where sources disagree</h2>'+
      r.conflicts.map(c=>'<div class="conflict-card"><strong>'+escapeHtml(c.topic||'Disagreement')+'</strong><p>'+escapeHtml(c.summary||'')+'</p>'+
      (c.resolution?'<span>'+escapeHtml(c.resolution)+'</span>':'')+'</div>').join('')+'</section>';
  }

  function renderNext(r){
    if(!(r.nextQuestions||[]).length)return'';
    return '<section class="article-section"><h2>Best rabbit holes from here</h2><div class="next-question-list">'+
      r.nextQuestions.map(q=>'<button class="next-question" data-next-agent="'+escapeHtml(q)+'">'+escapeHtml(q)+' <span>→</span></button>').join('')+
      '</div></section>';
  }

  function renderAgentEvidence(r){
    return '<div class="evidence-list">'+(r.guide||[]).map((x,i)=>
      '<article class="evidence-card"><div class="source-line"><span>'+escapeHtml(x.evidenceType||'Evidence')+'</span><span>Finding '+(i+1)+'</span></div>'+
      '<h3>'+escapeHtml(x.heading)+'</h3><blockquote>'+escapeHtml(x.sourceEvidence||x.text)+'</blockquote>'+
      '<button class="source-chip" data-agent-source="'+i+'">Supporting sources</button></article>'
    ).join('')+'</div>';
  }

  function renderAgentSources(r){
    return '<div class="agent-source-wrap">'+
      '<section><h2>Accepted sources <span>'+r.acceptedSources.length+'</span></h2><div class="sources-list">'+
      r.acceptedSources.map(s=>sourceCard(s,true)).join('')+'</div></section>'+
      '<details class="agent-rejected"><summary>Rejected sources <span>'+r.rejectedSources.length+'</span></summary><div class="sources-list">'+
      r.rejectedSources.map(s=>sourceCard(s,false)).join('')+'</div></details>'+
      '</div>';
  }

  function sourceCard(s,ok){
    return '<article class="source-card '+(ok?'accepted-source':'rejected-source')+'">'+
      '<div class="source-line"><span>'+(ok?'Accepted':'Rejected')+(s.source_type?' · '+escapeHtml(s.source_type):'')+'</span><span>'+escapeHtml(ok?(s.score??'—')+'/100':(s.rejection_type||''))+'</span></div>'+
      '<h3>'+escapeHtml(s.title||'Source')+'</h3><p>'+escapeHtml(ok?(s.why_accepted||''):(s.reason||''))+'</p>'+
      (s.url?'<a href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>':'')+
      '</article>';
  }

  function renderAgentCoverage(r){
    const c=r.coverage||{};
    return '<div class="map-wrap"><div class="map-root"><div class="eyebrow">Research coverage</div><div class="map-topic">'+escapeHtml(r.mission)+'</div>'+
      '<div class="coverage-grid"><div><strong>'+escapeHtml(c.strong_source_count??r.acceptedSources.length)+'</strong><span>strong sources</span></div>'+
      '<div><strong>'+escapeHtml(c.rejected_source_count??r.rejectedSources.length)+'</strong><span>rejected</span></div>'+
      '<div><strong>'+escapeHtml((c.searched_angles||[]).length)+'</strong><span>search angles</span></div></div></div>'+
      ((c.searched_angles||[]).length?'<div class="coverage-card"><h3>Search angles</h3><div class="map-nodes">'+c.searched_angles.map(x=>'<span class="map-node">'+escapeHtml(x)+'</span>').join('')+'</div></div>':'')+
      ((c.gaps||[]).length?'<div class="coverage-card"><h3>Remaining gaps</h3><ul>'+c.gaps.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul></div>':'')+
      '</div>';
  }

  function openFindingSources(i){
    const finding=state.result?.guide?.[i];
    if(!finding)return;
    const ids=new Set((finding.sourceIds||[]).map(String));
    const sources=(state.result.acceptedSources||[]).filter((s,j)=>ids.has(String(s.id||j+1)));
    $('#drawer-content').innerHTML='<div class="domain">Supporting sources</div><h2>'+escapeHtml(finding.heading)+'</h2>'+
      sources.map(s=>'<div class="drawer-source"><strong>'+escapeHtml(s.title||'Source')+'</strong><span>'+escapeHtml(s.why_accepted||'')+'</span>'+
      (s.url?'<a href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>':'')+'</div>').join('');
    const d=$('#drawer');d.classList.add('open');d.setAttribute('aria-hidden','false');
  }

  document.addEventListener('click',e=>{
    const src=e.target.closest('[data-agent-source]');
    if(src){e.preventDefault();openFindingSources(Number(src.dataset.agentSource));return}
    const next=e.target.closest('[data-next-agent]');
    if(next){
      e.preventDefault();
      state.mode='topic';
      renderHome();
      setTimeout(()=>{const input=$('#research-input');if(input){input.value=next.dataset.nextAgent;input.focus()}},30);
    }
  });

  renderHome();
})();
