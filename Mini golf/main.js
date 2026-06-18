(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;
  const VIEW_COLS = 27;
  const VIEW_ROWS = 16;
  const CELL_SIZE = CANVAS_WIDTH / VIEW_COLS;
  const VIEW_WIDTH = CELL_SIZE * VIEW_COLS;
  const VIEW_HEIGHT = CELL_SIZE * VIEW_ROWS;
  const VIEW_Y_OFFSET = (CANVAS_HEIGHT - VIEW_HEIGHT) / 2;

  const MODE_PLAY = 'play';
  const MODE_EDITOR = 'editor';
  const TOOL_BOX = 'box';
  const TOOL_SPHERE = 'sphere';
  const TOOL_WIN = 'win';

  const EDITOR_COLS = 40;
  const EDITOR_ROWS = 24;
  const GRID_ROWS = EDITOR_ROWS;
  const MIN_MAP_COLS = VIEW_COLS;
  const MIN_MAP_ROWS = VIEW_ROWS;

  const GRAVITY = 22;
  const AIR_FRICTION = 0.03;
  const MAX_LAUNCH_SPEED = 20;
  const WALL_DAMPING = 0.85;
  const COLLISION_DAMPING = 0.85;
  const BALL_RADIUS = 0.45;

  window.app = {
    mode: MODE_PLAY,
    selectedTool: null,
    editorGrid: createEmptyGrid(EDITOR_COLS),
    editorCamera: { x: VIEW_COLS / 2, y: VIEW_ROWS / 2 },
    camera: { x: VIEW_COLS / 2, y: VIEW_ROWS / 2, targetX: VIEW_COLS / 2, targetY: VIEW_ROWS / 2 },
    dragState: { active: false, startX: 0, startY: 0, startCamX: 0, startCamY: 0 },
    objects: [],
    ball: null,
    worldBounds: { x: 0, y: 0, width: VIEW_COLS, height: VIEW_ROWS },
    winTriggered: false,
    paused: false,
    playButton: null,
    editorButton: null,
    blockTile: null,
    sphereTile: null,
    winTile: null,
  };

  function createEmptyGrid(cols){
    return Array.from({ length: GRID_ROWS }, () => Array(cols).fill(null));
  }

  function initDefaultEditorGrid(){
    app.editorGrid = createEmptyGrid(EDITOR_COLS);
    app.editorGrid[12][1] = { type: TOOL_BOX };
    app.editorGrid[12][2] = { type: TOOL_BOX };
    app.editorGrid[12][3] = { type: TOOL_BOX };
    app.editorGrid[11][3] = { type: TOOL_BOX };
    app.editorGrid[10][3] = { type: TOOL_BOX };
    app.editorGrid[9][9] = { type: TOOL_SPHERE };
    app.editorGrid[8][16] = { type: TOOL_BOX };
    app.editorGrid[9][16] = { type: TOOL_BOX };
    app.editorGrid[10][16] = { type: TOOL_BOX };
    app.editorGrid[13][26] = { type: TOOL_WIN };
  }

  function syncLevelFromGrid(){
    app.objects = [];
    app.winTriggered = false;
    for (let row = 0; row < GRID_ROWS; row++){
      for (let col = 0; col < EDITOR_COLS; col++){
        const cell = app.editorGrid[row][col];
        if (!cell) continue;
        const x = col + 0.5;
        const y = row + 0.5;
        if (cell.type === TOOL_BOX){
          app.objects.push({ type: TOOL_BOX, x: col, y: row, w: 1, h: 1 });
        } else if (cell.type === TOOL_SPHERE){
          app.objects.push({ type: TOOL_SPHERE, x: x, y: y, r: 0.5 });
        } else if (cell.type === TOOL_WIN){
          app.objects.push({ type: TOOL_WIN, x: col, y: row, w: 1, h: 1 });
        }
      }
    }
    if (!app.ball){
      initBall({ x: 1.5, y: GRID_ROWS - 1.5 });
    }
    updateWorldBounds();
  }

  function updateWorldBounds(){
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const obj of app.objects){
      if (obj.type === TOOL_BOX || obj.type === TOOL_WIN){
        minX = Math.min(minX, obj.x);
        maxX = Math.max(maxX, obj.x + obj.w);
        minY = Math.min(minY, obj.y);
        maxY = Math.max(maxY, obj.y + obj.h);
      } else if (obj.type === TOOL_SPHERE){
        minX = Math.min(minX, obj.x - obj.r);
        maxX = Math.max(maxX, obj.x + obj.r);
        minY = Math.min(minY, obj.y - obj.r);
        maxY = Math.max(maxY, obj.y + obj.r);
      }
    }
    if (app.ball){
      minX = Math.min(minX, app.ball.x - app.ball.r);
      maxX = Math.max(maxX, app.ball.x + app.ball.r);
      minY = Math.min(minY, app.ball.y - app.ball.r);
      maxY = Math.max(maxY, app.ball.y + app.ball.r);
    }
    if (!isFinite(minX)){
      minX = 0;
      maxX = VIEW_COLS;
      minY = 0;
      maxY = VIEW_ROWS;
    }
    const width = Math.max(maxX - minX, MIN_MAP_COLS);
    const height = Math.max(maxY - minY, MIN_MAP_ROWS);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    app.worldBounds.width = width;
    app.worldBounds.height = height;
    app.worldBounds.x = Math.max(0, centerX - width / 2);
    app.worldBounds.y = Math.max(0, centerY - height / 2);
    if (app.worldBounds.x + width > EDITOR_COLS){
      app.worldBounds.x = Math.max(0, EDITOR_COLS - width);
    }
    app.worldBounds.y = Math.max(0, Math.min(app.worldBounds.y, GRID_ROWS - height));
  }

  function initBall(start){
    app.ball = new Ball(start.x, start.y, BALL_RADIUS);
    app.ball.vx = 0;
    app.ball.vy = 0;
  }

  class Ball {
    constructor(x, y, r){
      this.x = x;
      this.y = y;
      this.r = r;
      this.vx = 0;
      this.vy = 0;
      this.m = r * r;
    }
    applyFriction(dt){
      const k = Math.max(0, 1 - AIR_FRICTION * dt);
      this.vx *= k;
      this.vy *= k;
    }
    update(dt){
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    draw(ctx){
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function clamp(value, min, max){ return Math.min(max, Math.max(min, value)); }

  function updateCamera(dt){
    if (app.mode === MODE_PLAY){
      const halfW = VIEW_COLS / 2;
      const halfH = VIEW_ROWS / 2;
      const bounds = app.worldBounds;
      const minX = bounds.x + halfW;
      const maxX = bounds.x + bounds.width - halfW;
      const minY = bounds.y + halfH;
      const maxY = bounds.y + bounds.height - halfH;
      const targetX = clamp(app.ball.x, minX, Math.max(minX, maxX));
      const targetY = clamp(app.ball.y, minY, Math.max(minY, maxY));
      app.camera.targetX = targetX;
      app.camera.targetY = targetY;
      app.camera.x += (targetX - app.camera.x) * 0.08;
      app.camera.y += (targetY - app.camera.y) * 0.08;
    } else {
      app.camera.targetX = clamp(app.editorCamera.x, VIEW_COLS / 2, Math.max(VIEW_COLS / 2, EDITOR_COLS - VIEW_COLS / 2));
      app.camera.targetY = clamp(app.editorCamera.y, VIEW_ROWS / 2, Math.max(VIEW_ROWS / 2, EDITOR_ROWS - VIEW_ROWS / 2));
      app.camera.x += (app.camera.targetX - app.camera.x) * 0.12;
      app.camera.y += (app.camera.targetY - app.camera.y) * 0.12;
    }
  }

  function getCanvasWorldCoords(event){
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    const worldX = (x / CELL_SIZE) + app.camera.x - VIEW_COLS / 2;
    const worldY = ((y - VIEW_Y_OFFSET) / CELL_SIZE) + app.camera.y - VIEW_ROWS / 2;
    return { x: worldX, y: worldY, screenX: x, screenY: y };
  }

  function toggleTileAt(world){
    const col = Math.floor(world.x);
    const row = Math.floor(world.y);
    if (col < 0 || col >= EDITOR_COLS || row < 0 || row >= GRID_ROWS) return;
    if (!app.selectedTool) return;
    const current = app.editorGrid[row][col];
    if (current && current.type === app.selectedTool){
      app.editorGrid[row][col] = null;
    } else {
      app.editorGrid[row][col] = { type: app.selectedTool };
    }
    syncLevelFromGrid();
  }

  function handleEditorDrag(deltaX, deltaY){
    if (app.selectedTool) return;
    app.editorCamera.x = clamp(app.dragState.startCamX - deltaX / CELL_SIZE, VIEW_COLS / 2, EDITOR_COLS - VIEW_COLS / 2);
    app.editorCamera.y = clamp(app.dragState.startCamY - deltaY / CELL_SIZE, VIEW_ROWS / 2, EDITOR_ROWS - VIEW_ROWS / 2);
  }

  function handleBallLaunch(world){
    if (!world || !app.ball) return;
    const dx = world.x - app.ball.x;
    const dy = world.y - app.ball.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;
    const speed = Math.min(dist, 5) / 5 * MAX_LAUNCH_SPEED;
    app.ball.vx = dx / dist * speed;
    app.ball.vy = dy / dist * speed;
  }

  function handleWallAndBounds(){
    const left = app.worldBounds.x;
    const right = app.worldBounds.x + app.worldBounds.width;
    const top = app.worldBounds.y;
    const bottom = app.worldBounds.y + app.worldBounds.height;
    if (app.ball.x - app.ball.r < left){ app.ball.x = left + app.ball.r; app.ball.vx = -app.ball.vx * WALL_DAMPING; }
    if (app.ball.x + app.ball.r > right){ app.ball.x = right - app.ball.r; app.ball.vx = -app.ball.vx * WALL_DAMPING; }
    if (app.ball.y - app.ball.r < top){ app.ball.y = top + app.ball.r; app.ball.vy = -app.ball.vy * WALL_DAMPING; }
    if (app.ball.y + app.ball.r > bottom){ app.ball.y = bottom - app.ball.r; app.ball.vy = -app.ball.vy * WALL_DAMPING; }
  }

  function handleObjectCollisions(){
    for (const obj of app.objects){
      if (obj.type === TOOL_BOX){
        handleBoxCollision(obj);
      } else if (obj.type === TOOL_SPHERE){
        handleSphereCollision(obj);
      }
    }
  }

  function handleBoxCollision(obj){
    const nearestX = Math.max(obj.x, Math.min(app.ball.x, obj.x + obj.w));
    const nearestY = Math.max(obj.y, Math.min(app.ball.y, obj.y + obj.h));
    let dx = app.ball.x - nearestX;
    let dy = app.ball.y - nearestY;
    let dist2 = dx * dx + dy * dy;
    if (dist2 > app.ball.r * app.ball.r) return;
    if (dist2 === 0){
      if (Math.abs(dx) > Math.abs(dy)) dx = app.ball.r;
      else dy = app.ball.r;
      dist2 = dx * dx + dy * dy;
    }
    const dist = Math.sqrt(dist2);
    const overlap = app.ball.r - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    app.ball.x += nx * overlap;
    app.ball.y += ny * overlap;
    const velAlong = app.ball.vx * nx + app.ball.vy * ny;
    if (velAlong < 0){
      app.ball.vx -= 2 * velAlong * nx;
      app.ball.vy -= 2 * velAlong * ny;
      app.ball.vx *= COLLISION_DAMPING;
      app.ball.vy *= COLLISION_DAMPING;
    }
  }

  function handleSphereCollision(obj){
    const dx = app.ball.x - obj.x;
    const dy = app.ball.y - obj.y;
    const dist = Math.hypot(dx, dy);
    const minDist = app.ball.r + obj.r;
    if (dist >= minDist || dist === 0) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    app.ball.x += nx * overlap;
    app.ball.y += ny * overlap;
    const velAlong = app.ball.vx * nx + app.ball.vy * ny;
    if (velAlong < 0){
      app.ball.vx -= 2 * velAlong * nx;
      app.ball.vy -= 2 * velAlong * ny;
      app.ball.vx *= COLLISION_DAMPING;
      app.ball.vy *= COLLISION_DAMPING;
    }
  }

  function checkWinZones(){
    for (const obj of app.objects){
      if (obj.type !== TOOL_WIN) continue;
      if (app.ball.x - app.ball.r >= obj.x &&
          app.ball.x + app.ball.r <= obj.x + obj.w &&
          app.ball.y - app.ball.r >= obj.y &&
          app.ball.y + app.ball.r <= obj.y + obj.h){
        if (!app.winTriggered){
          console.log('You win!');
          app.winTriggered = true;
        }
        return;
      }
    }
    app.winTriggered = false;
  }

  function draw(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    ctx.fillStyle = '#2a9df4';
    ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    ctx.save();
    ctx.translate(0, VIEW_Y_OFFSET);
    ctx.scale(CELL_SIZE, CELL_SIZE);
    const left = app.camera.x - VIEW_COLS / 2;
    const top = app.camera.y - VIEW_ROWS / 2;
    ctx.translate(-left, -top);

    if (app.mode === MODE_EDITOR){
      drawGrid();
    }

    drawWorldBounds();
    drawObjects();
    app.ball.draw(ctx);

    if (app.mode === MODE_PLAY){
      drawAimLine();
    }
    ctx.restore();
    drawUiOverlay();
  }

  function drawGrid(){
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1 / CELL_SIZE;
    for (let col = 0; col <= EDITOR_COLS; col++){
      ctx.beginPath();
      ctx.moveTo(col, 0);
      ctx.lineTo(col, GRID_ROWS);
      ctx.stroke();
    }
    for (let row = 0; row <= GRID_ROWS; row++){
      ctx.beginPath();
      ctx.moveTo(0, row);
      ctx.lineTo(EDITOR_COLS, row);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorldBounds(){
    const b = app.worldBounds;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,0,0.9)';
    ctx.lineWidth = 0.08;
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.restore();
  }

  function drawObjects(){
    for (const obj of app.objects){
      if (obj.type === TOOL_BOX){
        ctx.fillStyle = '#1f2f62';
        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      } else if (obj.type === TOOL_SPHERE){
        ctx.beginPath();
        ctx.fillStyle = '#18376d';
        ctx.arc(obj.x, obj.y, obj.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (obj.type === TOOL_WIN){
        ctx.save();
        ctx.fillStyle = 'rgba(255,230,60,0.5)';
        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
        ctx.strokeStyle = '#ffde59';
        ctx.lineWidth = 0.08;
        ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
        ctx.restore();
      }
    }
  }

  function drawAimLine(){
    if (app.mode !== MODE_PLAY || app.paused || !app.pointerWorld || !app.ball) return;
    const dx = app.pointerWorld.x - app.ball.x;
    const dy = app.pointerWorld.y - app.ball.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.1) return;
    const clamped = Math.min(length, 5);
    const nx = dx / length;
    const ny = dy / length;
    const tipX = app.ball.x + nx * clamped;
    const tipY = app.ball.y + ny * clamped;
    ctx.beginPath();
    ctx.strokeStyle = '#ffde59';
    ctx.lineWidth = 0.12;
    ctx.moveTo(app.ball.x, app.ball.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    if (length > 5){
      ctx.beginPath();
      ctx.arc(tipX, tipY, 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#ffde59';
      ctx.fill();
    }
  }

  function drawUiOverlay(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#ffffff';
    if (app.mode === MODE_EDITOR){
      ctx.fillText('Editor mode: drag with no tool to pan', 12, 20);
    }
    if (app.mode === MODE_PLAY){
      const text = app.paused ? 'PAUSED - press P to resume' : 'Play mode: press P to pause';
      ctx.fillText(text, 12, 20);
    }
  }

  function update(dt){
    if (app.mode === MODE_PLAY && !app.paused){
      app.ball.vy += GRAVITY * dt;
      app.ball.applyFriction(dt);
      app.ball.update(dt);
      handleWallAndBounds();
      handleObjectCollisions();
      checkWinZones();
    }
    updateCamera(dt);
  }

  function loop(now){
    const dt = Math.min(0.05, (now - app.lastTime) / 1000);
    app.lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function setMode(newMode){
    app.mode = newMode;
    if (newMode === MODE_PLAY){
      app.paused = false;
      app.selectedTool = null;
      syncLevelFromGrid();
      app.camera.x = clamp(app.ball.x, VIEW_COLS/2, Math.max(VIEW_COLS/2, app.worldBounds.x + app.worldBounds.width - VIEW_COLS/2));
      app.camera.y = clamp(app.ball.y, VIEW_ROWS/2, Math.max(VIEW_ROWS/2, app.worldBounds.y + app.worldBounds.height - VIEW_ROWS/2));
    } else {
      app.camera.x = app.editorCamera.x;
      app.camera.y = app.editorCamera.y;
      app.camera.targetX = app.camera.x;
      app.camera.targetY = app.camera.y;
    }
  }

  function init(){
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    initDefaultEditorGrid();
    syncLevelFromGrid();
    app.lastTime = performance.now();
    if (!window.setMode) window.setMode = setMode;
    app.lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousedown', (event) => {
    if (app.mode !== MODE_EDITOR) return;
    if (app.selectedTool) return;
    app.dragState.active = true;
    app.dragState.startX = event.clientX;
    app.dragState.startY = event.clientY;
    app.dragState.startCamX = app.editorCamera.x;
    app.dragState.startCamY = app.editorCamera.y;
  });

  canvas.addEventListener('mousemove', (event) => {
    const world = getCanvasWorldCoords(event);
    app.pointerWorld = world;
    if (app.mode === MODE_EDITOR && app.dragState.active && !app.selectedTool){
      handleEditorDrag(event.clientX - app.dragState.startX, event.clientY - app.dragState.startY);
    }
  });

  window.addEventListener('mouseup', () => {
    if (app.mode === MODE_EDITOR){
      app.dragState.active = false;
    }
  });

  canvas.addEventListener('click', (event) => {
    if (app.mode === MODE_EDITOR && app.selectedTool){
      const world = getCanvasWorldCoords(event);
      toggleTileAt(world);
      return;
    }
    if (app.mode === MODE_PLAY && !app.paused){
      const world = getCanvasWorldCoords(event);
      handleBallLaunch(world);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    app.dragState.active = false;
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyP' && app.mode === MODE_PLAY){
      app.paused = !app.paused;
      return;
    }
    if (app.mode === MODE_EDITOR){
      let dx = 0;
      let dy = 0;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') dx = -1;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') dx = 1;
      if (event.code === 'ArrowUp' || event.code === 'KeyW') dy = -1;
      if (event.code === 'ArrowDown' || event.code === 'KeyS') dy = 1;
      if (dx || dy){
        app.editorCamera.x = clamp(app.editorCamera.x + dx, VIEW_COLS / 2, EDITOR_COLS - VIEW_COLS / 2);
        app.editorCamera.y = clamp(app.editorCamera.y + dy, VIEW_ROWS / 2, EDITOR_ROWS - VIEW_ROWS / 2);
        return;
      }
    }
    if (event.code === 'KeyK'){
      app.debugMode = !app.debugMode;
    }
  });

  window.game = {
    syncLevelFromGrid,
    setMode,
    get app(){ return app; }
  };

  init();
})();
