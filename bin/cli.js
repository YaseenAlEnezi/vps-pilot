#!/usr/bin/env node

const { program } = require('commander');
const { run } = require('../lib/wizard');

program
  .name('vps-pilot')
  .description('Setup wizard for VPS: configure projects, deploy scripts, PM2, and nginx')
  .action(async () => {
    await run();
  });

program.parse();
