const GridUtil = {
    generate(shape, width, height, wrap) {
        // Tile directions are: 0:top 1:topright 2:right 3:bottomright 4:bottom 5:bottomleft 6:left 7:topleft
        if(shape === "sqrdiag") return this._generate_grid("sqrdiag", 8, width, height, (x, y) => [
            [0, x, y - 1],
            [1, x + 1, y - 1],
            [2, x + 1, y],
            [3, x + 1, y + 1],
        ]);

        // Tile directions are 0:upleft 1:up 2:upright 3:downright 4:down 5:downleft
        if(shape === "hex") {
            return this._generate_grid("hex", 6, width, height, (x, y) => {
                let slope_up_y = x % 2 ? y - 1 : y;
                return [
                    [0, x - 1, slope_up_y],
                    [1, x, y - 1],
                    [2, x + 1, slope_up_y],
                ];
            });
        }

        throw new Error("bad shape");
    },

    _generate_grid(shape, num_sides, width, height, adjacents_func) {
        const tile_grid = new Array(width);
        let id = 0;
        for(let x = 0; x !== width; ++x) {
            tile_grid[x] = new Array(height);
            for(let y = 0; y !== height; ++y) tile_grid[x][y] = this._new_tile(num_sides, id++, x, y);
        }
        for(let x = 0; x !== width; ++x) {
            for(let y = 0; y !== height; ++y) {
                let tile = tile_grid[x][y];
                adjacents_func(tile.x, tile.y).forEach(tmp => {
                    if(!tmp) return;
                    const [dir, x, y] = tmp;
                    const other = (tile_grid[x] && tile_grid[x][y]) || null;
                    if(!other) return;
                    tile.adj[dir] = other;
                    other.adj[this.invert_direction(tile, dir)] = tile;
                });
            }
        }
        return {
            shape: shape,
            width: width,
            height: height,
            tiles: Array.concat.apply(null, tile_grid),
        };
    },

    _new_tile(num_sides, id, x, y) {
        return {
            id: id,
            x: x,
            y: y,
            num_sides: num_sides,
            adj: Array(num_sides).fill(null),
        };
    },

    invert_direction(tile, dir) {
        const modulo = tile.num_sides;
        return (dir + modulo / 2) % modulo;
    },
};
