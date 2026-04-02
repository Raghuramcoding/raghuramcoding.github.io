// Pong Game JavaScript File

// Constants
const canvasWidth = 800;
const canvasHeight = 400;
const ballSize = 10;
const paddleWidth = 10;
const paddleHeight = 100;

// Global Variables
let ballX = canvasWidth / 2;
let ballY = canvasHeight / 2;
let ballSpeedX = 5;
let ballSpeedY = 5;

let paddle1Y = 150;
let paddle2Y = 150;
let player1Score = 0;
let player2Score = 0;

// Setup canvas
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = canvasWidth;
canvas.height = canvasHeight;
document.body.appendChild(canvas);

// Game loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Update game state
function update() {
    // Ball movement
    ballX += ballSpeedX;
    ballY += ballSpeedY;

    // Ball collision with top and bottom walls
    if (ballY <= 0 || ballY >= canvasHeight) {
        ballSpeedY = -ballSpeedY;
    }

    // Ball collision with paddles
    if (ballX <= paddleWidth && ballY > paddle1Y && ballY < paddle1Y + paddleHeight) {
        ballSpeedX = -ballSpeedX;
    }
    if (ballX >= canvasWidth - paddleWidth && ballY > paddle2Y && ballY < paddle2Y + paddleHeight) {
        ballSpeedX = -ballSpeedX;
    }

    // Scoring
    if (ballX < 0) {
        player2Score++; // Player 2 scores
        resetBall();
    }
    if (ballX > canvasWidth) {
        player1Score++; // Player 1 scores
        resetBall();
    }
}

// Reset ball position and speed
function resetBall() {
    ballX = canvasWidth / 2;
    ballY = canvasHeight / 2;
    ballSpeedX = -ballSpeedX;
}

// Draw everything
function draw() {
    // Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw paddles
    ctx.fillStyle = 'white';
    ctx.fillRect(0, paddle1Y, paddleWidth, paddleHeight);
    ctx.fillRect(canvasWidth - paddleWidth, paddle2Y, paddleWidth, paddleHeight);

    // Draw ball
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballSize, 0, Math.PI * 2, false);
    ctx.fill();

    // Draw scores
    ctx.font = '20px Arial';
    ctx.fillText('Player 1: ' + player1Score, 50, 50);
    ctx.fillText('Player 2: ' + player2Score, canvasWidth - 150, 50);
}

// Control paddles with keyboard
window.addEventListener('keydown', function(event) {
    switch(event.key) {
        case 'w': paddle1Y -= 20; break; // Player 1 control
        case 's': paddle1Y += 20; break;
        case 'ArrowUp': paddle2Y -= 20; break; // Player 2 control
        case 'ArrowDown': paddle2Y += 20; break;
    }
});

// Start game loop
gameLoop();