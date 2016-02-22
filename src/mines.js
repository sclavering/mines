const kWidths = [9,16,30];
const kHeights = [9,16,16];

const kMines = [null,
  [[0,10], [0,40], [0,100]],
  [[0,6,4], [0,24,16], [0,60,40]],
  [[0,5,3,2], [0,20,12,8], [0,50,30,20]],
  [[0,4,3,2,1], [0,16,12,8,4], [0,40,30,20,10]],
  [[0,4,2,2,1,1], [0,15,10,7,5,3], [0,40,24,18,12,6]],
  [[0,3,2,2,1,1,1], [0,15,10,6,4,3,2], [0,35,25,16,11,8,5]],
  [[0,2,2,2,1,1,1,1], [0,15,9,6,4,3,2,1], [0,30,24,18,12,8,5,3]]
];


var g_settings = {
  difficulty: 1,
  shape: "sqrdiag",
  max_mines_per_tile: 1,
  no_mines_at_edges: false,
};

const ui = {
  pauseCmd: 'pause-button',
  pauseMsg: 'msg-pause',
};


var game = null; // a Game object
var paused = false;

// This is assumed to happen after the SVG document is loaded too. Seems to work :)
window.onload = function() {
  for(var i in ui) ui[i] = document.getElementById(ui[i]);
  Timer.init();
  MineCounters.init();
  newGame();
};


function showSettings() {
  if(!paused) togglePause();
  const wrapper = document.getElementById("settings-wrapper");
  const hide_settings = function() { ReactDOM.unmountComponentAtNode(wrapper); };
  const on_settings_save = function(vals) {
    g_settings = vals;
    hide_settings();
    newGame();
  };
  ReactDOM.render(React.createElement(SettingsUI, {
      settings: g_settings,
      on_settings_save: on_settings_save,
      on_settings_cancel: hide_settings,
    }), wrapper);
}


function togglePause() {
  if(ui.pauseCmd.getAttribute("disabled")) return;
  if(paused) {
    ui.pauseMsg.style.display = 'none';
    Timer.start();
  } else {
    ui.pauseMsg.style.display = 'block';
    Timer.stop();
  }
  paused = !paused;
}


function show_game(game) {
  const wrapper = document.getElementById("wrapper");
  ReactDOM.unmountComponentAtNode(wrapper);
  return ReactDOM.render(React.createElement(GridUI, { game: game }), wrapper);
};


function newGame() {
  if(game) game.end();

  const settings = g_settings;
  const width = kWidths[settings.difficulty];
  const height = kHeights[settings.difficulty];
  const mines = kMines[settings.max_mines_per_tile][settings.difficulty];
  game = new Game(settings.shape, width, height, mines);

  MineCounters.setAll(mines);
  Timer.reset();
  ui.pauseMsg.style.display = 'none';
  game.gridui = show_game(game);
  if(settings.no_mines_at_edges) {
    game.fillGrid()
    game.revealEdges();
    game.first_click_handled = true;
    ui.pauseCmd.removeAttribute("disabled");
    Timer.start();
  }
};

function Game(shape, width, height, mines) {
  this.shape = shape
  this.width = width;
  this.height = height;
  this.mines = mines; // mine-count -> tile-count mapping array, offset by 1
  // The number of tiles which have no mines
  this.nonMines = this.width * this.height;
  for(var i in mines) this.nonMines -= this.mines[i];
  this.maxFlags = mines.length - 1;
  this.squaresRevealed = 0;
  this.grid = GridUtil.generate(shape, width, height, false);
  for(let tile of this.grid.tiles) {
    tile.revealed = false;
    tile.flags = 0;
    tile.mines = 0;
    tile.number = 0;
    this.error = null;
  }
  this.view_versions = {};
  for(let tile of this.grid.tiles) this.view_versions[tile.id] = 1;

  this.ended = false;
  this.first_click_handled = false;
  this.click_handler = (tile, is_non_standard_click) => {
    if(this.ended) return;
    if(this.first_click_handled) game.tileClicked(tile, is_non_standard_click);
    else if(!is_non_standard_click) safeFirstClickHandler(tile);
    this.gridui.forceUpdate();
  };
};

Game.prototype = {
  checkWon: function() {
    if(this.squaresRevealed != this.nonMines) return;
    this.end();
    this.updateForGameWon();
  },

  lose: function() {
    this.updateForGameLost();
    this.end();
  },

  end: function() {
    game = null;
    Timer.stop();
    this.ended = true;
    ui.pauseCmd.setAttribute("disabled", "true");
  },

  fillGrid: function() {
    const tiles = this.grid.tiles;
    const max_x = this.width - 1, max_y = this.height - 1;
    this.mines.forEach((required_num, i) => {
      var minesPlaced = 0;
      while(minesPlaced !== required_num) {
        let tile = tiles[random_int(tiles.length)];
        if(tile.mines) continue;
        if(!tile.x || tile.x === max_x || !tile.y || tile.y === max_y) continue;
        tile.mines = i;
        minesPlaced++;
        tile.adj.forEach(other => { if(other) other.number += i; });
      }
    });
  },

  revealEdges: function() {
    this.grid.tiles.forEach(tile => {
      if(tile.x === 0 || tile.x === this.width - 1 || tile.y === 0 || tile.y === this.height - 1) this.reveal(tile);
    });
  },

  updateForGameLost: function() {
    this.grid.tiles.forEach(tile => {
      if(tile.mines) {
        if(tile.mines !== tile.flags) {
          ++this.view_versions[tile.id];
          tile.error = "mine";
        }
      } else {
        if(tile.flags) {
          ++this.view_versions[tile.id];
          tile.error = "cross";
        }
      }
    });
  },

  updateForGameWon: function() {
    // flag remaining mines (also fixes incorrect flag numbers)
    this.grid.tiles.forEach(tile => {
      if(tile.mines !== tile.flags) {
        tile.flags = tile.mines;
        ++this.view_versions[tile.id];
      }
    });
    MineCounters.resetAll();
  },

  adjustFlags: function(tile, num) {
    if(tile.flags) MineCounters.increase(tile.flags);
    tile.flags = num;
    if(num) MineCounters.decrease(num);
    ++this.view_versions[tile.id];
  },

  tileClicked: function(tile, isRightClick) {
    if(tile.revealed) {
      // Reveal surrounding unflagged tiles if there is the correct number of flags in the surrounding tiles.  (They may be in the wrong place...)
      let flags = 0;
      tile.adj.forEach(other => { if(other) flags += other.flags; });
      if(flags === tile.number) this.revealAround(tile);
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
      tile.error = "bang";
    } else {
      tile.revealed = true;
      this.squaresRevealed++;
      if(!tile.number) this.revealAround(tile);
      this.checkWon();
    }
    ++this.view_versions[tile.id];
  },

  revealAround: function(tile) {
    tile.adj.forEach(el => {
      if(el && !el.revealed && !el.flags) this.reveal(el);
    });
  },
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
    Timer.display.textContent = (++Timer.time);
  },

  stop: function() {
    clearInterval(this.interval);
    return this.time;
  },

  reset: function() {
    this.time = 0;
    this.display.textContent = 0;
  }
}



var MineCounters = {
  values: [],
  // These hold a dummy object for the non-existent 0-mines counter
  displays: [{}],

  init: function() {
    var i = 1;
    while(true) {
      var elt = document.getElementById("mine-counter-" + i++);
      if(!elt) break;
      this.displays.push(elt);
    }
  },

  increase: function(c) {
    this.values[c]++;
    this.displays[c].textContent = this.values[c];
  },
  decrease: function(c) {
    this.values[c]--;
    this.displays[c].textContent = this.values[c];
  },

  resetAll: function() {
    for(var i = 0; i != this.values.length; i++) this.displays[i].textContent = 0;
  },
  setAll: function(newvals) {
    const vals = this.values = newvals.slice();
    const num = vals.length, ds = this.displays;
    for(var i = 1; i != num; i++) {
      ds[i].textContent = vals[i];
      ds[i].parentNode.parentNode.style.visibility = 'visible';
    }
    for(; i != ds.length; i++) ds[i].parentNode.parentNode.style.visibility = 'hidden';
  }
}


function safeFirstClickHandler(el) {
  // Setting .mines prevents fillGrid() from putting a mine there
  el.mines = 1000;
  game.fillGrid();
  el.mines = 0;
  Timer.start();
  game.first_click_handled = true;
  ui.pauseCmd.removeAttribute("disabled");
  game.tileClicked(el, false);
}


function random_int(max) {
  var r;
  do { r = Math.random(); } while(r == 1.0);
  return Math.floor(r * max);
}
