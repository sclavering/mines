const HEXAGONAL = "hex";
const SQUARE = "square";

const kClassic = 0;
const kCrazy = 1;

const kWidths = [9,16,30];
const kHeights = [9,16,16];

const kMines = [null,
  [[10],[40],[100]],
  [[6,4],[24,16],[60,40]],
  [[5,3,2],[20,12,8],[50,30,20]],
  [[4,3,2,1],[16,12,8,4],[40,30,20,10]],
  [[4,2,2,1,1],[15,10,7,5,3],[40,24,18,12,6]],
  [[3,2,2,1,1,1],[15,10,6,4,3,2],[35,25,16,11,8,5]],
  [[2,2,2,1,1,1,1],[15,9,6,4,3,2,1],[30,24,18,12,8,5,3]]
];


var gCurrentDifficulty;
var gTileShape;
var gMinesPerTile;

var gNoMinesAtEdges = false;

var gPrefs; // an nsIPrefBranch
var gSmileyFace; // an <image/> being used as a button


const ui = {
  pauseCmd: "cmd.pause",
  pauseMsg: "msg.pause"
};


window.onload = function() {
  for(var i in ui) ui[i] = document.getElementById(ui[i]);

  gPrefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  gPrefs = gPrefs.getBranch("games.minesweeper.");

  // restore difficulty level
  gCurrentDifficulty = 1;
  try { gCurrentDifficulty = gPrefs.getIntPref("difficulty-level"); } catch(e) {}
  document.getElementById("dif-"+gCurrentDifficulty).setAttribute("checked","true");

  // restore tile shape
  gTileShape = SQUARE;
  try { gTileShape = gPrefs.getCharPref("tile-shape"); } catch(e) {}
  document.getElementById("shape-"+gTileShape).setAttribute("checked","true");

  // restore mines-per-tile
  gMinesPerTile = 1;
  try { gMinesPerTile = gPrefs.getIntPref("mines-per-tile"); } catch(e) {}
  document.getElementById("minespertile-"+gMinesPerTile).setAttribute("checked","true");

  gSmileyFace = document.getElementById("new-game-button");
  gSmileyFace.setFace = function(face) {
    this.className = "new-game-button-"+face;
  };

  Timer.init();
  MineCounters.init();
  SquareGrid.init();
  HexGrid.init();

  setTileShape(gTileShape);
};


function newGame(difficulty) {
  if(difficulty || difficulty===0) {
    gCurrentDifficulty = difficulty;
    gPrefs.setIntPref("difficulty-level", difficulty);
    Game.newGame(kWidths[difficulty], kHeights[difficulty], kMines[gMinesPerTile][difficulty]);
    sizeToContent();
  } else {
    Game.newLikeCurrent();
  }
}

function newSquareGame() {
  setTileShape(SQUARE);
}

function newHexagonalGame() {
  setTileShape(HEXAGONAL);
}

function setMinesPerTile(num) {
  gMinesPerTile = num;
  gPrefs.setIntPref("mines-per-tile", num);
  newGame(gCurrentDifficulty);
}

function setTileShape(shape) {
  gTileShape = shape;
  gPrefs.setCharPref("tile-shape", shape);

  Game.end();

  if(Grid) Grid.hide();
  Grid = (shape==HEXAGONAL) ? HexGrid : SquareGrid;
  Grid.show();

  newGame(gCurrentDifficulty);
}

function toggleNoMinesAtEdges(menuitem) {
  gNoMinesAtEdges = menuitem.getAttribute("checked")=="true";
  newGame();
}



function togglePause() {
  if(Game.paused) {
    ui.pauseMsg.hidden = true;
    Timer.start();
    addMouseHandlers(false);
  } else {
    ui.pauseMsg.hidden = false;
    Timer.stop();
    removeMouseHandlers();
  }
  Game.paused = !Game.paused
}



var Game = {
  // these will overwritten by values read from attributes of the <window/>
  width: 9,
  height: 9,
  mines: 10,
  nonMines: 0,

  // the maximum number of flags on a single square.  >1 in advanced games
  maxFlags: 1,

  minesLeft: 0,
  squaresRevealed: 0,

  inProgress: false,
  paused: false,

  newGame: function(width, height, mines) {
    this.width = width;
    this.height = height;
    this.mines = mines;
    this.nonMines = this.width * this.height;
    for(var i in mines) this.nonMines -= this.mines[i];
    this.maxFlags = mines.length;
    this.newLikeCurrent();
  },

  newLikeCurrent: function() {
    this.end();
    this.inProgress = true;
    this._newLikeCurrent();
    // counters
    this.squaresRevealed = 0;
    MineCounters.setAll(this.mines);
    // misc display stuff
    Timer.reset();
    gSmileyFace.setFace("normal");
    addMouseHandlers(true);
    ui.pauseMsg.hidden = true;
  },

  // needed by mouseClick to silently start a new game if the first square clicked is a mine
  _newLikeCurrent: function() {
    Grid.newGrid(this.width, this.height, this.mines);
  },

  checkWon: function() {
    if(this.squaresRevealed != this.nonMines) return;
    this.end();
    Grid.updateForGameWon();
    gSmileyFace.setFace("won");
  },

  lose: function() {
    Grid.updateForGameLost();
    this.end();
    gSmileyFace.setFace("lost");
  },

  end: function() {
    if(!this.inProgress) return;
    this.inProgress = false;
    this.paused = false;
    Timer.stop();
    removeMouseHandlers();
    ui.pauseCmd.setAttribute("disabled", "true");
  }
}



// === the grid, both square and hex versions =============

var Grid = null; // set to one of HexGrid or SquareGrid

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
    if(width!=this.width || height!=this.height) {
      this.setSize(width, height);
    } else {
      // clear every element in the grid
      for(x = 0; x != width; ++x)
        for(y = 0; y != height; ++y)
          this.elements[x][y].reset();
    }

    const maxx = width - 1, maxy = height - 1;
    // create the required number of mines, and set the number for other elements
    for(var i = 1; i <= mines.length; i++) {
      var minesPlaced = 0;
      while(minesPlaced != mines[i-1]) {
        do { x = Math.random(); } while(x == 1.0);
        do { y = Math.random(); } while(y == 1.0);
        x = Math.floor(x * width);
        y = Math.floor(y * height);
        var el = this.elements[x][y];
        if(el.mines) continue;
        if(gNoMinesAtEdges && (!x || x==maxx || !y || y==maxy)) continue;
        el.mines = i;
        minesPlaced++;
        // increment number for surrounding elements
        for(var j = 0; j < el.adjacent.length; j++)
          el.adjacent[j].number += i;
      }
    }
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
      if(x%2==0) col.className = "evencolumn"; // needed for alignment in hexagonal games
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

  updateForGameLost: function() {
    // show mines and incorrect flags
    for(var x = 0; x < this.width; x++) {
      for(var y = 0; y < this.height; y++) {
        var el = this.elements[x][y];
        if(el.mines) {
          if(el.mines != el.flags) el.className = el.classPrefix+"mine m"+el.mines;
        } else {
          if(el.flags) el.className = el.classPrefix+("cross");
        }
      }
    }
  },

  updateForGameWon: function() {
    // flag remaining mines
    for(var x = 0; x < this.width; x++) {
      for(var y = 0; y < this.height; y++) {
        var el = this.elements[x][y];
        if(el.mines && !el.flags) el.className = el.classPrefix+"flag f"+el.mines;
      }
    }
    MineCounters.resetAll();
  },

  // The appearance of tiles is controlled by their class attribute.  This always includes
  // "tile", and either "hex" or "square".  And will include one of "button", "flag f{n}",
  // "revealed r{n}" or "explosion e{n}" where {n} is a number
  createTile: function(x, y, classPrefix) {
    var el = document.createElement("button");
    el.x = x;
    el.y = y;
    el.classPrefix = "tile "+classPrefix;
    // an array of adjacent elements, created after the grid of elements is created
    el.adjacent = [];
    for(var i in tileMethods) el[i] = tileMethods[i];
    el.reset();
    return el;
  }
};


const tileMethods = {
  reset: function() {
      this.flags = 0;
      this.revealed = false;
      this.mines = 0;
      this.number = 0;
      this.removeAttribute("label");
      this.className = this.classPrefix+"button";
  },

  toggleFlag: function() {
      if(this.revealed) return;
      if(this.flags == Game.maxFlags) {
        MineCounters.increase(this.flags);
        this.flags = 0;
        this.className = this.classPrefix+"button";
      } else {
        if(this.flags) MineCounters.increase(this.flags);
        this.flags++;
        MineCounters.decrease(this.flags);
        this.className = this.classPrefix+"flag f"+this.flags;
      }
  },

    // remove one flag
  unflag: function() {
      MineCounters.increase(this.flags);
      var fl = --this.flags;
      if(fl) {
        MineCounters.decrease(fl);
        this.className = this.classPrefix+"flag f"+fl;
      } else {
        this.className = this.classPrefix+"button";
      }
  },

    // we want to treat flagged tiles differently from reveal() (which is used by revealAround etc. too)
  onLeftClick: function() {
      if(this.revealed) this.tryRevealAround();
      else if(this.flags) this.unflag();
      else this.reveal();
  },

  reveal: function() {
      if(this.revealed || this.flags) return;
      if(this.mines) {
        Game.lose();
        this.className = this.classPrefix+"explosion e"+this.mines;
      } else {
        this.revealed = true;
        Game.squaresRevealed++;
        this.className = this.classPrefix+"revealed r"+this.number;
        if(this.number) this.setAttribute("label",this.number);
        // if its a blank square reveal round it
        else this.revealAround();
        Game.checkWon();
      }
  },

    // used both to reveal a whole area when a zero is revealed,
    // and to reveal around an element when it is middle-clicked (or clicked with both buttons)
  revealAround: function() {
      for(var i = 0; i < this.adjacent.length; i++) {
        var adj = this.adjacent[i];
        if(!adj.revealed) adj.reveal();
      }
  },

    // if enough flags have been placed around the element then the remaining unflagged
    // squares will be revealed. this can kill the player if the flags are in the wrong place
  tryRevealAround: function() {
      if(this.revealed && this.hasEnoughFlags())
        this.revealAround();
  },

  hasEnoughFlags: function() {
      var flags = 0;
      for(var i = 0; i < this.adjacent.length; i++) {
        var f = this.adjacent[i].flags;
        if(f) flags += f;
      }
      return (flags==this.number);
  }
}






var HexGrid = {
  __proto__: GridBase,

  // prefixed onto the className of every <image> being used as a tile in the grid.
  tileClassPrefix: "hex ",

  init: function() {
    this.container = document.getElementById("hex-grid");
  },

  // give each element a list of those elements adjacent to it
  setAdjacents: function() {
    for(var x = 0, even = true; x < this.width; x++, even = !even) {
      for(var y = 0; y < this.height; y++) {
        var adjs = [], adj;
        // up left
        adj = this.getElement(x - 1, even ? y : y-1);
        if(adj) adjs.push(adj);
        // up
        adj = this.getElement(x, y-1);
        if(adj) adjs.push(adj);
        // up right
        adj = this.getElement(x+1, even ? y : y-1);
        if(adj) adjs.push(adj);
        // down right
        adj = this.getElement(x+1, even ? y+1 : y);
        if(adj) adjs.push(adj);
        // down
        adj = this.getElement(x, y+1);
        if(adj) adjs.push(adj);
        // down left
        adj = this.getElement(x-1, even ? y+1 : y);
        if(adj) adjs.push(adj);
        // done
        this.elements[x][y].adjacent = adjs;
      }
    }
  },


  hexHalfHeight: 10,
  hexFullHeight: 20,
  hexSlopeWidth: 5,
  hexTileWidth:  17,

  getEventTarget: function(e) {
    var xcoord = e.pageX - this.container.boxObject.x;
    var ycoord = e.pageY - this.container.boxObject.y;

    var xtile = Math.floor(xcoord / this.hexTileWidth);
    var evenCol = (xtile % 2 == 0);
    // treat tile calculation the same for all cols
    if(evenCol) {
      ycoord -= this.hexHalfHeight;
      // abort if the gap at the top of the column has been clicked
      if(ycoord < 0) return null;
    }
    var ytile = Math.floor(ycoord / this.hexFullHeight);
    // get coords within rectangular tile
    var xintile = xcoord % this.hexTileWidth;
    var yintile = ycoord % this.hexFullHeight;
    /* tiles are this shape:
       -------------
       |  /        |
       | /         |
       |/          |
       |\          |
       | \         |
       |  \        |
       -------------
       ^^^^ == the hexSlopeWidth
    */
    // are we in main body of tile?
    if(xintile > this.hexSlopeWidth) return this.getElement(xtile, ytile);
    if(yintile > this.hexHalfHeight) {
      // we're in the bottom left corner.  are we below the diagonal?
      yintile -= this.hexHalfHeight;
      if(yintile * this.hexSlopeWidth > xintile * this.hexHalfHeight) {
        xtile--;
        if(evenCol) ytile++;
      }
    } else {
      // we're in top left corner of tile.  are we above the diagonal?
      yintile = this.hexHalfHeight - yintile;
      if(yintile * this.hexSlopeWidth > xintile * this.hexHalfHeight) {
        xtile--;
        if(!evenCol) ytile--;
      }
    }
    return this.getElement(xtile, ytile);
  }
}



var SquareGrid = {
  __proto__: GridBase,

  tileClassPrefix: "square ",

  init: function() {
    this.container = document.getElementById("square-grid");
  },

  setAdjacents: function() {
    const width = this.width, height = this.height;
    const xmax = width - 1, ymax = height - 1;
    for(var x = 0; x < width; x++) {
      for(var y = 0; y < height; y++) {
        var adjacent = [];
        if(x!=0) {
          if(y!=ymax) adjacent.push(this.elements[x-1][y+1]);
          if(y!=0) adjacent.push(this.elements[x-1][y-1]);
          adjacent.push(this.elements[x-1][y]);
        }
        if(x!=xmax) {
          if(y!=ymax) adjacent.push(this.elements[x+1][y+1]);
          if(y!=0) adjacent.push(this.elements[x+1][y-1]);
          adjacent.push(this.elements[x+1][y]);
        }
        if(y!=ymax) adjacent.push(this.elements[x][y+1]);
        if(y!=0) adjacent.push(this.elements[x][y-1]);
        this.elements[x][y].adjacent = adjacent;
      }
    }
  },

  getEventTarget: function(e) {
    return e.target;
  }
}





var Timer = {
  interval: null,
  time: 0,
  display: null,

  init: function() {
    this.display = document.getElementById("timer");
  },

  start: function() {
    this.interval = setInterval(this.increment, 1000);
  },

  increment: function() {
    Timer.display.value = (++Timer.time);
  },

  stop: function() {
    clearInterval(this.interval);
    return this.time;
  },

  reset: function() {
    this.time = 0;
    this.display.value = 0;
  }
}





var MineCounters = {
  values: [],
  containers: [],
  displays: [],

  init: function() {
    var i = 0;
    var elt = document.getElementById("mine-counter-0");
    while(elt) {
      this.displays.push(elt);
      this.containers.push(elt.parentNode);
      elt = document.getElementById("mine-counter-"+(++i));
    }
  },

  increase: function(counter) {
    var c = counter - 1; // arrays are 0-based, but we have no 0 counter
    this.values[c]++;
    this.displays[c].value = this.values[c];
  },
  decrease: function(counter) {
    var c = counter - 1;
    this.values[c]--;
    this.displays[c].value = this.values[c];
  },

  resetAll: function() {
    for(var i = 0; i < this.values.length; i++) this.displays[i].value = 0;
  },
  setAll: function(newvals) {
    // we *do* have to copy the array
    const vals = this.values = newvals.slice(0), num = vals.length;
    const ds = this.displays, cs = this.containers;
    for(var i = 0; i != num; i++) {
      ds[i].value = newvals[i];
      cs[i].collapsed = false;
    }
    // hide unwanted counters
    for(; i != ds.length; i++) cs[i].collapsed = true;
  }
}





function addMouseHandlers(forGameStart) {
  Grid.container.onclick = mouseClick;
  if(forGameStart) gIsFirstMouseClick = true;
}

function removeMouseHandlers() {
  Grid.container.onclick = null;
}

var gIsFirstMouseClick = false;

function mouseClick(e) {
  const el = Grid.getEventTarget(e);

  // make the first click always safe (if it's a left-click)
  if(gIsFirstMouseClick) {
    gIsFirstMouseClick = false;
    if(e.button==0) {
      while(el.mines) Game._newLikeCurrent();
      Timer.start();
      ui.pauseCmd.removeAttribute("disabled");
    }
  }

  if(e.button==2 || e.ctrlKey) {
    el.toggleFlag();
  } else {
    el.onLeftClick();
  }
}
