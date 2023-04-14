# exploit-template

This template contains:

1. A Roact Render Window wrapper
2. A port of luaparse
3. My owm AST renderer
4. Some typescript polyfills

These are optional dependencies, and you can remove them if you don't need them.
To do this, remove the folders (luaparse, renderer, ui) and the files (luaUtils.lua, luaparse.d.ts)
And remove the dependencies (@rbxts/roact, @rbxts/roact-hooked) You can also remove services and Sift, but i recommend keeping them.

My own typings for Synapse X V3 are also included. (https://github.com/4lve/rbxts-exploit-types), Also credit to RectangularObject for these types.

## Installation

```sh
yarn install
```

## Watching

This will watch for changes in the `src` directory and automatically build them.

```sh
yarn watch
```

## Building

```sh
yarn build
```
