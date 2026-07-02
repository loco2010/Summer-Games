(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const rackButton = document.getElementById('rackButton');
  const resetButton = document.getElementById('resetButton');
  const statusEl = document.getElementById('status');
  const instructionsEl = document.getElementById('instructions');
  const turnIndicatorEl = document.getElementById('turnIndicator');
  const menuOverlay = document.getElementById('menuOverlay');
  const twoPlayerButton = document.getElementById('twoPlayerButton');
  const aiButton = document.getElementById('aiButton');

  const TABLE = {
    x: 80,
    y: 70,
    width: 740,
    height: 460,
    rail: 24,
    pockets: [
      { x: 80, y: 70, r: 24 },
      { x: 450, y: 70, r: 24 },
      { x: 820, y: 70, r: 24 },
      { x: 80, y: 530, r: 24 },
      { x: 450, y: 530, r: 24 },
      { x: 820, y: 530, r: 24 }
    ]
  };

  const BALL_COLORS = {
    0: '#ffffff',
    1: '#f7d154',
    2: '#1d4ed8',
    3: '#dc2626',
    4: '#7e22ce',
    5: '#f97316',
    6: '#0f766e',
    7: '#111827',
    8: '#fbbf24',
    9: '#4f46e5',
    10: '#ef4444',
    11: '#a855f7',
    12: '#f59e0b',
    13: '#2dd4bf',
    14: '#6b7280',
    15: '#ec4899'
  };

  const MAX_SHOT_POWER = 8.2;
  const MAX_AIM_LINE_LENGTH = 140;
  const MIN_SHOT_POWER = 2.2;
  const FRICTION = 0.992;

  const state = {
    balls: [],
    aiming: false,
    aimStart: null,
    aimEnd: null,
    turn: 'player-1',
    gameOver: false,
    winner: null,
    groups: { 'player-1': null, 'player-2': null },
    pocketedByPlayer: { 'player-1': [], 'player-2': [] },
    mode: 'menu',
    aiEnabled: false,
    message: 'Choose a mode to start playing.'
  };

  let lastTime = 0;

  function resetGame() {
    state.balls = [];
    state.turn = 'player-1';
    state.gameOver = false;
    state.winner = null;
    state.groups = { 'player-1': null, 'player-2': null };
    state.pocketedByPlayer = { 'player-1': [], 'player-2': [] };
    state.message = 'Rack set. Drag from the cue ball to shoot.';
    rackBalls();
    updateHud();
  }

  function startGame(mode) {
    state.mode = mode;
    state.aiEnabled = mode === 'ai';
    menuOverlay.classList.add('hidden');
    resetGame();
  }

  function rackBalls() {
    state.balls = [];

    const centerX = TABLE.x + TABLE.width / 2;
    const centerY = TABLE.y + TABLE.height / 2;
    const rackY = centerY - 70;
    const rackX = TABLE.x + 180;

    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const rows = [1, 2, 3, 4, 5];
    let index = 0;

    for (let row = 0; row < rows.length; row += 1) {
      const ballsInRow = row + 1;
      const startX = rackX + row * 14;
      const y = rackY + row * 14;
      for (let ballIndex = 0; ballIndex < ballsInRow; ballIndex += 1) {
        const number = numbers[index];
        const x = startX + ballIndex * 28;
        state.balls.push(createBall(number, x, y));
        index += 1;
      }
    }

    state.balls.push(createBall(0, TABLE.x + 130, centerY));
    updateHud();
  }

  function createBall(number, x, y) {
    return {
      number,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 11,
      pocketed: false
    };
  }

  function updateHud() {
    const activePlayer = state.turn === 'player-1' ? 'Player 1' : 'Player 2';
    statusEl.textContent = state.message;
    if (state.gameOver && state.winner) {
      instructionsEl.textContent = `${state.winner === 'player-1' ? 'Player 1' : 'Player 2'} wins the match.`;
    } else {
      instructionsEl.textContent = `${activePlayer}: drag from the white cue ball to send it rolling.`;
    }
    turnIndicatorEl.textContent = state.gameOver ? `Winner: ${state.winner === 'player-1' ? 'Player 1' : 'Player 2'}` : `Turn: ${activePlayer}`;
    turnIndicatorEl.className = state.gameOver ? 'turn-pill player-1' : `turn-pill ${state.turn}`;
  }

  function getCueBall() {
    return state.balls.find((ball) => ball.number === 0 && !ball.pocketed) || null;
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function handlePointerDown(event) {
    if (state.gameOver) return;

    const point = getCanvasPoint(event);
    const cueBall = getCueBall();
    if (!cueBall) return;

    const moving = Math.hypot(cueBall.vx, cueBall.vy) > 0.05;
    if (moving) return;

    const distanceToCue = Math.hypot(point.x - cueBall.x, point.y - cueBall.y);
    if (distanceToCue > cueBall.radius + 12) return;

    state.aiming = true;
    state.aimStart = { x: cueBall.x, y: cueBall.y };
    state.aimEnd = { x: point.x, y: point.y };
  }

  function handlePointerMove(event) {
    if (!state.aiming) return;
    state.aimEnd = getCanvasPoint(event);
  }

  function handlePointerUp() {
    if (!state.aiming || state.gameOver || state.mode === 'menu') return;

    const cueBall = getCueBall();
    if (!cueBall) {
      state.aiming = false;
      return;
    }

    const dx = cueBall.x - state.aimEnd.x;
    const dy = cueBall.y - state.aimEnd.y;
    const length = Math.hypot(dx, dy);

    if (length > 4) {
      const powerRatio = Math.min(1, Math.max(0, length / MAX_AIM_LINE_LENGTH));
      const force = MIN_SHOT_POWER + (MAX_SHOT_POWER - MIN_SHOT_POWER) * powerRatio;
      cueBall.vx = (dx / length) * force;
      cueBall.vy = (dy / length) * force;
      state.message = 'Shot fired!';
      state.turn = state.turn === 'player-1' ? 'player-2' : 'player-1';
    } else {
      state.message = 'Pull back farther to shoot.';
    }

    state.aiming = false;
    state.aimStart = null;
    state.aimEnd = null;
    updateHud();
  }

  function resolveBallCollisions() {
    for (let i = 0; i < state.balls.length; i += 1) {
      const a = state.balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < state.balls.length; j += 1) {
        const b = state.balls[j];
        if (b.pocketed) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = a.radius + b.radius;

        if (distance < minDistance && distance > 0.0001) {
          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = minDistance - distance;
          const correction = overlap / 2;

          a.x -= nx * correction;
          a.y -= ny * correction;
          b.x += nx * correction;
          b.y += ny * correction;

          const relativeVelocityX = b.vx - a.vx;
          const relativeVelocityY = b.vy - a.vy;
          const speedAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;

          if (speedAlongNormal < 0) {
            const restitution = 0.98;
            const impulse = (-(1 + restitution) * speedAlongNormal) / 2;
            a.vx -= nx * impulse;
            a.vy -= ny * impulse;
            b.vx += nx * impulse;
            b.vy += ny * impulse;
          }
        }
      }
    }
  }

  function applyTableBounds() {
    for (const ball of state.balls) {
      if (ball.pocketed) continue;

      if (ball.x - ball.radius < TABLE.x) {
        ball.x = TABLE.x + ball.radius;
        ball.vx *= -0.9;
      } else if (ball.x + ball.radius > TABLE.x + TABLE.width) {
        ball.x = TABLE.x + TABLE.width - ball.radius;
        ball.vx *= -0.9;
      }

      if (ball.y - ball.radius < TABLE.y) {
        ball.y = TABLE.y + ball.radius;
        ball.vy *= -0.9;
      } else if (ball.y + ball.radius > TABLE.y + TABLE.height) {
        ball.y = TABLE.y + TABLE.height - ball.radius;
        ball.vy *= -0.9;
      }
    }
  }

  function getBallGroup(number) {
    if (number > 0 && number < 8) return 'solids';
    if (number > 8 && number < 16) return 'stripes';
    return null;
  }

  function handlePockets() {
    for (const ball of state.balls) {
      if (ball.pocketed) continue;
      for (const pocket of TABLE.pockets) {
        if (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) < pocket.r - 4) {
          if (ball.number === 0) {
            ball.x = TABLE.x + 180;
            ball.y = TABLE.y + TABLE.height / 2;
            ball.vx = 0;
            ball.vy = 0;
            state.message = 'The cue ball was pocketed. It has been respawned.';
            updateHud();
          } else if (ball.number === 8) {
            const currentPlayer = state.turn;
            const otherPlayer = currentPlayer === 'player-1' ? 'player-2' : 'player-1';
            const playerGroup = state.groups[currentPlayer];
            const hasClearedGroup = playerGroup && state.pocketedByPlayer[currentPlayer].length >= 7;
            state.gameOver = true;
            state.winner = hasClearedGroup ? currentPlayer : otherPlayer;
            state.message = hasClearedGroup ? `${currentPlayer === 'player-1' ? 'Player 1' : 'Player 2'} won by pocketing the 8-ball!` : `The 8-ball was pocketed early. ${otherPlayer === 'player-1' ? 'Player 1' : 'Player 2'} wins.`;
            ball.pocketed = true;
            ball.vx = 0;
            ball.vy = 0;
            updateHud();
          } else {
            const ballGroup = getBallGroup(ball.number);
            if (ballGroup) {
              const currentPlayer = state.turn;
              if (!state.groups[currentPlayer] && (ballGroup === 'solids' || ballGroup === 'stripes')) {
                state.groups[currentPlayer] = ballGroup;
              }
              if (state.groups[currentPlayer] === ballGroup) {
                state.pocketedByPlayer[currentPlayer].push(ball.number);
              }
            }
            ball.pocketed = true;
            ball.vx = 0;
            ball.vy = 0;
            state.message = `Ball ${ball.number} pocketed!`;
            updateHud();
          }
          break;
        }
      }
    }
  }

  function maybeRunAiTurn() {
    if (!state.aiEnabled || state.mode === 'menu' || state.gameOver) return;
    if (state.turn !== 'player-2') return;

    const cueBall = getCueBall();
    if (!cueBall || Math.hypot(cueBall.vx, cueBall.vy) > 0.05) return;

    const targetBall = state.balls.find((ball) => ball.number > 0 && ball.number !== 8 && !ball.pocketed);
    if (!targetBall) return;

    const dx = cueBall.x - targetBall.x;
    const dy = cueBall.y - targetBall.y;
    const length = Math.hypot(dx, dy);
    if (length < 20) return;

    const shouldMiss = Math.random() < 0.33;
    const missType = shouldMiss ? Math.floor(Math.random() * 3) : -1;
    let shotDx = dx;
    let shotDy = dy;
    let force = Math.min(MAX_SHOT_POWER, 4.8);

    if (shouldMiss) {
      if (missType === 0) {
        force = Math.max(MIN_SHOT_POWER * 0.6, force * 0.5);
      } else if (missType === 1) {
        force = Math.min(MAX_SHOT_POWER, force * 1.35);
      } else {
        const angleOffset = (Math.random() - 0.5) * 0.65;
        const perpendicularX = -shotDy / length;
        const perpendicularY = shotDx / length;
        shotDx = (dx / length) * 0.95 + perpendicularX * angleOffset;
        shotDy = (dy / length) * 0.95 + perpendicularY * angleOffset;
      }
    }

    const normalizedLength = Math.hypot(shotDx, shotDy) || 1;
    cueBall.vx = (shotDx / normalizedLength) * force;
    cueBall.vy = (shotDy / normalizedLength) * force;
    state.message = shouldMiss ? 'AI missed the ideal shot!' : 'AI found a strong shot!';
    state.turn = 'player-1';
    updateHud();
  }

  function updatePhysics(deltaTime) {
    const step = deltaTime * 60;

    for (const ball of state.balls) {
      if (ball.pocketed) continue;
      ball.x += ball.vx * step;
      ball.y += ball.vy * step;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;
      if (Math.abs(ball.vx) < 0.002) ball.vx = 0;
      if (Math.abs(ball.vy) < 0.002) ball.vy = 0;
    }

    resolveBallCollisions();
    applyTableBounds();
    handlePockets();
    maybeRunAiTurn();
  }

  function drawTable() {
    ctx.save();
    ctx.fillStyle = '#0c4b2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f7a3e';
    ctx.fillRect(TABLE.x, TABLE.y, TABLE.width, TABLE.height);

    ctx.strokeStyle = '#f3e8c8';
    ctx.lineWidth = 3;
    ctx.strokeRect(TABLE.x + 6, TABLE.y + 6, TABLE.width - 12, TABLE.height - 12);

    ctx.fillStyle = '#1f2937';
    for (const pocket of TABLE.pockets) {
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, pocket.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeRect(TABLE.x + TABLE.rail, TABLE.y + TABLE.rail, TABLE.width - TABLE.rail * 2, TABLE.height - TABLE.rail * 2);
    ctx.restore();
  }

  function drawBall(ball) {
    if (ball.pocketed) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = BALL_COLORS[ball.number] || '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    if (ball.number >= 9 && ball.number <= 15) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(ball.x - ball.radius * 0.55, ball.y - ball.radius * 0.6, ball.radius * 1.1, ball.radius * 1.2);
      ctx.strokeStyle = '#111827';
      ctx.strokeRect(ball.x - ball.radius * 0.55, ball.y - ball.radius * 0.6, ball.radius * 1.1, ball.radius * 1.2);
    }

    if (ball.number !== 0 && ball.number !== 8) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.number), ball.x, ball.y);
    } else if (ball.number === 8) {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAimLine() {
    const cueBall = getCueBall();
    if (!cueBall || !state.aiming || !state.aimEnd) return;

    const dx = cueBall.x - state.aimEnd.x;
    const dy = cueBall.y - state.aimEnd.y;
    const length = Math.hypot(dx, dy);

    if (length < 4) return;

    const visibleLength = Math.min(length, MAX_AIM_LINE_LENGTH);
    const endX = cueBall.x - (dx / length) * visibleLength;
    const endY = cueBall.y - (dy / length) * visibleLength;

    ctx.save();
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    drawTable();
    drawAimLine();
    for (const ball of state.balls) {
      drawBall(ball);
    }
  }

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const delta = Math.min(0.033, (timestamp - lastTime) / 1000);
    lastTime = timestamp;
    updatePhysics(delta);
    render();
    requestAnimationFrame(loop);
  }

  canvas.width = 900;
  canvas.height = 600;
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  rackButton.addEventListener('click', () => {
    if (state.mode === 'menu') return;
    rackBalls();
  });
  resetButton.addEventListener('click', () => {
    if (state.mode === 'menu') return;
    resetGame();
  });
  twoPlayerButton.addEventListener('click', () => startGame('two-player'));
  aiButton.addEventListener('click', () => startGame('ai'));

  updateHud();
  requestAnimationFrame(loop);
})();
