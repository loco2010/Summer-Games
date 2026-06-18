(function(){
  const playButton = document.getElementById('playButton');
  const editorButton = document.getElementById('editorButton');
  const toolButtons = Array.from(document.querySelectorAll('.tool'));

  function setMode(mode){
    window.game.setMode(mode);
    updateModeButtons();
    if (mode === 'play'){
      app.selectedTool = null;
      updateToolSelection();
    }
  }

  function updateModeButtons(){
    playButton.classList.toggle('active', app.mode === 'play');
    editorButton.classList.toggle('active', app.mode === 'editor');
  }

  function updateToolSelection(){
    toolButtons.forEach(button => {
      const tool = button.dataset.tool;
      button.classList.toggle('selected', app.selectedTool === tool);
    });
  }

  playButton.addEventListener('click', () => setMode('play'));
  editorButton.addEventListener('click', () => setMode('editor'));

  toolButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (app.mode !== 'editor') return;
      const tool = button.dataset.tool;
      app.selectedTool = app.selectedTool === tool ? null : tool;
      updateToolSelection();
    });
  });

  updateModeButtons();
  updateToolSelection();
})();
