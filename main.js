'use strict';

module.exports = {
  load () {
    // execute when package loaded
  },

  unload () {
    // execute when package unloaded
  },

  // register your ipc messages here
  messages: {
    'open' () {
      // open entry panel registered in package.json
      Editor.Panel.open('mcp-inspector-bridge');
    },
    'say-hello' () {
      Editor.log('Hello World!');
      // send ipc message to panel
      Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:hello');
    },
    'clicked' () {
      Editor.log('Button clicked!');
    }
  },
};