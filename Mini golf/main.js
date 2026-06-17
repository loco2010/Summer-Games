(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Physics parameters
  const AIR_FRICTION = 0.15; // fraction of speed lost per second to air
  const GRAVITY = 500; // downward acceleration in CSS pixels per second squared
  const COLLISION_DAMPING = 0.9; // multiply velocities by this on each ball-ball collision
  const WALL_DAMPING = 0.9; // bounce damping on wall collisions
  const MAX_AIM_LENGTH = 120;
  const MAX_LAUNCH_SPEED = 1200;

  // Ball class
  class Ball {
    constructor(x, y, r, vx = 0, vy = 0) {
      this.x = x;
      this.y = y;
      this.r = r;
      this.vx = vx;
      this.vy = vy;
      this.m = r * r; // mass ~ area
    }
    applyAirFriction(dt){
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

  let balls = [];
  let selectedBall = null;
  let pointerPos = null;

  function initBall(w, h){
    balls = [];
    selectedBall = null;
    pointerPos = null;
    const radius = Math.max(10, Math.floor(Math.min(w,h) * 0.06));
    const margin = radius + 20;
    // single ball in the bottom-left corner
    balls.push(new Ball(margin, h - margin, radius, 0, 0));
  }

  let obstacle = null;

  function handleWallCollisions(ball, w, h){
    let collided = false;
    if (ball.x - ball.r < 0){ ball.x = ball.r; ball.vx = -ball.vx * WALL_DAMPING; collided = true; }
    if (ball.x + ball.r > w){ ball.x = w - ball.r; ball.vx = -ball.vx * WALL_DAMPING; collided = true; }
    if (ball.y - ball.r < 0){ ball.y = ball.r; ball.vy = -ball.vy * WALL_DAMPING; collided = true; }
    if (ball.y + ball.r > h){ ball.y = h - ball.r; ball.vy = -ball.vy * WALL_DAMPING; collided = true; }
    if (collided){ ball.vx *= COLLISION_DAMPING; ball.vy *= COLLISION_DAMPING; }
  }

  function handleObstacleCollision(ball){
    if (!obstacle) return;
    const nearestX = Math.max(obstacle.x, Math.min(ball.x, obstacle.x + obstacle.w));
    const nearestY = Math.max(obstacle.y, Math.min(ball.y, obstacle.y + obstacle.h));
    let dx = ball.x - nearestX;
    let dy = ball.y - nearestY;
    let dist2 = dx * dx + dy * dy;
    if (dist2 > ball.r * ball.r) return;

    let nx = 0;
    let ny = -1;
    let overlap = ball.r;
    if (dist2 === 0) {
      const left = ball.x - obstacle.x;
      const right = obstacle.x + obstacle.w - ball.x;
      const top = ball.y - obstacle.y;
      const bottom = obstacle.y + obstacle.h - ball.y;
      const minEdge = Math.min(left, right, top, bottom);
      if (minEdge === left) { nx = -1; ny = 0; overlap = ball.r + left; }
      else if (minEdge === right) { nx = 1; ny = 0; overlap = ball.r + right; }
      else if (minEdge === top) { nx = 0; ny = -1; overlap = ball.r + top; }
      else { nx = 0; ny = 1; overlap = ball.r + bottom; }
    } else {
      const dist = Math.sqrt(dist2);
      nx = dx / dist;
      ny = dy / dist;
      overlap = ball.r - dist;
    }

    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const velAlong = ball.vx * nx + ball.vy * ny;
    if (velAlong < 0) {
      ball.vx -= 2 * velAlong * nx;
      ball.vy -= 2 * velAlong * ny;
      ball.vx *= COLLISION_DAMPING;
      ball.vy *= COLLISION_DAMPING;
    }
  }

  function getCanvasCoords(event){
    const rect = canvas.getBoundingClientRect();
    const canvasW = canvas.width / (window.devicePixelRatio || 1);
    const canvasH = canvas.height / (window.devicePixelRatio || 1);
    return {
      x: (event.clientX - rect.left) * (canvasW / rect.width),
      y: (event.clientY - rect.top) * (canvasH / rect.height),
    };
  }

  function selectBallAt(event){
    const pos = getCanvasCoords(event);
    if (!selectedBall){
      for (const b of balls){
        const dx = pos.x - b.x;
        const dy = pos.y - b.y;
        if (dx*dx + dy*dy <= b.r * b.r){
          selectedBall = b;
          pointerPos = pos;
          return;
        }
      }
      return;
    }

    const dx = pos.x - selectedBall.x;
    const dy = pos.y - selectedBall.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01){
      const power = Math.min(dist, MAX_AIM_LENGTH) / MAX_AIM_LENGTH;
      const nx = dx / dist;
      const ny = dy / dist;
      selectedBall.vx = -nx * MAX_LAUNCH_SPEED * power;
      selectedBall.vy = -ny * MAX_LAUNCH_SPEED * power;
    }
    selectedBall = null;
    pointerPos = null;
  }

  function updatePointer(event){
    if (!selectedBall) return;
    pointerPos = getCanvasCoords(event);
  }

  function resize(){
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    // Reinitialize balls to use new canvas coordinate system
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    initBall(cssW, cssH);
    const boxSize = Math.min(cssW, cssH) * 0.35;
    obstacle = {
      x: (cssW - boxSize) / 2,
      y: (cssH - boxSize) / 2,
      w: boxSize,
      h: boxSize,
    };
  }

  let paused = false;
  let last = performance.now();
  function loop(now){
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    if (!paused) {
      const dt = Math.min(0.05, (now - last) / 1000); // cap dt to avoid large steps
      last = now;

      // physics update
      for (const b of balls){
        b.vy += GRAVITY * dt; // gravity acceleration
        b.applyAirFriction(dt);
        b.update(dt);
        handleWallCollisions(b, w, h);
        handleObstacleCollision(b);
      }
    } else {
      // keep last time fresh so the first unpause frame is stable
      last = now;
    }

    // draw
    ctx.fillStyle = '#2a9df4';
    ctx.fillRect(0,0,w,h);
    if (obstacle) {
      ctx.fillStyle = '#1f2f62';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
    }
    for (const b of balls){
      b.draw(ctx);
      if (selectedBall === b){
        ctx.beginPath();
        ctx.strokeStyle = '#ffde59';
        ctx.lineWidth = 4;
        ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (selectedBall && pointerPos){
      const dx = pointerPos.x - selectedBall.x;
      const dy = pointerPos.y - selectedBall.y;
      const length = Math.hypot(dx, dy);
      if (length > 0.01){
        const clamped = Math.min(length, MAX_AIM_LENGTH);
        const nx = dx / length;
        const ny = dy / length;
        const tipX = selectedBall.x + nx * clamped;
        const tipY = selectedBall.y + ny * clamped;
        ctx.beginPath();
        ctx.strokeStyle = '#ffde59';
        ctx.lineWidth = 3;
        ctx.moveTo(selectedBall.x, selectedBall.y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        if (length > MAX_AIM_LENGTH){
          ctx.beginPath();
          ctx.arc(tipX, tipY, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#ffde59';
          ctx.fill();
        }
      }
    }

    if (paused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Paused', w / 2, h / 2);
    }

    requestAnimationFrame(loop);
  }

  // Resize on window changes and when fonts/loaders may change sizes
  window.addEventListener('resize', resize);
  window.addEventListener('click', selectBallAt);
  window.addEventListener('mousemove', updatePointer);
  window.addEventListener('mouseleave', () => { if (selectedBall) pointerPos = null; });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      paused = !paused;
      if (!paused) {
        last = performance.now();
      }
    }
  });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(canvas);
  }

  // Initial sizing after DOM is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') resize();
  else window.addEventListener('DOMContentLoaded', resize);

  // start loop
  requestAnimationFrame((t)=>{ last = t; loop(t); });
})();
