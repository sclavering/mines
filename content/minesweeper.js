const HEXAGONAL = "hex";
const SQUARE = "sqr";

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

var game = null; // a Game object
var previousGame = null;
var paused = false;

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
  try {
    gTileShape = gPrefs.getCharPref("tile-shape");
    // to account for "square" (the old version of "sqr");
    if(!(gTileShape in computeAdjacents)) gTileShape = SQUARE;
  } catch(e) {}
  document.getElementById("shape-"+gTileShape).setAttribute("checked","true");

  // restore mines-per-tile
  try { gMinesPerTile = gPrefs.getIntPref("mines-per-tile"); } catch(e) {}
  document.getElementById("minespertile-"+gMinesPerTile).setAttribute("checked","true");

  svgWin = ui.svgFrame.contentWindow;
  svgDoc = svgWin.document;
  init_svg(7); // we allow 7 mines in a square

  Timer.init();
  MineCounters.init();
  newGame();
};



function setDifficulty(difficulty) {
  gCurrentDifficulty = difficulty;
  gPrefs.setIntPref("difficulty-level", difficulty);
  newGame();
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
  newGame();
}

function setTileShape(shape) {
  gTileShape = shape;
  gPrefs.setCharPref("tile-shape", shape);
  newGame();
}

function toggleNoMinesAtEdges(menuitem) {
  gNoMinesAtEdges = menuitem.getAttribute("checked")=="true";
  newGame();
}


function togglePause() {
  if(paused) {
    ui.pauseMsg.hidden = true;
    Timer.start();
  } else {
    ui.pauseMsg.hidden = false;
    Timer.stop();
  }
  paused = !paused;
}


function newGame() {
  if(game) game.end();

  const width = kWidths[gCurrentDifficulty];
  const height = kHeights[gCurrentDifficulty];
  const mines = kMines[gMinesPerTile][gCurrentDifficulty];
  const shape = gTileShape;

  const g2 = previousGame;
  var adj = g2 && g2.width == width && g2.height == height && g2.shape == shape;
  adj = adj ? previousGame.adjacents : computeAdjacents[shape](width, height);

  previousGame = game = new Game(shape, width, height, mines, adj);
  MineCounters.setAll(mines);
  Timer.reset();
  ui.pauseMsg.hidden = true;
  ui.smileyFace.setFace("normal");
  view.showGrid(shape, width, height);
  if(gNoMinesAtEdges) {
    game.fillGrid()
    game.revealEdges();
    svgDoc.onclick = mainClickHandler;
    ui.pauseCmd.removeAttribute("disabled");
    Timer.start();
  } else {
    svgDoc.onclick = safeFirstClickHandler;
  }
};

function Game(shape, width, height, mines, adjacents) {
  this.shape = shape
  this.width = width;
  this.height = height;
  this.mines = mines; // mine-count -> tile-count mapping array, offset by 1
  this.adjacents = adjacents;
  // The number of tiles which have no mines
  this.nonMines = this.width * this.height;
  for(var i in mines) this.nonMines -= this.mines[i];
  // the maximum number of flags on a single square.  >1 in advanced games
  this.maxFlags = mines.length;
  this.squaresRevealed = 0;
  const grid = this.grid = new Array(width);
  for(var x = 0; x != width; ++x) {
    grid[x] = new Array(height);
    for(var y = 0; y != height; ++y) grid[x][y] = new Tile(x, y);
  }
};

Game.prototype = {
  // An x -> y -> Tile map/array.
  // Hexagonal games assume the even columns are the ones offset vertically.
  grid: [],

  // An x->y->(co-ord list) mapping, where co-ords are stored as [x,y] arrays.
  // adjacents[a][b] gives the coords of tiles adjacent to (a,b)
  adjacents: null,

  checkWon: function() {
    if(this.squaresRevealed != this.nonMines) return;
    this.end();
    this.updateForGameWon();
    ui.smileyFace.setFace("won");
  },

  lose: function() {
    this.updateForGameLost();
    this.end();
    ui.smileyFace.setFace("lost");
  },

  end: function() {
    game = null;
    Timer.stop();
    svgDoc.onclick = null;
    ui.pauseCmd.setAttribute("disabled", "true");
  },

  fillGrid: function() {
    const width = this.width, height = this.height, mines = this.mines;
    const grid = this.grid, adjacents = this.adjacents;
    const maxx = width - 1, maxy = height - 1;
    // create the required number of mines, and set the number for other tiles
    for(var i = 1; i <= mines.length; i++) {
      var minesPlaced = 0;
      while(minesPlaced != mines[i-1]) {
        var x, y;
        do { x = Math.random(); } while(x == 1.0);
        do { y = Math.random(); } while(y == 1.0);
        x = Math.floor(x * width);
        y = Math.floor(y * height);
        var el = grid[x][y];
        if(el.mines) continue;
        if(gNoMinesAtEdges && (!x || x==maxx || !y || y==maxy)) continue;
        el.mines = i;
        minesPlaced++;
        // increment number for surrounding tiles
        var adjs = adjacents[x][y];
        for(var j = 0; j != adjs.length; ++j)
          this.getTile(adjs[j]).number += i;
      }
    }
  },

  // Argument is an [x,y] pair as an array (i.e. the format used in .adjacents)
  getTile: function(coords) {
    return this.grid[coords[0]][coords[1]];
  },

  revealEdges: function() {
    const es = this.grid, w = this.width, h = this.height;
    const maxx = w - 1, maxy = h - 1;
    for(var y = 0; y != h; ++y) {
      var el = es[0][y];
      if(!el.revealed) this.reveal(el);
      el = es[maxx][y];
      if(!el.revealed) this.reveal(el);
    }
    for(var x = 1; x != maxx; ++x) {
      el = es[x][0];
      if(!el.revealed) this.reveal(el);
      el = es[x][maxy];
      if(!el.revealed) this.reveal(el);
    }
  },

  updateForGameLost: function() {
    const els = this.grid, w = this.width, h = this.height;
    for(var x = 0; x != w; ++x) {
      for(var y = 0; y != h; ++y) {
        var el = els[x][y];
        if(el.mines) {
          if(el.mines != el.flags) view.update(el, "mine", el.mines);
        } else {
          if(el.flags) view.update(el, "cross");
        }
      }
    }
  },

  updateForGameWon: function() {
    // flag remaining mines (also fixes incorrect flag numbers)
    for(var x = 0; x < this.width; x++) {
      for(var y = 0; y < this.height; y++) {
        var el = this.grid[x][y];
        if(el.mines != el.flags) view.update(el, "flag", el.mines);
      }
    }
    MineCounters.resetAll();
  },

  adjustFlags: function(tile, num) {
    MineCounters.increase(tile.flags);
    MineCounters.decrease(num);
    tile.flags = num;
    view.update(tile, "flag", num);
  },

  tileClicked: function(x, y, isRightClick) {
    const tile = this.grid[x][y];
    if(tile.revealed) {
      // Reveal surrounding unflagged tiles if there is the correct number of
      // flags in the surrounding tiles.  (They may be in the wrong place...)
      const adj = this.adjacents[tile.x][tile.y], num = adj.length;
      var flags = 0;
      for(var i = 0; i != num; ++i) flags += this.getTile(adj[i]).flags;
      if(flags == tile.number) this.revealAround(tile);
    } else if(isRightClick) {
      // Add a flag or remove them all
      this.adjustFlags(tile, tile.flags == this.maxFlags ? 0 : tile.flags + 1);
    } else if(tile.flags) {
      this.adjustFlags(tile, tile.flags - 1);
    } else {
      this.reveal(tile);
    }
  },

  reveal: function(tile) {
    if(tile.mines) {
      this.lose();
      view.update(tile, "bang", tile.mines);
    } else {
      tile.revealed = true;
      this.squaresRevealed++;
      view.update(tile, "clear", tile.number);
      if(!tile.number) this.revealAround(tile);
      this.checkWon();
    }
  },

  revealAround: function(tile) {
    const adj = this.adjacents[tile.x][tile.y], num = adj.length;
    for(var i = 0; i != num; ++i) {
      var el = this.getTile(adj[i]);
      if(!el.revealed && !el.flags) this.reveal(el);
    }
  }
}

function Tile(x, y) {
  this.x = x;
  this.y = y;
  this.revealed = false;
  this.flags = 0;
  this.mines = 0;
  this.number = 0;
}


// Functions to compute a x -> y -> coord list mapping to adjacent squares
const computeAdjacents = {};

computeAdjacents.hex = function(width, height) {
  const map = [];
  for(var x = 0, even = true; x < width; x++, even = !even) {
    map[x] = [];
    for(var y = 0; y < height; y++) {
      var adj = map[x][y] = [];
      // y co-ord of tile half-above/below this in *adjacent* columns
      var up = even ? y : y - 1;
      var down = even ? y + 1 : y;
      var left = x - 1, right = x + 1;
      // up left
      if(x) {
        if(down < height) adj.push([left, down]);  // down left
        if(up >= 0) adj.push([left, up]);          // up left
      }
      if(y) adj.push([x, y - 1]);                  // *straight* up
      if(right < width) {
        if(up >= 0) adj.push([right, up]);         // up right
        if(down < height) adj.push([right, down]); // down right
      }
      if(y + 1 < height) adj.push([x, y + 1]);     // *straight* down
//       dump("adjacent to ("+x+","+y+") are: ");
//       for each(a in map[x][y]) dump("(" + a + ") ");
//       dump("\n");
    }
  }
  return map;
};

computeAdjacents.sqr = function(width, height) {
  const map = [];
  const xmax = width - 1, ymax = height - 1;
  for(var x = 0; x < width; x++) {
    map[x] = [];
    for(var y = 0; y < height; y++) {
      var adjacent = map[x][y] = [];
      if(x != 0) {
        if(y != ymax) adjacent.push([x - 1, y + 1]);
        if(y != 0) adjacent.push([x - 1, y - 1]);
        adjacent.push([x - 1, y]);
      }
      if(x != xmax) {
        if(y != ymax) adjacent.push([x + 1, y + 1]);
        if(y != 0) adjacent.push([x + 1, y - 1]);
        adjacent.push([x + 1, y]);
      }
      if(y != ymax) adjacent.push([x, y + 1]);
      if(y != 0) adjacent.push([x, y - 1]);
    }
  }
  return map;
};


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
  // These hold a dummy object for the non-existent 0-mines counter
  containers: [{}],
  displays: [{}],

  init: function() {
    var i = 0;
    while(true) {
      var elt = document.getElementById("mine-counter-" + i++);
      if(!elt) break;
      this.displays.push(elt);
      this.containers.push(elt.parentNode);
    }
  },

  increase: function(c) {
    this.values[c]++;
    this.displays[c].value = this.values[c];
  },
  decrease: function(c) {
    this.values[c]--;
    this.displays[c].value = this.values[c];
  },

  resetAll: function() {
    for(var i = 0; i != this.values.length; i++) this.displays[i].value = 0;
  },
  setAll: function(newvals) {
    const vals = this.values = [0].concat(newvals);
    const num = vals.length, ds = this.displays, cs = this.containers;
    for(var i = 0; i != num; i++) {
      ds[i].value = vals[i];
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
  const el = game.grid[x][y];
  if(!el) return;
  // Setting .mines prevents fillGrid() from putting a mine there
  el.mines = 1000;
  game.fillGrid();
  el.mines = 0;
  Timer.start();
  svgDoc.onclick = mainClickHandler;
  ui.pauseCmd.removeAttribute("disabled");
  game.tileClicked(x, y, false);
}

function mainClickHandler(event) {
  if(event.target.minesweeperX === undefined) return;
  const t = event.target, x = t.minesweeperX, y = t.minesweeperY;
  game.tileClicked(x, y, event.button == 2 || event.ctrlKey);
}



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
const half_square = 25;


function init_svg(maximumMineCount) {
  var defs = svgDoc.getElementById("defs");
  // maximum numbers visible in a tile (if all adjacent tiles have max. mines)
  var sqrMaxNum = 8 * maximumMineCount;
  var hexMaxNum = 6 * maximumMineCount;
  // create <g><use .../><text>23</text></g> for all needed numbers
  for(var i = 1; i <= maximumMineCount; ++i) {
    createTileTemplate("hex", "flag", i, half_width, half_height, defs);
    createTileTemplate("hex", "mine", i, half_width, half_height, defs);
    createTileTemplate("hex", "bang", i, half_width, half_height, defs);
    createTileTemplate("sqr", "flag", i, half_square, half_square, defs);
    createTileTemplate("sqr", "mine", i, half_square, half_square, defs);
    createTileTemplate("sqr", "bang", i, half_square, half_square, defs);
  }
  for(i = 1; i <= hexMaxNum; ++i)
    createTileTemplate("hex", "clear", i, half_width, half_height, defs);
  for(i = 1; i <= sqrMaxNum; ++i)
    createTileTemplate("sqr", "clear", i, half_square, half_square, defs);
}

function createTileTemplate(shapeID, kind, number, textX, textY, defs) {
  var g = svgDoc.createElementNS(SVG, "g");
  g.id = shapeID + "-" + kind + "-" + number; // xxx ick!
  g.appendChild(makeUseElement(shapeID));
  g.appendChild(textElement(number, textX, textY));
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
  _shape: null,      // "hex" or "sqr"
  _width: -1,
  _height: -1,

  showGrid: function(shape, width, height) {
    if(shape != this._shape || this._width != width || this._height != height) {
      this._shape = shape;
      this._width = width;
      this._height = height;
      if(shape == "hex") this._showHexGrid(width, height);
      else this._showSqrGrid(width, height);
    }
    // set all tiles back to unflagged button appearance
    const us = this._useElements, num = width * height;
    const href = "#" + shape + "-flag-0";
    for(var i = 0; i != num; ++i) us[i].setAttributeNS(XLINK, "href", href);
  },

  _showHexGrid: function(width, height) {
    const vbWidth = col_width * width + slant_width;
    const vbHeight = half_height * (height * 2 + 1);
    this._showGrid(width, height, vbWidth, vbHeight);
    // build new view
    for(var x = 0; x != width; ++x) {
      var dy = x % 2 ? 0 : half_height;
      for(var y = 0; y != height; ++y)
        this._redoTile(x, y, col_width * x, half_height * 2 * y + dy);
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
  update: function(tile, string, number) {
    if(typeof number != "undefined") string += "-" + number;
    const href = "#" + this._shape + "-" + string;
    this._grid[tile.x][tile.y].setAttributeNS(XLINK, "href", href);
  }
}
