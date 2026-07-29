import * as migration_20260729_130116_initial from './20260729_130116_initial';

export const migrations = [
  {
    up: migration_20260729_130116_initial.up,
    down: migration_20260729_130116_initial.down,
    name: '20260729_130116_initial'
  },
];
