const sqr_size = 130;
const sqr_half = 65;

const hex_height = 130;
const hex_half_height = 65;
const hex_half_width = 74;
const hex_hoffset = 111; // width of left point and rectangular body together
const hex_overhang = 37; // width of right point
const hex_node_radius = 30;
const hex_path = `M -${hex_half_width},0 L -${hex_overhang},-${hex_half_height} ${hex_overhang},-${hex_half_height} ${hex_half_width},0 ${hex_overhang},${hex_half_height} -${hex_overhang},${hex_half_height} z`;

const grid_font_size = 70;

const number_colours = {
    1: "blue",
    2: "#008400",
    3: "red",
    4: "#000084",
    5: "#840000",
    6: "#008484",
    7: "#840084",
};


const GridUI = React.createClass({
    render(props) {
        const game = this.props.game;
        const shape = game.shape;
        const viewbox = shape === "sqrdiag" ? [game.width * sqr_size, game.height * sqr_size] : [hex_hoffset * game.width + hex_overhang, hex_half_height * (game.height * 2 + 1)];
        return <svg viewBox={ "0 0 " + viewbox[0] + " " + viewbox[1] } preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ MozUserSelect: "none", fontSize: grid_font_size }}>
            { game.grid.tiles.map(tile => <PureWrapper key={ tile.id } component={ TileWrapper } game={ game } tile={ tile } tile_view_state={ game.view_versions[tile.id] }/>) }
        </svg>;
    },
});

function TileWrapper(props) {
    const shape = props.game.shape;
    const Component = shape === "sqrdiag" ? SquareTile : HexTile;
    const tile_view_state = props.tile_view_state;
    const tile = props.tile;
    const tile_status_class = tile.error || (tile.revealed ? "clear" : "flag");
    const display_text = tile.error ? tile.mines : tile.revealed ? tile.number : (tile.flags ? tile.flags + "⚑" : "");
    const colour_num = tile.revealed ? tile.number : tile.flags;
    return <Component tile={ tile } tile_class={ shape + " tile " + tile_status_class } tile_text={ display_text || "" }
        style={{ color: number_colours[colour_num] || null }}
        onclick={ ev => {
            ev.preventDefault();
            if(game) game.click_handler(tile, ev.button || ev.ctrlKey || ev.shiftKey);
        }}
    />;
};

function SquareTile(props) {
    const transform = "translate(" + (props.tile.x * sqr_size) + "," + (props.tile.y * sqr_size) + ")";
    return <g transform={ transform } className={ props.tile_class } style={ props.style } onClick={ props.onclick }>
        <rect className="shape" width={ sqr_size } height={ sqr_size }/>
        <text x={ sqr_half } y={ sqr_half }>{ props.tile_text }</text>
    </g>;
};

function HexTile(props) {
    const transform = hex_center_translate(props.tile);
    return <g transform={ transform } className={ props.tile_class } style={ props.style } onClick={ props.onclick }>
        <path className="shape" d={ hex_path }/>
        <text>{ props.tile_text }</text>
    </g>;
};

function hex_center_translate(tile) {
    const x = tile.x * hex_hoffset + hex_half_width;
    const y = tile.y * hex_height + hex_half_height + (tile.x % 2 ? 0 : hex_half_height);
    return "translate(" + x + "," + y + ")";
};


const PureWrapper = React.createClass({
    shouldComponentUpdate: function(next_props, _next_state) {
        // This assumes the prop names aren't changing, but that's almost certainly correct.
        for(let k in next_props) if(this.props[k] !== next_props[k]) return true;
        return false;
    },
    render() {
        return React.createElement(this.props.component, this.props);
    },
});
