
/*
    Feature list:
        -[x] Keyboard input
        -[x] Pause overlay
        -[x] Particles
        -[x] Screenshake
        -[x] Animate hearts
        -[x] Ball trail
        -[x] Drop tiles down from top smoothly
        -[x] Use variables for fonts
        -[x] Reimplement different starting colour layouts
        -[ ] Render ball tails even after ball deaths
        -[ ] Incremental sounds (to reward combos)
*/

function get(what: string): HTMLElement {
    return document.getElementById(what);
}

class Game {
    static SIZE: { w: number, h: number }; // size of gameCanvas
    static iSIZE: { w: number, h: number }; // size of infoCanvas

    static canvas: HTMLCanvasElement;
    static context: CanvasRenderingContext2D; // context for the gameCanvas
    static infoCanvas: HTMLCanvasElement;
    static infoContext: CanvasRenderingContext2D; // context for the infoCanvas
    static canvasClientRect = { left: 0, top: 0 }; // used by the mouse class to determine mouse's relative position to the canvas

    static level: Level;
    static paused: boolean = false;

    static lastTick: number;
    static lastRender: number;
    static tickLength: number;

    static font36 = "36px Poiret One";
    static font30 = "30px Poiret One";
    static font28 = "28px Poiret One";
    static font20 = "20px Poiret One";

    static init() {
        Game.canvas = <HTMLCanvasElement>get('gameCanvas');
        Game.canvas.width = 720;
        Game.canvas.height = 480;
        Game.context = Game.canvas.getContext('2d');

        Game.infoCanvas = <HTMLCanvasElement>get('infoCanvas');
        Game.infoCanvas.width = 720;
        Game.infoCanvas.height = 80;
        Game.infoContext = (<HTMLCanvasElement>get('infoCanvas')).getContext('2d');
        Game.canvasClientRect = Game.canvas.getBoundingClientRect();
        Game.SIZE = { w: Game.canvas.width, h: Game.canvas.height };
        Game.iSIZE = { w: Game.infoContext.canvas.width, h: Game.infoContext.canvas.height };

        Game.lastTick = Math.floor(performance.now()); // we'll only ever be adding whole numbers to this, no point in storing floating point value
        Game.lastRender = Game.lastTick; //Pretend the first draw was on first update.
        Game.tickLength = 17;

        Game.level = new Level();

        Game.loop(performance.now());
    }

    static loop(delta: number) {
        window.requestAnimationFrame(Game.loop);

        var nextTick = Game.lastTick + Game.tickLength;
        var numTicks = 0;

        if (delta > nextTick) {
            var timeSinceTick = delta - Game.lastTick;
            numTicks = Math.floor(timeSinceTick / Game.tickLength);
        }

        Game.queueUpdates(numTicks);
        Game.render();
        Game.lastRender = delta;
    }

    static queueUpdates(numTicks: number) {
        for (var i = 0; i < numTicks; i++) {
            Game.lastTick = Game.lastTick + Game.tickLength; //Now lastTick is this tick.
            Game.update(Game.lastTick);
        }
    }

    static update(tickCount: number) {
        Game.level.update();
    }

    static render() {
        Game.context.fillStyle = "#0e132e";
        Game.context.fillRect(0, 0, Game.SIZE.w, Game.SIZE.h);

        // Background colour
        Game.infoContext.fillStyle = "#262d59";
        Game.infoContext.fillRect(0, 0, Game.iSIZE.w, Game.iSIZE.h);

        // Black line
        Game.infoContext.fillStyle = "#001";
        Game.infoContext.fillRect(0, Game.iSIZE.h - 2, Game.iSIZE.w, 2);

        Game.level.render();
    }

    static togglePause() {
        Game.paused = !Game.paused;
    }
}

class Level {

    blocks: Array<Block>;

    xo: number;
    yo: number;

    camera: Camera;

    static width: number = 6; // how many blocks wide the field is
    static height: number = 8; // how many blocks tall the field is

    player: Paddle;
    balls: Ball[];

    ballstill: boolean = true; // Is true at the start of the game, and after the player loses a life. Gets set to false on mouse down.
    deathcount: number = 0;
    static gamestates = { playing: -1, lost: 0, won: 1 };
    gamestate: number;

    heartImg: HTMLImageElement;
    heartScale = 1.0; // Used to draw hearts extra large when first acquired

    particleGenerators: ParticleGenerator[];

    constructor() {
        this.player = new Paddle();
        this.balls = new Array<Ball>(1);
        this.balls[0] = new Ball();

        this.camera = new Camera();

        this.xo = 70; // keep these constant for now
        this.yo = 25;

        this.heartImg = new Image();
        this.heartImg.src = "res/heart.png";

        this.particleGenerators = new Array<ParticleGenerator>();

        this.camera.shake(0, -2000); // Drop tiles in from top of screen

        this.reset();
    }

    update() {
        if (Game.paused) {
            if (Mouse.ldown) {
                Game.paused = false;
            } else {
                return;
            }
        }

        if (this.gamestate === Level.gamestates.playing) {
            this.player.update();
            for (var i = 0; i < this.balls.length; i++) {
                this.balls[i].update(this.player);
            }

            if (this.checkBoardWon()) {
                this.deathcount--;
                this.gamestate = Level.gamestates.won;
                this.die();
            }
        } else {
            if (Mouse.ldown || Keyboard.keysdown[Keyboard.KEYS.SPACE]) {
                this.reset();
            }
        }

        for (var g in this.particleGenerators) {
            this.particleGenerators[g].update();
        }

        this.camera.update();
    }

    checkBoardWon(): boolean {
        for (var i in this.blocks) {
            if (this.blocks[i].color !== 0) return false;
        }
        return true;
    }

    die() {
        this.balls = new Array<Ball>(1);
        this.balls[0] = new Ball();
        this.player.reset();
        this.ballstill = true;
        this.deathcount++;
        if (this.deathcount >= 3) {
            this.gamestate = Level.gamestates.lost;
        }

        // If we've won, we're calling this just to reset things
        if (this.gamestate != Level.gamestates.won) {
            // Render the last heart shrinking into oblivion
            this.heartScale = 0.99;
        }
    }

    destroySquare(xp: number, yp: number, ball: Ball) { // destroys a 3x3 square (bomb tile)
        Sound.play(Sound.boom);
        var x = (xp - this.xo) / 100;
        var y = (yp - this.yo) / 35;
        for (var yy = Math.max(y - 1, 0); yy <= Math.min(y + 1, Level.height - 1); yy++) {
            for (var xx = Math.max(x - 1, 0); xx <= Math.min(x + 1, Level.width - 1); xx++) {
                if (this.blocks[xx + yy * Level.width].color === 0) continue;
                if (xx === x && yy === y) continue;
                this.blocks[xx + yy * Level.width].destroy(ball);
            }
        }

        this.camera.shake(ball.xv * 4, ball.yv * 4);
    }

    reset() {
        var i;

        Game.paused = false;
        this.gamestate = Level.gamestates.playing;
        this.deathcount = 0;
        this.ballstill = true;
        this.balls = new Array<Ball>(1);
        this.balls[0] = new Ball();
        this.player.reset();

        this.blocks = new Array(Level.width * Level.height);
        var rand = Math.floor(Math.random() * 5);
        for (i = 0; i < this.blocks.length; i++) {
            this.blocks[i] = new Block((i % Level.width) * 100 + this.xo, Math.floor(i / Level.width) * 35 + this.yo, this.getColor(i, rand));
        }
    }

    /** Returns a value in the range [1-9] inclusive */
    getColor(i: number, type?: number): number {
        if (!type) {
            type = Math.floor(Game.lastTick % 5);
        } else {
            type %= 5;
        }

        var x = i % Level.width;
        var y = Math.floor(i / Level.width);
        switch (type) {
            case 0:
            {
                // // DISTANCE from (0,0)
                var dist = Math.sqrt(x*x + y*y);
                var maxDist = Math.sqrt(Level.width * Level.width + Level.height * Level.height);
                return Math.floor(dist / maxDist * 9) + 2; // add two so we don't have any greys
            }
            case 1:
            {    // ORDERED
                return (i % 9) + 1;
            }
            case 2:
            {
                // RANDOM
                return Math.floor(Math.random() * 9 + 1);
            }
            case 3:
            {
                // DISTANCE from (width, 0)
                var dist = Math.sqrt((Level.width-x)*(Level.width-x) + y*y);
                var maxDist = Level.width + Math.sqrt(0 + Level.height * Level.height);

                return (Math.floor((dist / maxDist) * 9) + 2);
            }
            case 4:
            {
                // CHECKERBOARD
                // Use the last games tick time (essentially a random number) to
                // vary the colours, but maintain consistency for each time this is
                // called in one frame
                return ((i + (y % 2 === 0 ? 0 : 1)) % 2) * 2 + Game.lastTick % 7 + 1;
            }
        }
    }

    render() {
        var i;

        this.player.render();
        for (i = 0; i < this.balls.length; i++) {
            this.balls[i].render();
        }

        for (i in this.blocks) {
            if (this.blocks[i].color === 0) continue;
            else this.blocks[i].render();
        }

        this.renderRemainingLives();

        for (var g in this.particleGenerators) {
            this.particleGenerators[g].render();
        }

        // Game over / Game won / Paused overlays
        if (this.gamestate === Level.gamestates.lost || this.gamestate === Level.gamestates.won) {
            drawHorizontallyCenteredRectangle(112, 220, 100);
            drawHorizontallyCenteredRectangle(252, 160, 30);

            Game.context.fillStyle = "white";
            Game.context.font = Game.font36;
            var msg = "Game Over!";
            Game.context.fillText(msg, Game.SIZE.w / 2 - Game.context.measureText(msg).width / 2, 150);
            Game.context.font = Game.font28;

            msg = "You " + (this.gamestate === Level.gamestates.won ? "Won!" : "Lost!");
            Game.context.fillText(msg, Game.SIZE.w / 2 - Game.context.measureText(msg).width / 2, 200);
            Game.context.font = Game.font20;

            if (Game.lastTick % 800 > 400) Game.context.fillStyle = "grey";
            msg = "Click to restart";
            Game.context.fillText(msg, Game.SIZE.w / 2 - Game.context.measureText(msg).width / 2, 275);

        } else if(Game.paused) {

            drawHorizontallyCenteredRectangle(112, 220, 50);
            drawHorizontallyCenteredRectangle(248, 230, 35);

            Game.context.fillStyle = "white";
            Game.context.font = Game.font36;
            var msg = "Paused";
            Game.context.fillText(msg, Game.SIZE.w / 2 - Game.context.measureText(msg).width / 2, 150);
            Game.context.font = Game.font28;

            if (Game.lastTick % 800 > 400) Game.context.fillStyle = "grey";
            msg = "Click to unpause";
            Game.context.fillText(msg, Game.SIZE.w / 2 - Game.context.measureText(msg).width / 2, 275);
        } else if (this.ballstill) {
            if (Game.lastTick % 1000 > 500) Game.context.fillStyle = "grey";
            else Game.context.fillStyle = "white";
            Game.context.font = Game.font30;
            var msg = "Click to begin";
            Game.context.fillText(msg, Game.SIZE.w / 2 - Game.context.measureText(msg).width / 2, 380);
        }
    }

    renderRemainingLives() {
        var i;

        for (i = 0; i < 3 - this.deathcount; i++) {
            var scale;
            // We just gained a heart and are going towards 1.0
            // Render the last gained heart larger
            if ((this.heartScale > 1.0) && (i === (3 - this.deathcount) - 1)) {
                scale = this.heartScale;
                var difference = Math.abs(this.heartScale - 1.0);
                this.heartScale -= (difference * 0.08);
                if (this.heartScale < 1.0001) {
                    this.heartScale = 1.0;
                }
            } else {
                scale = 1.0;
            }
            var width = this.heartImg.width * scale;
            var height = this.heartImg.height * scale;
            var x = (35 + i * 40) - (width / 2.0);
            var y = (Game.iSIZE.h / 2) - (height / 2.0);
            Game.infoContext.drawImage(this.heartImg, x, y, width, height);
        }
        // Render last heart shrinking
        if (this.heartScale < 1.0) {
            var difference = Math.abs(this.heartScale - 1.0);
            this.heartScale -= (difference * 0.3);
            if (this.heartScale < 0.0001) {
                this.heartScale = 1.0;
                return;
            }
            var width = this.heartImg.width * this.heartScale;
            var height = this.heartImg.height * this.heartScale;
            var x = (35 + (3 - this.deathcount) * 40) - (width / 2.0);
            var y = (Game.iSIZE.h / 2) - (height / 2.0);
            Game.infoContext.drawImage(this.heartImg, x, y, width, height);
        }
    }
}

function drawHorizontallyCenteredRectangle(y: number, w: number, h: number): void {
    Game.context.fillStyle = "#123";
    Game.context.fillRect(Game.SIZE.w / 2 - w / 2, y, w, h);

    Game.context.strokeStyle = "#EEF";
    Game.context.lineWidth = 2;
    Game.context.strokeRect(Game.SIZE.w / 2 - w / 2, y, w, h);
}

class Block {

    static width: number = 80;
    static height: number = 20;
    x: number;
    y: number;

    static block_images = Array<HTMLImageElement>();
    color: number; // an index in Block.block_images array

    static powerups = ["", "bomb", "bigger_paddle", "slice_ball", "extra_ball", "extra_life"];
    static powerup_images = Array<HTMLImageElement>();
    powerup: number;

    static loadImages() {
        Block.block_images = new Array(10);
        Block.block_images[0] = null;
        Block.block_images[1] = new Image();
        Block.block_images[1].src = "res/blocks/grey.png";
        Block.block_images[2] = new Image();
        Block.block_images[2].src = "res/blocks/red.png";
        Block.block_images[3] = new Image();
        Block.block_images[3].src = "res/blocks/orange.png";
        Block.block_images[4] = new Image();
        Block.block_images[4].src = "res/blocks/yellow.png";
        Block.block_images[5] = new Image();
        Block.block_images[5].src = "res/blocks/green.png";
        Block.block_images[6] = new Image();
        Block.block_images[6].src = "res/blocks/blue.png";
        Block.block_images[7] = new Image();
        Block.block_images[7].src = "res/blocks/darkblue.png";
        Block.block_images[8] = new Image();
        Block.block_images[8].src = "res/blocks/purple.png";
        Block.block_images[9] = new Image();
        Block.block_images[9].src = "res/blocks/pink.png";

        Block.powerup_images[0] = null;
        Block.powerup_images[1] = new Image();
        Block.powerup_images[1].src = "res/powerups/bomb.png";
        Block.powerup_images[2] = new Image();
        Block.powerup_images[2].src = "res/powerups/longer_paddle.png";
        Block.powerup_images[3] = new Image();
        Block.powerup_images[3].src = "res/powerups/slicing_ball.png";
        Block.powerup_images[4] = new Image();
        Block.powerup_images[4].src = "res/powerups/add_ball.png";
        Block.powerup_images[5] = new Image();
        Block.powerup_images[5].src = "res/powerups/add_heart.png";
    }

    constructor(x: number, y: number, color: number) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.powerup = Math.floor(Math.random() * 24);
        if (this.powerup > Block.powerups.length - 1) {
            this.powerup = 0;
        }
    }

    destroy(ball: Ball) {
        if (this.color === 0) return;
        switch (Block.powerups[this.powerup]) {
            case "":
                break;
            case "bomb":
                this.powerup = 0; // prevent infinite loop of recursion
                Game.level.destroySquare(this.x, this.y, ball);
                break;
            case "bigger_paddle":
                Game.level.player.biggerTimer = 300;
                break;
            case "slice_ball":
                ball.slices = 100;
                break;
            case "extra_ball":
                Game.level.balls.push(new Ball());
                Game.level.balls[Game.level.balls.length - 1].shoot();
                break;
            case "extra_life":
                Game.level.deathcount--;
                Game.level.heartScale = 3.0;
                break;
        }

        Game.level.particleGenerators.push(new ParticleGenerator(this.x + Block.width / 2, this.y, Color.convert(this.color)));

        this.color = 0;
    }

    render() {
        Game.context.drawImage(Block.block_images[this.color], this.x + Game.level.camera.xo, this.y + Game.level.camera.yo);
        if (this.powerup !== 0) {
            Game.context.drawImage(Block.powerup_images[this.powerup], this.x + Block.width / 2 - 7 + Game.level.camera.xo, this.y + 3 + Game.level.camera.yo);
        }
    }
}

class Paddle {

    x: number;
    y: number;
    width: number;
    height: number;
    maxv: number;
    biggerTimer: number = 0;
    img: HTMLImageElement;
    usingMouseInput: boolean;

    constructor() {
        this.reset();

        this.img = new Image();
        this.img.src = "res/player_paddle.png";

        this.usingMouseInput = true;
    }

    reset() {
        this.x = 270;
        this.y = 450;
        this.width = 180;
        this.height = 25;
        this.maxv = 25;
        this.biggerTimer = 0;
    }

    update() {
        this.biggerTimer--;
        if (this.biggerTimer > 0) {
            if (this.biggerTimer < 100) {
                this.width = 180 + this.biggerTimer;
            } else {
                this.width = 280;
            }
        } else {
            this.width = 180;
        }

        if (Game.level.ballstill && Mouse.ldown) {
            Game.level.balls[0].shoot();
            return;
        }
        if (Game.level.ballstill) return;

        var left = !!(Keyboard.keysdown[Keyboard.KEYS.A] || Keyboard.keysdown[Keyboard.KEYS.LEFT]);
        var right = !!(Keyboard.keysdown[Keyboard.KEYS.D] || Keyboard.keysdown[Keyboard.KEYS.RIGHT]);
        var destx = this.x;
        var amount = 0;

        if (this.usingMouseInput) {
            destx = Math.min(Math.max(Mouse.x - this.width / 2, 0), Game.SIZE.w - this.width);
        } else {
            if (left) {
                destx = 0;
            } else if (right) {
                destx = Game.canvas.width - this.width;
            }
        }
        amount = Math.min(Math.abs(this.x - destx), this.maxv);

        this.x += destx > this.x ? amount : -amount;
    }

    render() {
        Game.context.drawImage(this.img, this.x + Game.level.camera.xo, this.y + Game.level.camera.yo, this.width, this.height);
    }
}

class PreviousPosition {
    x: number;
    y: number;
    green: boolean;

    constructor(x: number, y: number, green?: boolean) {
        this.x = x;
        this.y = y;
        this.green = green || false;
    }

    equals(pos: PreviousPosition): boolean {
        return (this.x === pos.x && this.y === pos.y && this.green === pos.green);
    }
}

class Ball {

    x: number;
    y: number;
    xv: number;
    yv: number;
    maxXv: number = 8;

    r: number;

    img: HTMLImageElement;
    img_slicing: HTMLImageElement;
    /** How many ticks are left in the green "slicing" powerup
        if > 0, the ball is rendered green and doesn't bounce when
        coming in contact with blocks */
    slices: number = 0;

    previousPositions: PreviousPosition[];
    numberOfPreviousPositions: number = 50;
    previousPositionIndex: number = 0;

    constructor() {
        this.reset();

        this.img = new Image();
        this.img.src = "res/ball.png";

        this.img_slicing = new Image();
        this.img_slicing.src = "res/ball_slicing.png";

        this.previousPositions = new Array<PreviousPosition>();
    }

    reset() {
        this.x = 360;
        this.y = 440;
        this.xv = 0;
        this.yv = 0;
        this.r = 10;
    }

    update(player: Paddle) {
        this.x += this.xv;
        this.y += this.yv;

        this.addPosition(new PreviousPosition(this.x, this.y, !(this.slices < 60 && this.slices % 20 < 10)));

        if (this.slices > 0) {
            this.slices--;
        }

        // check for colisions with player paddle
        if (this.x + this.r > player.x && this.x - this.r < player.x + player.width && this.y + this.r > player.y && this.y - this.r < player.y + player.height) {
            Sound.play(Sound.blip);
            this.yv = -this.yv;
            this.y = player.y - this.r;
            this.xv += ((this.x - player.x - player.width / 2) / 100) * 5;
            if (this.xv > this.maxXv) this.xv = this.maxXv;
            if (this.xv < -this.maxXv) this.xv = -this.maxXv;
            return;
        }

        // check for colisions with window edges
        if (this.x > Game.SIZE.w - this.r) {
            Sound.play(Sound.bloop);
            Game.level.camera.shake(this.xv * 2, 0);
            this.xv = -this.xv;
            this.x = Game.SIZE.w - this.r;
        }
        if (this.x < this.r) {
            Sound.play(Sound.bloop);
            Game.level.camera.shake(this.xv * 2, 0);
            this.xv = -this.xv;
            this.x = this.r;
        }
        if (this.y < this.r) {
            Sound.play(Sound.bloop);
            Game.level.camera.shake(0, this.yv * 2);
            this.yv = -this.yv;
            this.y = this.r;
        }
        if (this.y > Game.SIZE.h) {
            if (Game.level.balls.length > 1) {
                Game.level.balls.splice(Game.level.balls.indexOf(this), 1);
                return;
            }
            Sound.play(Sound.die);
            Game.level.die();
            return;
        }

        // check for collisions with blocks
        var c = this.collides();
        if (c !== -1) {
            Sound.play(Sound.bloop);
            if (this.slices > 0) {
                return;
            }

            if (this.x > Game.level.blocks[c].x + Block.width) {
                Game.level.camera.shake(this.xv, 0);
                this.xv = Math.abs(this.xv);
            }
            if (this.x < Game.level.blocks[c].x) {
                Game.level.camera.shake(this.xv, 0);
                this.xv = -Math.abs(this.xv);
            }
            if (this.y > Game.level.blocks[c].y + Block.height) {
                Game.level.camera.shake(0, this.yv);
                this.yv = Math.abs(this.yv);
            }
            if (this.y < Game.level.blocks[c].y) {
                Game.level.camera.shake(0, this.yv);
                this.yv = -Math.abs(this.yv);
            }
        }
    }

    addPosition(pos: PreviousPosition) {
        if (this.previousPositions.length === this.numberOfPreviousPositions) {
            if (this.previousPositions[this.previousPositionIndex] === pos) {
                // Don't add the same position twice
                return;
            }
            this.previousPositions[this.previousPositionIndex++] = pos;
            this.previousPositionIndex %= this.numberOfPreviousPositions;
        } else {
            if (this.previousPositions.length > 0 && this.previousPositions[this.previousPositions.length - 1].equals(pos)) {
                // Don't add the same position twice
                return;
            }
            this.previousPositions.push(pos);
        }
    }

    collides(): number {
        for (var i in Game.level.blocks) {
            var b = Game.level.blocks[i];
            if (b.color === 0) continue;
            if (this.x + this.r > b.x && this.x - this.r < b.x + Block.width && this.y + this.r > b.y && this.y - this.r < b.y + Block.height) {
                Game.level.blocks[i].destroy(this);
                return parseInt(i);
            }
        }
        return -1;
    }

    shoot() { // shoot off the player's paddle
        Game.level.ballstill = false;
        this.yv = -7;
        do {
            this.xv = Math.floor(Math.random() * 10) - 5;
        } while (this.xv >= -1 && this.xv <= 1);
    }

    render() {
        // Render ball trail
        for (var i = this.previousPositionIndex - 1; i > this.previousPositionIndex - this.previousPositions.length; i--) {
            var value = i + (this.previousPositions.length - this.previousPositionIndex) + 1;
            Game.context.globalAlpha = (value / this.previousPositions.length) / 4;
            var index = i;
            if (index < 0) {
                index += this.previousPositions.length;
            }
            var pos = this.previousPositions[index];
            var x = pos.x - this.r + Game.level.camera.xo;
            var y = pos.y - this.r + Game.level.camera.yo;

            if (this.previousPositions[index].green) {
                Game.context.drawImage(this.img_slicing, x, y);
            } else {
                Game.context.drawImage(this.img, x, y);
            }
        }
        Game.context.globalAlpha = 1.0;

        var x = this.x - this.r + Game.level.camera.xo;
        var y = this.y - this.r + Game.level.camera.yo;
        if (this.slices < 60 && this.slices % 20 < 10) { // blinking effect when slicing effect is about to wear off
            Game.context.drawImage(this.img, x, y);
        } else {
            Game.context.drawImage(this.img_slicing, x, y);
        }
    }
}

class Mouse {

    static x: number = 0;
    static y: number = 0;
    static ldown: boolean = false;
    static rdown: boolean = false;

    static update(event: MouseEvent) {
        var px = Mouse.x,
            py = Mouse.y;
        Mouse.x = event.clientX - Game.canvasClientRect.left;
        Mouse.y = event.clientY - Game.canvasClientRect.top;

        if (Game.level && !Game.level.player.usingMouseInput && !Game.paused && (Mouse.x != px || Mouse.y != py)) {
            Game.level.player.usingMouseInput = true;
        }
    }

    static down(event: MouseEvent) {
        if (event.button === 1 || event.which === 1) Mouse.ldown = true;
        else if (event.button === 3 || event.which === 3) Mouse.rdown = true;
    }

    static up(event: MouseEvent) {
        if (event.button === 1 || event.which === 1) Mouse.ldown = false;
        else if (event.button === 3 || event.which === 3) Mouse.rdown = false;
    }

}

class Sound {

    static blip;
    static bloop;
    static die;
    static boom;
    static life;

    static muted = false;
    static volume = 0.5;
    static volumeSlider;

    static init() {
        Sound.blip = <HTMLAudioElement>get('blipSound');
        Sound.bloop = <HTMLAudioElement>get('bloopSound');
        Sound.die = <HTMLAudioElement>get('dieSound');
        Sound.boom = <HTMLAudioElement>get('boomSound');
        Sound.life = <HTMLAudioElement>get('lifeSound');

        Sound.volumeSlider = <HTMLInputElement>get('volumeSlider');
        Sound.changeVolume();
    }

    static changeVolume() {
        Sound.volume = Number(Sound.volumeSlider.value) / 100;
    }

    static toggleMute(): void {
        Sound.muted = !Sound.muted;
    }

    static play(sound: HTMLAudioElement): void {
        if (Sound.muted) return;
        sound.volume = Sound.volume;
        sound.currentTime = 0;
        sound.play();
    }
}

class ParticleGenerator {
    particles: Particle[];

    constructor(x: number, y: number, color: Color) {
        this.particles = new Array<Particle>();

        var size = new Size();
        size.w = size.h = 6;

        for (var i = 0; i < 25; ++i) {
            this.particles.push(new Particle(this, PARTICLE_TYPE.SQUARE, size, color, x, y, Math.random() * 10 - 5, Math.random() * 10 - 5, 0, 0.5, 45));
        }
    }

    remove(particle: Particle) {
        this.particles.splice(this.particles.indexOf(particle));
    }

    update() {
        for (var p in this.particles) {
            this.particles[p].update();
        }
    }

    render() {
        for (var p in this.particles) {
            this.particles[p].render();
        }
    }
}

enum PARTICLE_TYPE {
    CIRCLE, SQUARE
}

class Size {
    w: number;
    h: number;
    r: number;
}

class Color {
    r: number;
    g: number;
    b: number;

    constructor(r?: number, g?: number, b?: number) {
        this.r = r || 0;
        this.g = g || 0;
        this.b = b || 0;
    }

    static convert(c: number): Color {
        switch(c) {
            case 1:
                return new Color(158, 158, 158);
            case 2:
                return new Color(172, 0, 0);
            case 3:
                return new Color(172, 105, 0);
            case 4:
                return new Color(182, 176, 0);
            case 5:
                return new Color(52, 172, 0);
            case 6:
                return new Color(0, 172, 170);
            case 7:
                return new Color(0, 103, 182);
            case 8:
                return new Color(68, 0, 172);
            case 9:
                return new Color(180, 0, 182);
            default:
                return new Color(0, 0, 0);
        }
    }
}

class Particle {

    generator: ParticleGenerator;
    type: PARTICLE_TYPE;
    xa: number;
    ya: number;
    xv: number;
    yv: number;
    x: number;
    y: number;
    size: Size;
    life: number; // Number of ticks until this particle dissapears
    startingLife: number;
    color: Color;

    constructor(generator: ParticleGenerator, type: PARTICLE_TYPE, size: Size, color: Color, x: number, y: number, xv: number, yv: number, xa: number, ya: number, life: number) {
        this.generator = generator;
        this.type = type;
        this.size = size;
        this.color = color;
        this.x = x;
        this.y = y;
        this.xv = xv;
        this.yv = yv;
        this.xa = xa;
        this.ya = ya;
        this.life = life;
        this.startingLife = life;
    }

    update() {
        this.life--;
        if (this.life < 0) {
            this.generator.remove(this);
            return;
        }

        this.xv += this.xa;
        this.yv += this.ya;

        this.x += this.xv;
        this.y += this.yv;
    }

    render() {
        var x = this.x + Game.level.camera.xo;
        var y = this.y + Game.level.camera.yo;
        Game.context.fillStyle = "rgba(" + this.color.r + ", " + this.color.g + ", " + this.color.b + ", " + (this.life / this.startingLife) + ")";
        if (this.type === PARTICLE_TYPE.SQUARE) {
            Game.context.fillRect(x, y, this.size.w, this.size.h);
        } else if (this.type === PARTICLE_TYPE.CIRCLE) {
            Game.context.arc(x, y, this.size.r, 0, 0);
        }
    }
}

class Camera {
    xo: number;
    yo: number;

    shakeX: number;
    shakeY: number;

    constructor() {
        this.xo = 0;
        this.yo = 0;
        this.shakeX = 0;
        this.shakeY = 0;
    }

    update() {
        this.shakeX *= 0.90;
        this.shakeY *= 0.90;

        if (this.shakeX < 0.001 && this.shakeX > -0.001) {
            this.shakeX = 0;
        }
        if (this.shakeY < 0.001 && this.shakeY > -0.001) {
            this.shakeY = 0;
        }

        this.xo = this.shakeX;
        this.yo = this.shakeY;
    }

    shake(amountX: number, amountY: number) {
        this.shakeX += (Math.random() * (amountX / 2) + (amountX / 2));
        this.shakeY += (Math.random() * (amountY / 2) + (amountX / 2));
    }
}

class Keyboard {
    static KEYS = {
        BACKSPACE: 8, TAB: 9, RETURN: 13, ESC: 27, SPACE: 32, PAGEUP: 33, PAGEDOWN: 34, END: 35, HOME: 36, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, INSERT: 45, DELETE: 46, ZERO: 48, ONE: 49, TWO: 50, THREE: 51, FOUR: 52, FIVE: 53, SIX: 54, SEVEN: 55, EIGHT: 56, NINE: 57, A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73, J: 74, K: 75, L: 76, M: 77, N: 78, O: 79, P: 80, Q: 81, R: 82, S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90, TILDE: 192, SHIFT: 999
    };

    static keysdown = [];

    static keychange(event: KeyboardEvent, down: boolean): void {
        var keycode = event.keyCode ? event.keyCode : event.which;
        Keyboard.keysdown[keycode] = down;

        if (down && keycode === Keyboard.KEYS.ESC) {
            Game.togglePause();
            if (Game.level.ballstill) Game.paused = false;
        }

        if (keycode === Keyboard.KEYS.A || keycode === Keyboard.KEYS.D || keycode === Keyboard.KEYS.LEFT || keycode === Keyboard.KEYS.RIGHT) {
            Game.paused = false;
            Game.level.player.usingMouseInput = false;

        }
        if (keycode === Keyboard.KEYS.SPACE) {
            if (Game.level.ballstill) {
                Game.level.balls[0].shoot();
            }
        }
    }
}

function keydown(event: KeyboardEvent) {
    Keyboard.keychange(event, true);

    // Prevent the page from scrolling down on space press
    if (event.keyCode === Keyboard.KEYS.SPACE) return false;
}

function keyup(event: KeyboardEvent) {
    Keyboard.keychange(event, false);
}

window.onkeydown = keydown;
window.onkeyup = keyup;

function toggleFooter(which: string) {
    var front = '1',
        back = '0',
        about = get('aboutFooter');

    if (which === 'about') {
        if (about.className === 'short') {
            about.style.zIndex = front;
            about.className = 'long';
        } else {
            about.className = 'short';
        }
    }
}

window.onblur = function() {
    Game.paused = true;
}

// window.onfocus = function() {
//     Game.paused = false;
// }

window.onresize = function() {
    Game.canvasClientRect = Game.canvas.getBoundingClientRect();
}

window.onload = function() {
    Block.loadImages();
    Sound.init();
    Game.init();
};
