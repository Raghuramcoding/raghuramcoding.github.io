const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- 1. GAME DATA ---
let state = "MAP"; 
let flip = { x: 320, y: 240, size: 32, speed: 5, hp: 10 };

// Speedrun & Stats
let totalTimer = 0;
let sectionCount = 0;
let timerRunning = true;

// Projectiles & Enemies
let bullets = [];
let enemy = { x: 300, y: 100, hp: 5, alive: true };

// Level Locations (Adjust these numbers to match your hand-drawn circles!)
const levels = [
    { name: "Brawl 1", x: 150, y: 150, unlocked: true },
    { name: "Brawl 2", x: 320, y: 100, unlocked: false }
];

// Load your image
const mapImg = new Image();
mapImg.src = "Untitled.jpg"; 

// --- 2. CONTROLS ---
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key] = true; });
window.addEventListener("keyup", (e) => { keys[e.key] = false; });

// Shooting Mechanic (Mouse Click)
window.addEventListener("mousedown", (e) => {
    if (state === "BRAWL") {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate direction to shoot
        const angle = Math.atan2(mouseY - (flip.y + 16), mouseX - (flip.x + 16));
        
        bullets.push({
            x: flip.x + 16,
            y: flip.y + 16,
            velX: Math.cos(angle) * 8,
            velY: Math.sin(angle) * 8
        });
    }
});

// --- 3. LOGIC ---
function update() {
    // Movement
    if (keys["ArrowLeft"] && flip.x > 0) flip.x -= flip.speed;
    if (keys["ArrowRight"] && flip.x < 608) flip.x += flip.speed;
    if (keys["ArrowUp"] && flip.y > 0) flip.y -= flip.speed;
    if (keys["ArrowDown"] && flip.y < 448) flip.y += flip.speed;

    if (state === "MAP") {
        timerRunning = true;
        // Check if Enter is pressed on a circle
        if (keys["Enter"]) {
            levels.forEach((level) => {
                let dist = Math.hypot(flip.x - level.x, flip.y - level.y);
                if (dist < 40 && level.unlocked) {
                    state = "BRAWL";
                    timerRunning = false; // Pause timer during transition
                    enemy.alive = true;
                    enemy.hp = 5;
                }
            });
        }
    } else if (state === "BRAWL") {
        // Update Bullets
        bullets.forEach((b, index) => {
            b.x += b.velX;
            b.y += b.velY;
            // Hit detection
            if (enemy.alive && b.x > enemy.x && b.x < enemy.x + 40 && b.y > enemy.y && b.y < enemy.y + 40) {
                enemy.hp -= 1;
                bullets.splice(index, 1);
            }
        });

        // Win Condition
        if (!enemy.alive) {
            state = "MAP";
            sectionCount++;
            if (levels[1]) levels[1].unlocked = true;
            flip.x = 320; flip.y = 240; // Back to center
        }
    }

    if (timerRunning) totalTimer += 1/60;
}

// --- 4. DRAWING ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state === "MAP") {
        ctx.drawImage(mapImg, 0, 0, 640, 480);
        levels.forEach(level => {
            ctx.strokeStyle = level.unlocked ? "white" : "red";
            ctx.beginPath();
            ctx.arc(level.x, level.y, 25, 0, Math.PI * 2);
            ctx.stroke();
        });
    } else if (state === "BRAWL") {
        ctx.fillStyle = "#222"; // Arena background
        ctx.fillRect(0, 0, 640, 480);
        
        if (enemy.alive) {
            ctx.fillStyle = "red";
            ctx.fillRect(enemy.x, enemy.y, 40, 40);
            ctx.fillStyle = "white";
            ctx.fillText("Enemy HP: " + enemy.hp, enemy.x, enemy.y - 10);
        }

        ctx.fillStyle = "yellow";
        bullets.forEach(b => {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Draw Flip
    ctx.fillStyle = "green";
    ctx.fillRect(flip.x, flip.y, flip.size, flip.size);

    // UI
    ctx.fillStyle = "white";
    ctx.font = "18px Arial";
    ctx.fillText("Time: " + totalTimer.toFixed(2), 20, 30);
    ctx.fillText("Sections: " + sectionCount, 20, 55);
    if (state === "MAP") ctx.fillText("Press ENTER on circle to fight!", 200, 30);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

mapImg.onload = loop;
