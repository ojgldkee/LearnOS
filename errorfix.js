
(function(){
  renderError=function(message, original, canImport=false){
    const protectedMode=Boolean(canImport);
    $('#view').innerHTML=
      '<div class="error-box">'+
        '<div class="eyebrow">'+(protectedMode?'Protected source detected':'Research error')+'</div>'+
        '<h2>'+(protectedMode?'This site needs browser import.':'Research could not finish.')+'</h2>'+
        '<p>'+escapeHtml(message)+'</p>'+
        '<div class="error-actions">'+
          (protectedMode
            ? '<button class="btn primary" data-action="protected-import">Open & Import</button><button class="btn" data-action="home">Back to research</button>'
            : '<button class="btn primary" data-action="home">Try again</button>')+
        '</div>'+
        '<p style="margin-top:14px;font-size:12px">'+
          (protectedMode
            ? 'LearnOS did not use the CAPTCHA or bot-check page as research content.'
            : 'Your saved research was not changed.')+
        '</p>'+
      '</div>';
  };
})();
