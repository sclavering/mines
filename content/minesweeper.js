const HEXAGONAL = "hex";
const SQUARE = "square";

window.addEventListener("load",function() {
  HexUtils.init(8,4,10);
  Timer.init();
  MineCounter.init();
  SquareGrid.init();
  HexGrid.init();
  Game.init();
}, false);


function newBeginnerGame() {
  document.documentElement.setAttribute("gamedifficulty","beginner");
  Game.newGame(9,9,10);
}
function newIntermediateGame() {
  document.documentElement.setAttribute("gamedifficulty","intermediate");
  Game.newGame(16,16,40);
}
function newExpertGame() {
  document.documentElement.setAttribute("gamedifficulty","expert");
  Game.newGame(30,16,99);
}
function newGame() {
  Game.newLikeCurrent();
}

function newSquareGame() { Game.switchMode(SQUARE); }
function newHexagonalGame() { Game.switchMode(HEXAGONAL); }

var Game = {
  // we init these for an easy game for the very first load of the app
  // after that they will be read from prefs at startup
  width: 9,
  height: 9,
  mines: 10,
  nonMines: 0,

  flagsPlaced: 0,
  squaresRevealed: 0,
  minesLeft: 0,

  inProgress: false,

  preferences: null,

  // the smiley face button. there's nowhere better to handle it
  smileyButton: null,

  init: function() {
    this.smileyButton = document.getElementById("new-game-button");
    // get last difficulty level used
    this.width = parseInt(document.documentElement.getAttribute("gamewidth"));
    this.height = parseInt(document.documentElement.getAttribute("gameheight"));
    this.mines = parseInt(document.documentElement.getAttribute("gamemines"));
    this.nonMines = this.width * this.height - this.mines;
    // select the right menuitem on the game menu
    var difficulty = document.documentElement.getAttribute("gamedifficulty");
    document.getElementById("dif-"+difficulty).setAttribute("checked","true");
    // restore last game mode (hexagonal or square)
    var mode = document.documentElement.getAttribute("gamemode");
    document.getElementById("mi-"+mode).setAttribute("checked","true");
    // XXX for some reason if we start the app with a square game it will not respond
    // to mouse clicks, but if the user switches to a hexagonal game and then back to
    // square, the square game will work fine.  We work around this by starting a hex
    // game, which the user will never actually see, because we switch immediately to
    // a square game we want.
    if(mode==SQUARE) this.switchMode(HEXAGONAL);
    this.switchMode(mode);
  },

  newLikeCurrent: function() {
    this.newGame2();
  },

  newGame: function(width, height, mines) {
    document.documentElement.setAttribute("gamewidth",width);
    document.documentElement.setAttribute("gameheight",height);
    document.documentElement.setAttribute("gamemines",mines);
    this.width = width;
    this.height = height;
    this.mines = mines;
    this.nonMines = this.width * this.height - this.mines;
    this.newGame2();
    this.resizeWindow();
  },

  newGame2: function() {
    this.end();
    this.inProgress = true;
    Grid.newGrid(this.width, this.height, this.mines);
    // counters
    this.flagsPlaced = 0;
    this.squaresRevealed = 0;
    this.minesLeft = this.mines;
    // misc display stuff
    MineCounter.update();
    Timer.reset();
    this.setSmileyButton("normal");
    Mouse.addHandlers();
  },

  checkWon: function() {
    if(this.squaresRevealed == this.nonMines) {
      this.end();
      Grid.updateForGameWon();
      this.setSmileyButton("won");
    }
  },

  lose: function() {
    Grid.updateForGameLost();
    this.end();
    this.setSmileyButton("lost");
  },

  end: function() {
    if(!this.inProgress) return;
    this.inProgress = false;
    Timer.stop();
    Mouse.removeHandlers();
  },

  setSmileyButton: function(state) {
    this.smileyButton.className = "new-game-button-"+state;
  },

  // switch between square and hexagonal modes.
  // doesn't matter if it ends up switching hex->hex or square->square
  switchMode: function(newMode) {
    document.documentElement.setAttribute("gamemode",newMode);
    this.end();
    if(Grid) Grid.hide();
    Grid = (newMode==HEXAGONAL) ? HexGrid : SquareGrid;
    Grid.show();
    this.newLikeCurrent();
    this.resizeWindow();
  },

  resizeWindow: function() {
    // sizeToContent() *will not reduce* the size of the window for some reason,
    // so we zero it ourselves first, which gives the correct overall result.
    // (this bug was seen in the 20030616 build of Mozilla Firebird. nothing else has been tested)
    window.innerWidth = 0;
    window.innerHeight = 0;
    window.sizeToContent();
  }
}



// === the grid, both square and hex versions =============

var Grid; // set to one of HexGrid or SquareGrid

var GridBase = {
  width: 0,
  height: 0,

  // a 2d array of the <image> elements that make up the board
  // always contains truewidth*trueheight elements
  elements: [],
  // columns are <vbox>s
  columns: [],
  // the main hbox for the elements to be shown in
  // HexGrid and SquareGrid provide init() methods to initialise this
  container: null,

  // show or hide the whole grid
  hide: function() {
    this.container.hidden = true;
  },
  show: function() {
    this.container.hidden = false;
  },

  // create a new mine layout and display it
  newGrid: function(width, height, mines) {
    var x, y;
    // resize the grid if required
    if(width!=this.width || height!=this.height)
      this.setSize(width, height);
    // clear every element in the grid
    for(x = 0; x < this.width; x++)
      for(y = 0; y < this.height; y++)
        this.elements[x][y].reset();
    // create the required number of mines, and set the number for other elements
    var minesPlaced = 0;
    while(minesPlaced != mines) {
      x = this.getRandomInt(width);
      y = this.getRandomInt(height);
      var el = this.elements[x][y];
      if(!el.isMine) {
        el.isMine = true;
        minesPlaced++;
        // increment number for surrounding elements
        for(var i = 0; i < el.adjacent.length; i++)
          el.adjacent[i].number++;
      }
    }
  },
  getRandomInt: function(maxvalue) {
    var num = Math.floor(Math.random()*maxvalue);
    if(num == maxvalue) num--; // fix possibility where random number is 1 so num is too high
    return num;
  },

  setSize: function(width, height) {
    // remove the old grid
    while(this.container.hasChildNodes())
      this.container.removeChild(this.container.lastChild);
    // create + add/show the new one
    this.width = width;
    this.height = height;
    this.elements = new Array(width);
    this.columns = new Array(width);
    for(var x = 0; x < width; x++) {
      this.elements[x] = new Array(height);
      var col = this.columns[x] = document.createElement("vbox");
      for(var y = 0; y < height; y++) {
        var el = this.createTile(x,y,this.tileClassPrefix);
        this.elements[x][y] = el;
        col.appendChild(el);
      }
      if(x%2==0) col.setAttribute("evencolumn","true"); // needed for alignment in hexagonal games
      this.container.appendChild(col);
    }
    this.setAdjacents();
  },

  getElement: function(x, y) {
    // bounds checked because it's useful to the callers
    if(x>=0 && x<this.width && y>=0 && y<this.height)
      return this.elements[x][y];
    return null;
  },

  /* The appearance of the tile at any given time is controlled by its class attribute.
     This starts with either "square-" or "hex-" (the |classPrefix|) depending on the
     type of tile, and ends with "button" "3" "flag" or something like that */
  createTile: function(x, y, classPrefix) {
    var el = document.createElement("image");
    // needed during event handling
    el.x = x;
    el.y = y;
    // an array of adjacent elements, created after the grid of elements is created
    el.adjacent = [];

    el.setAppearance = function(state) {
      this.className = classPrefix+state;
    };

    // also used when starting a new game of the same size
    el.reset = function() {
      this.flagged = false;
      this.revealed = false;
      this.isMine = false;
      this.number = 0;
      this.setAppearance("button");
    }
    el.reset();

    el.toggleFlag = function() {
      if(this.revealed) return;
      if(this.flagged) this.unflag();
      else this.flag();
    }

    el.flag = function() {
      this.flagged = true;
      Game.flagsPlaced++;
      Game.minesLeft--;
      MineCounter.update();
      this.setAppearance("flag");
    }

    el.unflag = function() {
      this.flagged = false;
      Game.flagsPlaced--;
      Game.minesLeft++;
      MineCounter.update();
      this.setAppearance("button");
    }

    el.reveal = function() {
      if(this.revealed || this.flagged) return;
      if(this.isMine) {
        Game.lose();
        this.setAppearance("highlighted-mine");
      } else {
        this.revealed = true;
        Game.squaresRevealed++;
        this.setAppearance(this.number);
        // if its a blank square reveal round it
        if(this.number===0) el.revealAround(el);
        Game.checkWon();
      }
    }

    // used both to reveal a whole area when a zero is revealed,
    // and to reveal around an element when it is middle-clicked (or clicked with both buttons)
    el.revealAround = function() {
      for(var i = 0; i < this.adjacent.length; i++) {
        var adj = this.adjacent[i];
        if(!adj.revealed) adj.reveal();
      }
    }

    // if enough flags have been placed around the element then the remaining unflagged
    // squares will be revealed. this can kill the player if the flags are in the wrong place
    el.tryRevealAround = function() {
      if(this.revealed && this.hasEnoughFlags())
        this.revealAround();
    }

    el.hasEnoughFlags = function() {
      var flags = 0;
      for(var i = 0; i < this.adjacent.length; i++)
        if(this.adjacent[i].flagged) flags++;
      return (flags==this.number);
    }

    return el;
  },

  updateForGameLost: function() {
    // show mines and incorrect flags
    for(var x = 0; x < this.width; x++) {
      for(var y = 0; y < this.height; y++) {
        var el = this.elements[x][y];
        if(el.isMine) {
          if(!el.flagged) el.setAppearance("mine");
        } else {
          if(el.flagged) el.setAppearance("cross");
        }
      }
    }
  },

  updateForGameWon: function() {
    // flag remaining mines
    for(var x = 0; x < this.width; x++) {
      for(var y = 0; y < this.height; y++) {
        var el = this.elements[x][y];
        if(el.isMine && !el.flagged) el.flag();
      }
    }
  }
}



// XXX merge HexUtils into this ?
var HexGrid = {
  __proto__: GridBase,
  
  // prefixed onto the className of every <image> being used as a tile in the grid.
  // see the createTile method, and the setAppearance method it gives to tiles
  tileClassPrefix: "hex-",

  init: function() {
    this.container = document.getElementById("hex-grid");
  },

  // give each element a list of those elements adjacent to it
  setAdjacents: function() {
    var node, adj;
    for(x = 0; x < this.width; x++) {
      for(y = 0; y < this.height; y++) {
        node = this.elements[x][y];
        adj = this.moveUpLeft(node);
        if(adj) node.adjacent.push(adj);
        adj = this.moveDownLeft(node);
        if(adj) node.adjacent.push(adj);
        adj = this.moveUpRight(node);
        if(adj) node.adjacent.push(adj);
        adj = this.moveDownRight(node);
        if(adj) node.adjacent.push(adj);
        adj = this.moveUp(node);
        if(adj) node.adjacent.push(adj);
        adj = this.moveDown(node);
        if(adj) node.adjacent.push(adj);
      }
    }
  },

  // used by the event handlers
  getEventTarget: function(event) {
    var xcoord = event.pageX - this.container.boxObject.x;
    var ycoord = event.pageY - this.container.boxObject.y;
    var t = HexUtils.getHexAtCoords(xcoord,ycoord);
    return this.getElement(t.x,t.y);
  },

  // move one hex in the given direction. return the new hex element
  moveUpLeft: function(el) {
    var location = HexUtils.moveUpLeft(el.x,el.y);
    return this.getElement(location.x,location.y);
  },
  moveDownLeft: function(el) {
    var location = HexUtils.moveDownLeft(el.x,el.y);
    return this.getElement(location.x,location.y);
  },
  moveUpRight: function(el) {
    var location = HexUtils.moveUpRight(el.x,el.y);
    return this.getElement(location.x,location.y);
  },
  moveDownRight: function(el) {
    var location = HexUtils.moveDownRight(el.x,el.y);
    return this.getElement(location.x,location.y);
  },
  moveDown: function(el) {
    return this.getElement(el.x,el.y-1);
  },
  moveUp: function(el) {
    return this.getElement(el.x,el.y+1);
  }
}



var SquareGrid = {
  __proto__: GridBase,
  
  tileClassPrefix: "square-",

  init: function() {
    this.container = document.getElementById("square-grid");
  },

  setAdjacents: function() {
    var width = this.width, height = this.height;
    for(x = 0; x < width; x++) {
      for(y = 0; y < height; y++) {
        var adjacent = [];
        if(x!=0) {
          if(y!=height-1) adjacent.push(this.elements[x-1][y+1]);
          if(y!=0) adjacent.push(this.elements[x-1][y-1]);
          adjacent.push(this.elements[x-1][y]);
        }
        if(x!=width-1) {
          if(y!=height-1) adjacent.push(this.elements[x+1][y+1]);
          if(y!=0) adjacent.push(this.elements[x+1][y-1]);
          adjacent.push(this.elements[x+1][y]);
        }
        if(y!=height-1) adjacent.push(this.elements[x][y+1]);
        if(y!=0) adjacent.push(this.elements[x][y-1]);
        this.elements[x][y].adjacent = adjacent;
      }
    }
  },

  getEventTarget: function(event) {
    return event.target;
  }
}



// === mine counter =======================================
var MineCounter = {
  hundreds: null,
  tens: null,
  units: null,

  init: function() {
    this.hundreds = document.getElementById("mine-counter-hundreds");
    this.tens  = document.getElementById("mine-counter-tens");
    this.units = document.getElementById("mine-counter-units");
  },

  update: function() {
    var negativeValue = (Game.minesLeft<0);
    var value = Math.abs(Game.minesLeft);
    // split value
    var newUnits = value % 10;
    var newTens = (value % 100 - newUnits) / 10;
    var newHundreds = (value - 10*newTens - newUnits) / 100;
    // change the images
    this.hundreds.className = "counter-"+newHundreds;
    this.tens.className = "counter-"+newTens;
    this.units.className = "counter-"+newUnits;
    // change first image for negative values
    if(negativeValue) this.hundreds.className = "counter--";
  }
}



// === timer ==============================================
var Timer = {
  interval: null,
  time: 0,

  hundredsDisplay: null,
  tensDisplay: null,
  unitsDisplay: null,

  init: function() {
    this.hundredsDisplay = document.getElementById("timer-hundreds");
    this.tensDisplay  = document.getElementById("timer-tens");
    this.unitsDisplay = document.getElementById("timer-units");
  },

  start: function() {
    this.interval = setInterval("Timer.increment()", 1000);
  },

  increment: function() {
    this.time++;
    this.display();
  },

  stop: function() {
    clearInterval(this.interval);
    return this.time;
  },

  reset: function() {
    this.time = 0;
    this.display();
  },

  display: function() {
    var value = this.time;
    var newUnits = value % 10;
    var newTens = (value % 100 - newUnits) / 10;
    var newHundreds = (value - 10*newTens - newUnits) / 100;
    // change the images
    this.unitsDisplay.className = "counter-"+newUnits;
    this.tensDisplay.className  = "counter-"+newTens;
    this.hundredsDisplay.className = "counter-"+newHundreds;
  }
}



// === mouse event handling ===============================
// XXX try to stop using Grid.container
var Mouse = {
  left: false,
  right: false,
  middle: false,
  x: null,
  y: null,

  addHandlers: function() {
    Grid.container.addEventListener("mousedown", this.mouseDownWrapper, false);
    // on first click start timer, replace onmouseup function, and pass along the event to the new function
    Grid.container.addEventListener("mouseup", this.firstMouseUp, false);
  },

  removeHandlers: function() {
    Grid.container.removeEventListener("mousedown", this.mouseDownWrapper, false);
    Grid.container.removeEventListener("mouseup", this.mouseUpWrapper, false);
  },

  firstMouseUp: function(event) {
    var el = Grid.getEventTarget(event);
    // don't do anything if the gap at the top of a column has been clicked
    if(!el) return;

    Grid.container.removeEventListener("mouseup", Mouse.firstMouseUp, false);
    // start a new game if a mine has been clicked
    if(el.isMine) {
      Game.newLikeCurrent();
      // pass the event through to the new game
      Mouse.firstMouseUp(event);
    } else {
      Timer.start();
      Grid.container.addEventListener("mouseup", Mouse.mouseUpWrapper, false);
      Mouse.mouseUp(event);
    }
  },

  mouseDownWrapper: function(e) { Mouse.mouseDown(e); },
  mouseUpWrapper: function(e) { Mouse.mouseUp(e); },

  mouseDown: function(event) {
    var el = Grid.getEventTarget(event);
    if(!el) return;
    this.x = el.x;
    this.y = el.y;
    if(event.button==0 && !event.shiftKey && !event.ctrlKey)         this.left = true;
    else if(event.button==1 || (event.button===0 && event.shiftKey)) this.middle = true;
    else if(event.button==2 || (event.button===0 && event.ctrlKey))  this.right = true;
  },

  mouseUp: function(event) {
    var el = Grid.getEventTarget(event);
    if(!el) return;
    // check mouse still on same square/hex as for mousedown
    if(el.x==this.x && el.y==this.y) {
      if((this.left && this.right) || this.middle) el.tryRevealAround();
      else if(this.left)  el.reveal();
      else if(this.right) el.toggleFlag();
    }
    this.left = false;
    this.middle = false;
    this.right = false;
  }
}



// === hex stuff ==========================================

const HexUtils = {
  halfHeight: 0,
  slopeWidth: 0,
  tileWidth:  0,
  fullHeight: 0,

  init: function(hh, sw, bw) {
    this.halfHeight = hh;
    this.fullHeight = 2 * hh;
    this.slopeWidth = sw;
    this.tileWidth = sw + bw; // width of the tiles in the grid we impose when calculating hex at given coords
  },

  getHexAtCoords: function(xcoord, ycoord) {
    var xtile = parseInt(xcoord / this.tileWidth);
    var evenCol = (xtile % 2 == 0);
    // treat tile calculation the same for all cols
    if(evenCol) {
      ycoord -= this.halfHeight;
      // abort if the gap at the top of the column has been clicked
      if(ycoord < 0) return {x: 0, y: -1};
    }
    var ytile = parseInt(ycoord / this.fullHeight);
    // get coords within rectangular tile
    var xintile = xcoord % this.tileWidth;
    var yintile = ycoord % this.fullHeight;
    /* tiles are this shape:
       -------------
       |  /        |
       | /         |
       |/          |
       |\          |
       | \         |
       |  \        |
       -------------
       ^^^^ == the slopeWidth
    */
    if(xintile > this.slopeWidth) {
      // in main body of tile
      return {x: xtile, y: ytile};
    }
    if(yintile > this.halfHeight) {
      yintile -= this.halfHeight;
      // we're in the bottom left corner.  are we above the diagonal?
      if(yintile * this.slopeWidth < xintile * this.halfHeight) {
        return {x: xtile, y: ytile}; // above
      } else {
        return this.moveDownLeft(xtile,ytile); // below
      }
    }
    // in top left corner of tile.  use similar logic to above
    xintile = this.slopeWidth - xintile;
    if(yintile * this.slopeWidth > xintile * this.halfHeight) {
      return {x: xtile, y: ytile}; // below
    } else {
      return this.moveUpLeft(xtile,ytile); // above
    }
  },

  // these functions deal with the different change in coords required to move to an
  // adjacent tile depending on whether the current tile is in an odd or even row
  moveUpLeft: function(x, y) {
    var y2 = (x % 2 == 0) ? y : y-1;
    return {x: x-1, y: y2};
  },
  moveDownLeft: function(x, y) {
    var y2 = (x % 2 == 0) ? y+1 : y;
    return {x: x-1, y: y2};
  },
  moveUpRight: function(x, y) {
    var y2 = (x % 2 == 0) ? y : y-1;
    return {x: x+1, y: y2};
  },
  moveDownRight: function(x, y) {
    var y2 = (x % 2 == 0) ? y+1 : y;
    return {x: x+1, y: y2};
  }
}

