# Target-specific desktop native prebuilds

1. Preserve run 43811953283 metadata and logs, bind it to published commit
   `83fea0ee`, and reproduce its SQLite foreign-binary error without building
   Electron locally.
2. Use the existing builder's per-target file exclusions to retain SQLite
   binaries for the target OS/architecture. Preserve portable provider code,
   dependency staging, native verification and concurrent architecture builds.
3. Verify focused actual-builder checks and existing packaging contracts in
   Node/Deno, preserve source/log evidence, publish the correction and inspect
   the full hosted desktop matrix for the new commit.
