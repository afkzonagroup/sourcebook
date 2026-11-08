// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { runAction } from './run.js';

process.exitCode = await runAction(process.env, {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
});
