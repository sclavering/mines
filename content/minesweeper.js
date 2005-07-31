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


var gCurrentDifficulty = 1;
var gTileShape = SQUARE;
var gMinesPerTile = 1;

var gNoMinesAtEdges = false;

var gPrefs; // an nsIPrefBranch

const ui = {
  pauseCmd: "cmd-pause",
  pauseMsg: "msg-pause",
  smileyFace: "new-game-button"
};


window.onload = function() {
  for(var i in ui) ui[i] = document.getElementById(ui[i]);

  ui.smileyFace.setFace = function(face) {
    this.className = "new-game-button-"+face;
  };

  gPrefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  gPrefs = gPrefs.getBranch("games.minesweeper.");

  // restore difficulty level
  try { gCurrentDifficulty = gPrefs.getIntPref("difficulty-level"); } catch(e) {}
  document.getElementById("dif-"+gCurrentDifficulty).setAttribute("checked","true");

  // restore tile shape
  try { gTileShape = gPrefs.getCharPref("tile-shape"); } catch(e) {}
  document.getElementById("shape-"+gTileShape).setAttribute("checked","true");

  // restore mines-per-tile
  try { gMinesPerTile = gPrefs.getIntPref("mines-per-tile"); } catch(e) {}
  document.getElementById("minespertile-"+gMinesPerTile).setAttribute("checked","true");

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
  const box = Grid.container;
  if(Game.paused) {
    ui.pauseMsg.hidden = true;
    Timer.start();
  } else {
    ui.pauseMsg.hidden = false;
    Timer.stop();
  }
  Game.paused = !Game.paused
}


// xxx bits of this need merging with the state parts of the Grid to create an
// object which really represents a single game.  Grid needs dividing along
// model/view lines.

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

    this.squaresRevealed = 0;
    MineCounters.setAll(this.mines);
    Timer.reset();
    ui.pauseMsg.hidden = true;
    ui.smileyFace.setFace("normal");
    Grid.container.oncontextmenu = onRightClick;
    if(gNoMinesAtEdges) {
      Grid.revealEdges();
      Grid.container.onclick = onClick;
      ui.pauseCmd.removeAttribute("disabled");
      Timer.start();
    } else {
      Grid.container.onclick = onSafeClick;
    }
  },

  // needed by mouseClick to silently start a new game if the first square clicked is a mine
  _newLikeCurrent: function() {
    Grid.newGrid(this.width, this.height, this.mines);
  },

  checkWon: function() {
    if(this.squaresRevealed != this.nonMines) return;
    this.end();
    Grid.updateForGameWon();
    ui.smileyFace.setFace("won");
  },

  lose: function() {
    Grid.updateForGameLost();
    this.end();
    ui.smileyFace.setFace("lost");
  },

  end: function() {
    if(!this.inProgress) return;
    this.inProgress = false;
    this.paused = false;
    Timer.stop();
    Grid.container.onclick = null;
    Grid.container.oncontextmenu = null;
    ui.pauseCmd.setAttribute("disabled", "true");
  }
}



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
        var el = new Tile(x, y, this.tileClassPrefix);
        this.elements[x][y] = el;
        col.appendChild(el.txt);
        col.appendChild(el.img);
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

  revealEdges: function() {
    const es = this.elements, w = this.width, h = this.height;
    const maxx = w - 1, maxy = h - 1;
    for(var y = 0; y != h; ++y) {
      var el = es[0][y];
      if(!el.revealed) el.reveal();
      el = es[maxx][y];
      if(!el.revealed) el.reveal();
    }
    for(var x = 1; x != maxx; ++x) {
      el = es[x][0];
      if(!el.revealed) el.reveal();
      el = es[x][maxy];
      if(!el.revealed) el.reveal();
    }
  },

  updateForGameLost: function() {
    const els = this.elements, w = this.width, h = this.height;
    for(var x = 0; x != w; ++x) {
      for(var y = 0; y != h; ++y) {
        var el = els[x][y];
        if(el.mines) {
          if(el.mines != el.flags) el.img.className = el.imgClassPrefix + "m" + el.mines;
        } else {
          if(el.flags) el.img.className = el.imgClassPrefix + "cross";
        }
      }
    }
  },

  updateForGameWon: function() {
    // flag remaining mines (also fixes incorrect flag numbers)
    for(var x = 0; x < this.width; x++) {
      for(var y = 0; y < this.height; y++) {
        var el = this.elements[x][y];
        if(el.mines != el.flags) el.img.className = el.imgClassPrefix + "f" + el.mines;
      }
    }
    MineCounters.resetAll();
  }
};

var HexGrid = {
  __proto__: GridBase,

  tileClassPrefix: "hex",

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

  tileClassPrefix: "square",

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
    const t = e.target;
    return this.elements[t.x][t.y];
  }
}



function Tile(x, y, shape) {
  const txt = this.txt = document.createElement("label");
  const img = this.img = document.createElement("image");
  img.x = txt.x = this.x = x;
  img.y = txt.y = this.y = y;
  txt.className = shape+" txt";
  this.imgClassPrefix = shape+" img ";
  this.adjacent = []; // filled in later
  this.reset();
}

Tile.prototype = {
  reset: function() {
    this.flags = 0;
    this.revealed = false;
    this.mines = 0;
    this.number = 0;
    this.img.hidden = false;
    this.txt.hidden = true;
    this.img.className = this.imgClassPrefix + "f0";
  },

  addOneFlagOrRemoveAll: function() {
    var f = this.flags;
    if(f) MineCounters.increase(f);
    f = this.flags = f == Game.maxFlags ? 0 : f + 1;
    if(f) MineCounters.decrease(f);
    this.img.className = this.imgClassPrefix + "f" + f;
  },

  removeOneFlag: function() {
    MineCounters.increase(this.flags);
    var f = --this.flags;
    if(f) MineCounters.decrease(f);
    this.img.className = this.imgClassPrefix + "f" + f;
  },

  onLeftClick: function() {
    if(this.flags) this.removeOneFlag();
    else if(!this.revealed) this.reveal();
    else if(this.hasEnoughSurroundingFlags()) this.revealAround();
  },

  onRightClick: function() {
    // this happens on right click (as well as left click) so that it still works for
    // click-with-both-buttons
    if(!this.revealed) this.addOneFlagOrRemoveAll();
    else if(this.hasEnoughSurroundingFlags()) this.revealAround();
  },

  hasEnoughSurroundingFlags: function() {
    const adj = this.adjacent, num = adj.length;
    var flags = 0;
    for(var i = 0; i != num; ++i) flags += adj[i].flags;
    return flags == this.number;
  },

  reveal: function() {
    if(this.mines) {
      Game.lose();
      this.img.className = this.imgClassPrefix+"e"+this.mines;
    } else {
      this.revealed = true;
      Game.squaresRevealed++;
      this.img.hidden = true;
      if(this.number) this.txt.setAttribute("value", this.number);
      else this.txt.removeAttribute("value");
      this.txt.hidden = false;
      if(!this.number) this.revealAround();
      Game.checkWon();
    }
  },

  revealAround: function() {
    const adj = this.adjacent, num = adj.length;
    for(var i = 0; i != num; ++i) {
      var el = adj[i];
      if(!el.revealed && !el.flags) adj[i].reveal();
    }
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



function onSafeClick(e) {
  if(e.button==2 || e.ctrlKey) return;
  const el = Grid.getEventTarget(e);
  if(!el) return;
  while(el.mines) Game._newLikeCurrent();
  Timer.start();
  Grid.container.onclick = onClick;
  ui.pauseCmd.removeAttribute("disabled");
  el.onLeftClick();
}

function onClick(e) {
  if(e.button==2 || e.ctrlKey) return;
  const el = Grid.getEventTarget(e);
  if(el) el.onLeftClick();
}

function onRightClick(e) {
  const el = Grid.getEventTarget(e);
  if(el) el. onRightClick();
}
