# aitty wterm fork publishing

This branch keeps the upstream source package names (`@wterm/core` and
`@wterm/dom`) so it can be rebased onto upstream wterm with minimal conflicts.
The publish script generates temporary npm packages under
`dist/aitty-wterm-publish` with aitty-scoped names:

- `@aitty/wterm-core`
- `@aitty/wterm-dom`

The generated `@aitty/wterm-dom` package rewrites imports and dependencies from
`@wterm/core` to `@aitty/wterm-core`, so consumers do not need unpublished
`@wterm/*` versions.

## Release a fork patch

1. Commit the wterm patch on this branch.
2. Choose the next fork version, usually based on the upstream version:
   - First fork from `0.3.1`: `0.3.1-aitty.0`
   - Next aitty-only patch: `0.3.1-aitty.1`
   - After rebasing onto upstream `0.3.2`: `0.3.2-aitty.0`
3. Run a dry-run pack:

```bash
pnpm pack:aitty-wterm -- --version 0.3.1-aitty.0
```

4. Publish from a clean git worktree:

```bash
pnpm publish:aitty-wterm -- --version 0.3.1-aitty.0
```

If npm requires 2FA:

```bash
pnpm publish:aitty-wterm -- --version 0.3.1-aitty.0 --otp 123456
```

## Optional validation

Run focused tests before preparing packages:

```bash
pnpm pack:aitty-wterm -- --version 0.3.1-aitty.0 --test
```

The script always rebuilds the Zig WASM and the core/dom TypeScript packages
unless `--no-build` is passed.

## Consume from aitty

After publishing, use the fork package in aitty:

```json
{
  "dependencies": {
    "@aitty/wterm-dom": "^0.3.1-aitty.0"
  }
}
```

Update imports from `@wterm/dom` to `@aitty/wterm-dom`.

## Notes

- Do not publish from the temporary `dist/aitty-wterm-publish` directory by hand.
- Do not commit `file:/tmp/...` overrides from local testing.
- Keep source package names as `@wterm/*` unless there is a deliberate decision
  to stop rebasing from upstream wterm.
