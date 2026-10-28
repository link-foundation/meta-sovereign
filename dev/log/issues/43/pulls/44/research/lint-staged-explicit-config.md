- `false`: Run all tasks serially
- `true` (default) : _Infinite_ concurrency. Runs as many tasks in parallel as possible.
- `{number}`: Run the specified number of tasks in parallel, where `1` is equivalent to `false`.

#### `--config [path]`

Manually specify a path to a config file or npm package name. Note: when used, lint-staged won't perform the config file search and will print an error if the specified file cannot be found. If '-' is provided as the filename then the config will be read from stdin, allowing piping in the config like `cat my-config.json | npx lint-staged --config -`.

#### `--cwd [path]`

Change the working directory _lint-staged_ runs tasks in. Defaults to `process.cwd()` and the value can be absolute or relative to the default value.
