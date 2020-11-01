const HLRU = require('hashlru')
const pull = require('pull-stream')
const getRoot = require('./get-root')
const extend = require('xtend')

module.exports = function LookupRoots ({ ssb, cache }) {
  cache = cache || HLRU(100)
  return pull.asyncMap((msg, cb) => {
    getRootMsg(msg, { ssb, cache }, (_, root) => {
      if (root && root.key !== msg.key) {
        cb(null, extend(msg, {
          rootId: msg.key, root
        }))
      } else {
        cb(null, extend(msg, { rootId: msg.key }))
      }
    })
  })
}

function getRootMsg (msg, { ssb = null, cache = null, visited = null }, cb) {
  visited = visited || new Set()
  visited.add(msg.key)

  const rootId = getRoot(msg)
  if (!rootId) {
    // we found the root!
    return cb(null, msg)
  } else {
    getThruCache(rootId, { ssb, cache }, (_, root) => {
      // HACK: the second one (type + root) is for backwards compatibility
      if (msg.value.content.fork || (msg.value.content.root && msg.value.content.type === 'post')) {
        // this message is a forked root
        return cb(null, root)
      } else if (visited.has(root.key)) {
        // recursion detected, abort!
        return cb(null, msg)
      } else {
        // go deeper
        getRootMsg(root, { ssb, cache, visited }, cb)
      }
    })
  }
}

function getThruCache (key, { ssb, cache }, cb) {
  if (cache.has(key)) {
    cb(null, cache.get(key))
  } else {
    // don't do an ooo lookup
    ssb.get({ id: key, raw: true, private: true }, (_, value) => {
      const msg = { key, value }
      if (msg.value) {
        cache.set(key, msg)
      }
      cb(null, msg)
    })
  }
}
