// Parameters of the basic hexagonal path being used.  The dimensions are essentially abitrary.
const slant_width = 37; // width of the left or right sloping part of the hex
const body_width = 75;  // width of the rectangular middle part of the hex
const half_height = 65; // half the height of the hex
const col_width = slant_width + body_width; // useful in layout
const half_width = 75; // for text positioning
const sqr_size = 50;
const half_square = 25;

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
        const viewbox = shape === "sqrdiag" ? [game.width * sqr_size, game.height * sqr_size] : [col_width * game.width + slant_width, half_height * (game.height * 2 + 1)];
        return <svg viewBox={ "0 0 " + viewbox[0] + " " + viewbox[1] } preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ MozUserSelect: "none" }}>
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
        <path className="shape" d="M 0,0 L 50,0 50,50 0,50 z"/>
        <text x={ half_square } y={ half_square }>{ props.tile_text }</text>
    </g>;
};

function HexTile(props) {
    const transform = "translate(" + (props.tile.x * col_width) + "," + ((2 * props.tile.y + (props.tile.x % 2 ? 0 : 1)) * half_height) + ")";
    return <g transform={ transform } className={ props.tile_class } style={ props.style } onClick={ props.onclick }>
        <path className="shape" d="M 112,0 L 37,0 L 0,65 L 37,130 L 112,130 L 149,65 z"/>
        <text x={ half_width } y={ half_height }>{ props.tile_text }</text>
    </g>;
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
