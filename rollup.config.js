// Rollup plugins
import babel from 'rollup-plugin-babel';

export default {
    name: 'html5_rtsp_player',
    input: 'src/index.js',
    output: {
        file: 'build/js/player.js',
        format: 'cjs'
    },
    // sourcemap: 'inline',
    plugins: [
        babel({
            exclude: 'node_modules/**',  // only transpile our source code
            include: 'node_modules/bp_**'
        }),
      ],
};