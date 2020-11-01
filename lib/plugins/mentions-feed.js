'use strict'
const pull = require('pull-stream')
const HLRU = require('hashlru')
const extend = require('xtend')
const pullResume = require('../pull-resume')
const threadSummary = require('../thread-summary')
const LookupRoots = require('../lookup-roots')
const ResolveAbouts = require('../resolve-abouts')
const UniqueRoots = require('../unique-roots')
const Paramap = require('pull-paramap')
const FilterBlocked = require('../filter-blocked')

exports.manifest = {
  latest: 'source',
  roots: 'source'
}

exports.init = function (ssb) {
  // cache mostly just to avoid reading the same roots over and over again
  // not really big enough for multiple refresh cycles
  const cache = HLRU(100)

  return {
    latest: function () {
      const query = [{
        $filter: {
          dest: ssb.id
        }
      }]
      return pull(
        ssb.backlinks.read({ query, live: true, old: false }),
        pull.filter(bumpFilter),
        LookupRoots({ ssb, cache })
      )

      function bumpFilter (msg) {
        return checkBump(msg, { id: ssb.id })
      }
    },
    roots: function ({ reverse, limit, resume }) {
      const filter = {
        dest: ssb.id
      }

      // use resume option if specified
      if (resume) {
        filter.timestamp = reverse ? { $lt: resume } : { $gt: resume }
      }

      const opts = {
        reverse,
        old: true,
        index: 'DTS',
        query: [
          { $filter: filter }
        ]
      }

      return pullResume.source(ssb.backlinks.read(opts), {
        limit,
        getResume: (item) => {
          return item.timestamp
        },
        filterMap: pull(
          // CHECK IF IS MENTION
          pull.filter(bumpFilter),

          // LOOKUP AND ADD ROOTS
          LookupRoots({ ssb, cache }),

          // FILTER BLOCKED (don't bump if author blocked, don't include if root author blocked)
          FilterBlocked([ssb.id], {
            isBlocking: ssb.patchwork.contacts.isBlocking,
            useRootAuthorBlocks: true,
            checkRoot: true
          }),

          // DON'T REPEAT THE SAME THREAD
          UniqueRoots(),

          // MAP ROOT ITEMS
          pull.map(item => {
            const root = item.root || item
            return root
          }),

          // RESOLVE ROOTS WITH ABOUTS
          ResolveAbouts({ ssb }),

          // ADD THREAD SUMMARY
          Paramap((item, cb) => {
            threadSummary(item.key, {
              recentLimit: 3,
              readThread: ssb.patchwork.thread.read,
              bumpFilter,
              recentFilter: bumpFilter,
              pullFilter: FilterBlocked([ssb.id], { isBlocking: ssb.patchwork.contacts.isBlocking })
            }, (err, summary) => {
              if (err) return cb(err)
              cb(null, extend(item, summary, {
                filterResult: undefined,
                rootBump: bumpFilter(item)
              }))
            })
          }, 10)
        )
      })

      function bumpFilter (msg) {
        return checkBump(msg, { id: ssb.id })
      }
    }
  }
}

function checkBump (msg, { id }) {
  if (msg && msg.value && msg.value.author !== id) {
    if (Array.isArray(msg.value.content.mentions) && msg.value.content.mentions.some(mention => {
      return mention && mention.link === id
    })) {
      return 'mention'
    } else if (msg.value.content.type === 'contact' && msg.value.content.following === true && msg.value.content.contact === id) {
      return 'follow'
    }
    // private gathering invite
    if (msg.value.content.type === 'gathering' && Array.isArray(msg.value.content.recps) && msg.value.content.recps.includes(id)) {
      return 'invite'
    }
  }
}
