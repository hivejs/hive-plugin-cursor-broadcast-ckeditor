/** 
 * hive.js 
 * Copyright (C) 2013-2016 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License version 2
 * as published by the Mozilla Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the Mozilla Public License
 * along with this program.  If not, see <https://www.mozilla.org/en-US/MPL/2.0/>.
 */
var co = require('co')
  , through = require('through2')
  , JSONParse = require('json-stream')
  , path = require('path')

module.exports = setup
module.exports.consumes = ['ui', 'broadcast', 'hooks']

function setup(plugin, imports, register) {
  var ui = imports.ui
    , broadcast = imports.broadcast
    , hooks = imports.hooks

  ui.registerModule(path.join(__dirname, 'client.js'))
  ui.registerStylesheet(path.join(__dirname, 'css/index.css'))

  var cursors = {}

  broadcast.registerChannel(new Buffer('cursors'), function(user, document, client, brdcst) {
    co(function*() {
      if((yield models.document.findOne(document)).type !== 'html') return
      if(!cursors[document]) cursors[document] = {}

      var writeAll

      client
      .pipe(JSONParse())
      .pipe(through.obj(function(myCursor, enc, callback) {
        cursors[document][user.id] = myCursor
        var obj = {}
        obj[user.id] = myCursor
        this.push(obj)
        callback()
      }))
      .pipe(writeAll = JSONStringify())
      .pipe(brdcst)
      .pipe(JSONParse())
      .pipe(through.obj(function(broadcastCursors, enc, callback) {
        for(var userId in broadcastCursors) {
          cursors[document][userId] = broadcastCursors[userId]
          if(!broadcastCursors[userId]) delete cursors[document][userId]
        }
        this.push(broadcastCursors)
        callback()
      }))
      .pipe(JSONStringify())
      .pipe(client)

      client.on('close', () => {
        writeAll.write({[user.id]: null})
        delete cursors[document][user.id]
      })

      client.write(JSON.stringify(cursors[document])+'\n')
    })
  })

  register()
}

function JSONStringify() {
  return through.obj(function(buf, enc, cb) {
    this.push(JSON.stringify(buf)+'\n')
    cb()
  })
}
