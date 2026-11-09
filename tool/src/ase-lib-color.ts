/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  a color: its sRGB channels (0-255) and its alpha (0-1)  */
type Color = { rgb: [ number, number, number ], alpha: number }

/*  the 148 named colors of CSS  */
const NAMED = new Map((
    "aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc " +
    "bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a " +
    "burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 " +
    "cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b " +
    "darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b " +
    "darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 " +
    "darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f " +
    "darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff " +
    "dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 " +
    "forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 " +
    "goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 " +
    "hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa " +
    "lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 " +
    "lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 " +
    "lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa " +
    "lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 " +
    "limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa " +
    "mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 " +
    "mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 " +
    "midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead " +
    "navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 " +
    "orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 " +
    "papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 " +
    "purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 " +
    "saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d " +
    "silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa " +
    "springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 " +
    "turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 " +
    "yellowgreen:9acd32"
).split(" ").map((pair) => pair.split(":") as [ string, string ]))

/*  parse a CSS color value ("#rgb[a]", "#rrggbb[aa]", "rgb[a](...)", or a
    named color), or else null (like for "none", "transparent", or "var(...)")  */
export const parseColor = (value: string): Color | null => {
    const text  = value.trim().toLowerCase()
    const named = NAMED.get(text)
    let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(named !== undefined ? `#${named}` : text)
    if (m !== null) {
        const hex = m[1]!.length <= 4 ? m[1]!.replace(/./g, "$&$&") : m[1]!
        const n   = (i: number) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
        return { rgb: [ n(0), n(1), n(2) ], alpha: hex.length === 8 ? n(3) / 255 : 1 }
    }
    m = /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(text)
    if (m !== null) {
        const num = (s: string, max: number) => s.endsWith("%") ? Number.parseFloat(s) / 100 * max : Number.parseFloat(s)
        const ch  = (s: string) => Math.max(0, Math.min(255, Math.round(num(s, 255))))
        const alpha = m[4] !== undefined ? Math.max(0, Math.min(1, num(m[4], 1))) : 1
        return { rgb: [ ch(m[1]!), ch(m[2]!), ch(m[3]!) ], alpha }
    }
    return null
}

/*  convert sRGB channels into the perceptually uniform OKLab color space  */
const oklab = ([ r, g, b ]: [ number, number, number ]): [ number, number, number ] => {
    const lin = (c: number) => {
        const v = c / 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    const [ lr, lg, lb ] = [ lin(r), lin(g), lin(b) ]
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ]
}

/*  confine all literal colors of an SVG document (in its color attributes, its
    "style" attributes, and its "<style>" elements) to their perceptually nearest
    color of a palette (of "#rrggbb" colors), keeping their alpha, while values
    without a literal color (like "none" or "var(...)") are kept as-is  */
export const confineColors = (svg: string, palette: string[]): string => {
    const targets = palette.flatMap((hex) => {
        const color = parseColor(hex)
        return color !== null ? [ { hex: hex.toLowerCase(), lab: oklab(color.rgb) } ] : []
    })
    if (targets.length === 0)
        return svg
    const cache   = new Map<string, string>()
    const nearest = (value: string): string => {
        let mapped = cache.get(value)
        if (mapped === undefined) {
            const color = parseColor(value)
            if (color === null)
                mapped = value
            else {
                const lab  = oklab(color.rgb)
                const dist = (t: typeof targets[number]) =>
                    (t.lab[0] - lab[0]) ** 2 + (t.lab[1] - lab[1]) ** 2 + (t.lab[2] - lab[2]) ** 2
                const best = targets.reduce((a, b) => dist(b) < dist(a) ? b : a)
                mapped = best.hex + (color.alpha < 1 ? Math.round(color.alpha * 255).toString(16).padStart(2, "0") : "")
            }
            cache.set(value, mapped)
        }
        return mapped
    }
    const PROPS = "--[\\w-]+|fill|stroke|color|stop-color|flood-color|lighting-color|background-color|background"
    const declarations = (css: string) => css.replace(
        new RegExp(`((?:^|[;{\\s])(?:${PROPS})\\s*:\\s*)([^;{}!]*?)(?=\\s*(?:!important\\s*)?(?:[;}]|$))`, "g"),
        (_, prefix: string, value: string) => `${prefix}${nearest(value)}`)
    return svg
        .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g,
            (_, open: string, css: string, close: string) => `${open}${declarations(css)}${close}`)
        .replace(/(\sstyle=")([^"]*)(")/g,
            (_, open: string, css: string, close: string) => `${open}${declarations(css)}${close}`)
        .replace(/(\s(?:fill|stroke|color|stop-color|flood-color|lighting-color)=")([^"]*)(")/g,
            (_, open: string, value: string, close: string) => `${open}${nearest(value)}${close}`)
}
