const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- GAME DATA ---
let state = "MAP";
let flip = { x: 320, y: 240, size: 32, speed: 5 };

// Speedrun variables
let totalTimer = 0;
let sectionCount = 0;
let timerRunning = true;

// Level Locations (Adjust x and y to match your hand-drawn circles!)
const levels = [
    { name: "Race 1", x: 150, y: 150, unlocked: true },
    { name: "Race 2", x: 320, y: 100, unlocked: false },
    { name: "Moon",   x: 450, y: 300, unlocked: false }
];

// Load your image
const mapImg = new Image();
mapImg.src = "Untitled.jpg"; 

// --- CONTROLS ---
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key] = true; });
window.addEventListener("keyup", (e) => { keys[e.key] = false; });

// --- GAME LOGIC ---
function update() {
    // Move Flip
    if (keys["ArrowLeft"] && flip.x > 0) flip.x -= flip.speed;
    if (keys["ArrowRight"] && flip.x < 608) flip.x += flip.speed;
    if (keys["ArrowUp"] && flip.y > 0) flip.y -= flip.speed;
    if (keys["ArrowDown"] && flip.y < 448) flip.y += flip.speed;

    // Check for Enter key to start race
    if (keys["Enter"] && state === "MAP") {
        levels.forEach((level, index) => {
            // Check if Flip is touching a level circle
            if (Math.abs(flip.x - level.x) < 40 && Math.abs(flip.y - level.y) < 40 && level.unlocked) {
                state = "RACE";
                timerRunning = false; // Stop timer during transition
                flip.y = 400; // Start at bottom for race
            }
        });
    }

    // Update Timer (if running)
    if (timerRunning) {
        totalTimer += 1/60; 
    }

    // Race Win Condition
    if (state === "RACE" && flip.y < 50) {
        state = "MAP";
        timerRunning = true; // Start timer again
        sectionCount += 1;   // Add to section counter
        
        // Unlock next level (Race 2)
        if (sectionCount === 1) levels[1].unlocked = true;
        
        flip.x = 320; flip.y = 240; // Reset position
    }
}

// --- DRAWING ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state === "MAP") {
        // Draw your hand-drawn map
        ctx.drawImage(mapImg, 0, 0, 640, 480);
        
        // Draw the level markers (transparent circles so you see your drawing)
        levels.forEach(level => {
            ctx.strokeStyle = level.unlocked ? "white" : "red";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(level.x, level.y, 20, 0, Math.PI * 2);
            ctx.stroke();
        });

    } else if (state === "RACE") {
        ctx.fillStyle = "#1e1e1e";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 50, 640, 20); // Finish line
    }

    // Draw Player
    ctx.fillStyle = "green";
    ctx.fillRect(flip.x, flip.y, flip.size, flip.size);

    // Draw HUD (UI)
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText("Time: " + totalTimer.toFixed(2), 20, 30);
    ctx.fillText("Sections: " + sectionCount, 20, 60);
}

// --- MAIN LOOP ---
function main() {
    update();
    draw();
    requestAnimationFrame(main);
}

mapImg.onload = main;
