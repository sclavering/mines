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
  svgFrame: "svgdoc",
  pauseCmd: "cmd-pause",
  pauseMsg: "msg-pause",
  smileyFace: "new-game-button"
};

// The SVGDocument and Window in which the grid is displayed
var svgDoc = null;
var svgWin = null;

// This is assumed to happen after the SVG document is loaded too. Seems to work :)
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

  svgWin = ui.svgFrame.contentWindow;
  svgDoc = svgWin.document;
  init_svg(7); // we allow 7 mines in a square

  Timer.init();
  MineCounters.init();
  setTileShape(gTileShape);
};


function newGame(difficulty) {
  if(difficulty || difficulty===0) {
    gCurrentDifficulty = difficulty;
    gPrefs.setIntPref("difficulty-level", difficulty);
    Game.newGame(kWidths[difficulty], kHeights[difficulty], kMines[gMinesPerTile][difficulty]);
//     sizeToContent();
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
  Grid = (shape==HEXAGONAL) ? HexGrid : SquareGrid;
  view.tileShape = (shape==HEXAGONAL) ? "hex" : "sqr";
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
    view.showGrid(this.width, this.height);
    if(gNoMinesAtEdges) {
      Grid.revealEdges();
      svgDoc.onclick = mainClickHandler;
      ui.pauseCmd.removeAttribute("disabled");
      Timer.start();
    } else {
      svgDoc.onclick = safeFirstClickHandler;
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
    svgDoc.onclick = null;
    ui.pauseCmd.setAttribute("disabled", "true");
  }
}



var Grid = null; // set to one of HexGrid or SquareGrid

var GridBase = {
  width: 0,
  height: 0,

  // A 2d array of the Tile objects.  Do elements[x][y], not [y][x]
  // Note: for hexagonal games the even columns are the ones offset vertically
  // (this is assumed throughout the code).
  elements: [],

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
    this.width = width;
    this.height = height;
    this.elements = new Array(width);
    for(var x = 0; x < width; x++) {
      this.elements[x] = new Array(height);
      for(var y = 0; y < height; y++) {
        this.elements[x][y] = new Tile(x, y);
      }
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
          if(el.mines != el.flags) view.update(x, y, "mine", el.mines);
        } else {
          if(el.flags) view.update(x, y, "cross");
        }
      }
    }
  },

  updateForGameWon: function() {
    // flag remaining mines (also fixes incorrect flag numbers)
    for(var x = 0; x < this.width; x++) {
      for(var y = 0; y < this.height; y++) {
        var el = this.elements[x][y];
        if(el.mines != el.flags) view.update(x, y, "flag", el.mines);
      }
    }
    MineCounters.resetAll();
  }
};

var HexGrid = {
  __proto__: GridBase,

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
  }
}

var SquareGrid = {
  __proto__: GridBase,

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
  }
}



function Tile(x, y, shape) {
  this.x = x;
  this.y = y;
  this.adjacent = []; // filled in later
  this.reset();
}

Tile.prototype = {
  reset: function() {
    this.flags = 0;
    this.revealed = false;
    this.mines = 0;
    this.number = 0;
  },

  addOneFlagOrRemoveAll: function() {
    var f = this.flags;
    if(f) MineCounters.increase(f);
    f = this.flags = f == Game.maxFlags ? 0 : f + 1;
    if(f) MineCounters.decrease(f);
    view.update(this.x, this.y, "flag", f);
  },

  removeOneFlag: function() {
    MineCounters.increase(this.flags);
    var f = --this.flags;
    if(f) MineCounters.decrease(f);
    view.update(this.x, this.y, "flag", f);
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
      view.update(this.x, this.y, "bang", this.mines);
    } else {
      this.revealed = true;
      Game.squaresRevealed++;
      view.update(this.x, this.y, "clear", this.number);
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


function safeFirstClickHandler(event) {
  if(event.button == 2 || event.ctrlKey) return;
  if(event.target.minesweeperX === undefined) return
  const t = event.target, x = t.minesweeperX, y = t.minesweeperY;
  const el = Grid.elements[x][y];
  if(!el) return;
  while(el.mines) Game._newLikeCurrent();
  Timer.start();
  svgDoc.onclick = mainClickHandler;
  ui.pauseCmd.removeAttribute("disabled");
  el.onLeftClick();
}

function mainClickHandler(event) {
  if(event.target.minesweeperX === undefined) return;
  const t = event.target, x = t.minesweeperX, y = t.minesweeperY;
  const el = Grid.elements[x][y];
  if(event.button == 2 || event.ctrlKey) {
    el.onRightClick();
  } else {
    el.onLeftClick();
  }
}



// This code is used within view.svg, which is loaded in an <iframe> in the
// main XUL file.  It mostly just manipulates <svg:use> elements.
//
// Interface for use by main XUL file's javascript is:
//   init(maximumMineCount)
//   HexGrid and SquareGrid objects

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

// Parameters of the basic hexagonal path being used.  The dimensions are
// essentially abitrary.
const slant_width = 37; // width of the left or right sloping part of the hex
const body_width = 75;  // width of the rectangular middle part of the hex
const half_height = 65; // half the height of the hex
const col_width = slant_width + body_width; // useful in layout
const half_width = 75; // for text positioning
const sqr_size = 50; 


function init_svg(maximumMineCount) {
  var defs = svgDoc.getElementById("defs");
  // maximum numbers visible in a tile (if all adjacent tiles have max. mines)
  var sqrMaxNum = 8 * maximumMineCount;
  var hexMaxNum = 6 * maximumMineCount;
  // create <g><use .../><text>23</text></g> for all needed numbers
  for(var i = 1; i <= maximumMineCount; ++i) {
    createTileTemplate("hex", "flag", i, defs);
    createTileTemplate("hex", "mine", i, defs);
    createTileTemplate("hex", "bang", i, defs);
    createTileTemplate("sqr", "flag", i, defs);
    createTileTemplate("sqr", "mine", i, defs);
    createTileTemplate("sqr", "bang", i, defs);
  }
  for(i = 1; i <= hexMaxNum; ++i)
    createTileTemplate("hex", "clear", i, defs);
  for(i = 1; i <= sqrMaxNum; ++i)
    createTileTemplate("sqr", "clear", i, defs);
}

function createTileTemplate(shapeID, kind, number, defs) {
  var g = svgDoc.createElementNS(SVG, "g");
  g.id = shapeID + "-" + kind + "-" + number; // xxx ick!
  g.appendChild(makeUseElement(shapeID));
  g.appendChild(textElement(number, half_width, half_height));
  g.className.baseVal = shapeID + "tile tile " + kind;
  defs.appendChild(g);
}

function makeUseElement(id) {
  var u = svgDoc.createElementNS(SVG, "use");
//   u.href = "#" + id;
  u.setAttributeNS(XLINK, "href", "#" + id);
  return u;
}

function textElement(str, x, y) {
  var n = svgDoc.createElementNS(SVG, "text");
  n.textContent = str;
  n.setAttribute("x", x);
  n.setAttribute("y", y);
  return n;
}

const view = {
  _useElements: [],  // list of <svg:use> elements
  _grid: null,       // 2d array of some of those <svg:use> elements
  _shape: "foo", // "hex" or "sqr"
  _width: -1,
  _height: -1,

  tileShape: null, // set this before calling showGrid (ick!) xxx

  showGrid: function(width, height) {
    if(this._shape != this.tileShape
        || this._width != width || this._height != height) {
      this._shape = this.tileShape;
      this._width = width;
      this._height = height;
      if(this.tileShape == "hex") this._showHexGrid(width, height);
      else this._showSqrGrid(width, height);
    }
    // set all tiles back to unflagged button appearance
    const us = this._useElements, shape = this._shape, num = width * height;
    for(var i = 0; i != num; ++i)
      us[i].setAttributeNS(XLINK, "href", "#" + shape + "-flag-0");
  },

  _showHexGrid: function(width, height) {
    const vbWidth = col_width * width + slant_width;
    const vbHeight = half_height * (height * 2 + 1);
    this._showGrid(width, height, vbWidth, vbHeight);
    // build new view
    for(var x = 0; x != width; ++x) {
      var dy = x % 2 ? 0 : half_height;
      for(var y = 0; y != height; ++y)
        this._redoTile(x,  y, col_width * x, half_height * 2 * y + dy);
    }
  },

  _showSqrGrid: function(width, height) {
    this._showGrid(width, height, width * sqr_size, height * sqr_size);
    const grid = this._grid;
    for(var x = 0; x != width; ++x)
      for(var y = 0; y != height; ++y)
        this._redoTile(x, y, sqr_size * x, sqr_size * y);
  },

  _showGrid: function(width, height, viewBoxWidth, viewBoxHeight) {
    const uses = this._useElements, needed = width * height;
    // Ensure enough tiles exist
    for(var i = uses.length; i < needed; ++i) {
//       dump("creating tile "+i+"\n");
      var u = uses[i] = svgDoc.createElementNS(SVG, "use");
      svgDoc.documentElement.appendChild(u);
    }
    // Hide superfluous tiles
    for(i = needed; i < uses.length; ++i) {
//       dump("hiding tile "+i+"\n");
      var u = uses[i];
      u.removeAttributeNS(XLINK, "href");
      u.setAttribute("x", "-1000");
      u.setAttribute("y", "-1000");
    }
    // Resize viewBox
    const vb = svgDoc.documentElement.viewBox.baseVal;
    vb.width = viewBoxWidth;
    vb.height = viewBoxHeight;
    // Set up _grid
    const grid = this._grid = [];
    for(var x = 0, i = 0; x != width; ++x) {
      grid[x] = [];
      for(var y = 0; y != height; ++y, ++i) grid[x][y] = uses[i];
    }
  },

  _redoTile: function(x, y, pixelX, pixelY) {
    const u = this._grid[x][y];
    u.setAttribute("x", pixelX);
    u.setAttribute("y", pixelY);
    u.minesweeperX = x;
    u.minesweeperY = y;
  },

  // Update a tile
  update: function(x, y, string, number) {
    if(typeof number != "undefined") string += "-" + number;
    this._grid[x][y].setAttributeNS(XLINK, "href", "#hex-" + string);
  }
}
