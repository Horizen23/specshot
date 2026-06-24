import { generateApi } from './dist/core/generate.js';
import path from 'path';

await generateApi(
  './examples/real-or-fake/meme.json',
  './examples/real-or-fake/client/src/lib/api/meme/services',
  undefined,
  undefined,
  {
    msw: true,
    mswOnly: true,
    mswEndpointFilter: new Set(["memes:getMemes"])
  }
);
